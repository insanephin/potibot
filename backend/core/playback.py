import json
import logging
import time

from database.db import rd_client
from providers.http import HTTPException

from .keys import CANCELLED_PUSHED_KEY, NOW_PLAYING_KEY
from .queue import publish_queue_event, sync_spotify_queue
from .song_requests import get_pending_playbacks, has_pending_request, mark_playbacks_played
from .spotify import is_device_switching, mark_device_switch, pause_for_rate_limit, spotify_request_context

logger = logging.getLogger(__name__)

SEEK_TOLERANCE_MS = 3000
CANCELLED_SKIP_WINDOW_SECONDS = 6 * 60 * 60


def build_playback_state(player: dict | None) -> dict:
    player = player or {}
    device = player.get("device")
    item = player.get("item")
    state = {
        "event": "playback_update",
        "device": {key: device.get(key) for key in ("id", "name", "type")} if device else None,
        "paused": not player.get("is_playing", False) if item else True,
        "position": (player.get("progress_ms") or 0) if item else 0,
        "duration": (item.get("duration_ms") or 0) if item else 0,
        "track_window": None,
    }
    if item:
        album = item.get("album") or {}
        state["track_window"] = {
            "current_track": {
                "id": item.get("id"),
                "uri": item.get("uri"),
                "name": item.get("name"),
                "duration_ms": item.get("duration_ms") or 0,
                "artists": [{"name": artist.get("name")} for artist in item.get("artists", [])],
                "album": {"name": album.get("name"), "images": album.get("images", [])},
            }
        }
    return state


def stamp_for_client(state: dict) -> dict:
    return {**state, "server_time": time.time()}


def current_track_uri(state: dict | None) -> str | None:
    return (((state or {}).get("track_window") or {}).get("current_track") or {}).get("uri")


def playback_changed(previous: dict | None, current: dict, elapsed_ms: float) -> bool:
    if not previous:
        return True
    if (
        current_track_uri(previous) != current_track_uri(current)
        or previous.get("paused") != current["paused"]
        or (previous.get("device") or {}).get("id") != (current.get("device") or {}).get("id")
    ):
        return True
    expected = previous.get("position", 0) + (0 if previous.get("paused") else elapsed_ms)
    return abs(current["position"] - expected) > SEEK_TOLERANCE_MS


async def get_stored_playback(channel_id: str) -> dict | None:
    stored = await rd_client.get(NOW_PLAYING_KEY.format(channel_id=channel_id))
    return json.loads(stored) if stored else None


async def refresh_now_playing(channel_id: str, spotify, force: bool = False) -> dict | None:
    spotify_context = await spotify_request_context(channel_id)
    if not spotify_context:
        return None
    access_token, request_context = spotify_context
    try:
        player = await spotify.get_playback_state(access_token, **request_context)
    except HTTPException as error:
        if error.code == 429:
            await pause_for_rate_limit(error)
        logger.warning("Failed to read Spotify player for channel %s: %s", channel_id, error)
        return None

    key = NOW_PLAYING_KEY.format(channel_id=channel_id)
    stored = await rd_client.get(key)
    previous = json.loads(stored) if stored else None
    now = time.time()
    state = build_playback_state(player)
    changed = playback_changed(previous, state, (now - previous.get("fetched_at", now)) * 1000 if previous else 0)
    state["fetched_at"] = now
    uri = current_track_uri(state)
    previous_uri = (previous or {}).get("last_track_uri") or current_track_uri(previous)
    state["last_track_uri"] = uri or previous_uri
    previous_device = ((previous or {}).get("device") or {}).get("id")
    device = (state.get("device") or {}).get("id")
    if previous and previous_device != device:
        await mark_device_switch(channel_id)
    await rd_client.set(key, json.dumps(state))
    if changed or force:
        await rd_client.publish(key, json.dumps(state))

    if uri and previous_uri and previous_uri != uri and not await is_device_switching(channel_id):
        await mark_playbacks_played(channel_id, [previous_uri])
        await sync_spotify_queue(channel_id, spotify)
        await publish_queue_event(channel_id, "queue_changed")
    elif device and not previous_device and await get_pending_playbacks(channel_id):
        if (await sync_spotify_queue(channel_id, spotify))["added"]:
            await publish_queue_event(channel_id, "queue_changed")

    if uri and not state["paused"]:
        cancelled_key = CANCELLED_PUSHED_KEY.format(channel_id=channel_id)
        cancelled_at = await rd_client.hget(cancelled_key, uri)
        if (
            cancelled_at
            and await rd_client.hdel(cancelled_key, uri)
            and now - float(cancelled_at) < CANCELLED_SKIP_WINDOW_SECONDS
            and not await has_pending_request(channel_id, uri)
        ):
            try:
                await spotify.skip_to_next(access_token, **request_context)
            except HTTPException:
                logger.warning("Failed to skip cancelled request on channel %s", channel_id)
    return state
