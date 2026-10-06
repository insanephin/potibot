import asyncio
import logging
import time
from collections import Counter, defaultdict
from functools import partial

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI

from core import channels
from core.playback import refresh_now_playing
from core.queue import merge_queue
from core.spotify import get_spotify_channels, is_spotify_rate_limited
from core.tracks import prune_track_infos
from providers.chzzk.client import ChzzkClient
from providers.spotify.client import SpotifyClient

from .auth import AuthService

logger = logging.getLogger(__name__)

NOW_PLAYING_POLL_SECONDS = 5
LIVE_POLL_SECONDS = 5
CHANNEL_CACHE_SECONDS = 60
TRACK_INFO_PRUNE_HOURS = 24
TRACK_END_GRACE_SECONDS = 1.0


async def lifespan(app: "ApiServer"):
    app.scheduler.add_job(app.update_is_live_data, "interval", seconds=LIVE_POLL_SECONDS)
    app.scheduler.add_job(app.update_now_playing, "interval", seconds=NOW_PLAYING_POLL_SECONDS)
    app.scheduler.add_job(app.cache_channels, "interval", seconds=CHANNEL_CACHE_SECONDS)
    app.scheduler.add_job(prune_track_infos, "interval", hours=TRACK_INFO_PRUNE_HOURS)

    for warm_up in (app.update_is_live_data, app.cache_channels):
        try:
            await warm_up()
        except Exception:
            logger.exception("Startup task %s failed; the scheduled job will retry it.", warm_up.__name__)
    app.scheduler.start()
    logger.info("API server startup tasks completed.")

    yield

    if app.scheduler.running:
        app.scheduler.shutdown(wait=False)
    logger.info("API server shutdown tasks completed.")


class ApiServer(FastAPI):
    def __init__(self, global_set, chzzk: ChzzkClient, spotify: SpotifyClient, *args, **kwargs):
        super().__init__(*args, root_path="/api/", lifespan=lifespan, **kwargs)

        self.auth = AuthService(global_set, chzzk, spotify)
        self.scheduler = AsyncIOScheduler()
        self.chzzk = chzzk
        self.spotify = spotify
        self._playback_locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._track_end_checks: dict[str, asyncio.Task] = {}
        self.dashboard_connections: Counter[str] = Counter()
        self._queue_snapshots: dict[str, tuple[float, dict]] = {}
        self._queue_fetches: dict[str, tuple[float, asyncio.Task]] = {}

    async def update_is_live_data(self) -> None:
        await channels.update_live_channels(self.chzzk)

    async def update_now_playing(self) -> None:
        if await is_spotify_rate_limited():
            return
        watched = await channels.get_live_channels() | set(self.dashboard_connections)
        channel_ids = [channel_id for channel_id in await get_spotify_channels() if channel_id in watched]
        results = await asyncio.gather(
            *(self.refresh_channel_playback(channel_id) for channel_id in channel_ids),
            return_exceptions=True,
        )
        for channel_id, result in zip(channel_ids, results, strict=True):
            if isinstance(result, Exception):
                logger.error("Now-playing refresh failed for %s", channel_id, exc_info=result)

    async def refresh_channel_playback(self, channel_id: str, force: bool = False) -> None:
        async with self._playback_locks[channel_id]:
            state = await refresh_now_playing(channel_id, self.spotify, force=force)
        self._schedule_track_end_check(channel_id, state)

    def _schedule_track_end_check(self, channel_id: str, state: dict | None) -> None:
        if not state or state["paused"] or not state["track_window"] or channel_id in self._track_end_checks:
            return
        remaining = (state["duration"] - state["position"]) / 1000
        if remaining > NOW_PLAYING_POLL_SECONDS:
            return

        async def check_at_track_end():
            await asyncio.sleep(max(0.0, remaining) + TRACK_END_GRACE_SECONDS)
            self._track_end_checks.pop(channel_id, None)
            await self.refresh_channel_playback(channel_id)

        self._track_end_checks[channel_id] = asyncio.create_task(check_at_track_end())

    async def queue_snapshot(self, channel_id: str, since: float = 0.0) -> dict:
        cached = self._queue_snapshots.get(channel_id)
        if cached and cached[0] >= since:
            return cached[1]
        fetch = self._queue_fetches.get(channel_id)
        if not fetch or fetch[0] < since:
            started_at = time.time()
            task = asyncio.create_task(merge_queue(channel_id, self.spotify))
            task.add_done_callback(partial(self._store_queue_snapshot, channel_id, started_at))
            fetch = self._queue_fetches[channel_id] = (started_at, task)
        return await asyncio.shield(fetch[1])

    def last_queue_snapshot(self, channel_id: str) -> dict:
        cached = self._queue_snapshots.get(channel_id)
        return cached[1] if cached else {"queue": [], "cancelled": []}

    def _store_queue_snapshot(self, channel_id: str, started_at: float, task: asyncio.Task) -> None:
        if self._queue_fetches.get(channel_id, (None, None))[1] is task:
            del self._queue_fetches[channel_id]
        if task.cancelled() or task.exception():
            return
        cached = self._queue_snapshots.get(channel_id)
        if not cached or cached[0] < started_at:
            self._queue_snapshots[channel_id] = (started_at, task.result())

    async def cache_channels(self) -> None:
        await channels.cache_channels()
