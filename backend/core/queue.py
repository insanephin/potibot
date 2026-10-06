import json
import logging
import time
from uuid import uuid4

from sqlalchemy import select

from database.db import async_session, rd_client
from database.models import Playback
from providers.http import HTTPException

from .keys import NOW_PLAYING_KEY, PUSHED_QUEUE_KEY, SPOTIFY_QUEUE_SYNC_LOCK_KEY
from .settings import find_preferred_device, get_settings, update_settings
from .song_requests import get_pending_playbacks, mark_playbacks_played
from .spotify import (
    PUSH_SETTLE_SECONDS,
    is_device_switching,
    is_spotify_rate_limited,
    mark_device_switch,
    pause_for_rate_limit,
    spotify_request_context,
)
from .tracks import get_track_infos

logger = logging.getLogger(__name__)

QUEUE_EVENTS = {"added", "removed", "queue_changed"}
SPOTIFY_QUEUE_SYNC_LOCK_SECONDS = 60
SPOTIFY_QUEUE_VISIBLE_LIMIT = 20


async def publish_queue_event(channel_id: str, event: str, **extra) -> None:
    payload = {"event": event, "at": time.time(), **extra}
    await rd_client.publish(NOW_PLAYING_KEY.format(channel_id=channel_id), json.dumps(payload))


async def sync_spotify_queue(channel_id: str, spotify) -> dict:
    lock_key = SPOTIFY_QUEUE_SYNC_LOCK_KEY.format(channel_id=channel_id)
    lock_value = str(uuid4())
    acquired = await rd_client.set(lock_key, lock_value, nx=True, ex=SPOTIFY_QUEUE_SYNC_LOCK_SECONDS)
    if not acquired:
        return {"status": "already_running", "added": []}

    try:
        spotify_context = await spotify_request_context(channel_id)
        if not spotify_context:
            return {"status": "not_connected", "added": []}
        access_token, request_context = spotify_context

        pending = await get_pending_playbacks(channel_id)
        devices = await spotify.get_user_devices(access_token, **request_context)
        active_device = next((item for item in devices if item.get("is_active")), None)
        if not active_device:
            preferred = (await get_settings(channel_id))["preferred_device"]
            active_device = find_preferred_device(devices, preferred) if pending else None
            if not active_device:
                return {"status": "no_active_device", "added": []}
            await mark_device_switch(channel_id)
            await spotify.transfer_playback(access_token, active_device["id"], **request_context)
            if active_device["id"] != preferred["id"]:
                await update_settings(channel_id, {"preferred_device": active_device})

        spotify_queue = await spotify.get_user_queue(access_token, **request_context)
        live_uris = {track.uri for track in spotify_queue.queue if track and track.uri}
        if spotify_queue.currently_playing and spotify_queue.currently_playing.uri:
            live_uris.add(spotify_queue.currently_playing.uri)

        pushed_key = PUSHED_QUEUE_KEY.format(channel_id=channel_id)
        pushed_at = await rd_client.hgetall(pushed_key)
        switching = await is_device_switching(channel_id)
        truncated = len(spotify_queue.queue) >= SPOTIFY_QUEUE_VISIBLE_LIMIT
        latest_visible_push = max((float(pushed_at[uri]) for uri in live_uris if uri in pushed_at), default=None)
        now = time.time()
        added: list[str] = []
        consumed: list[str] = []
        for playback in pending:
            uri = playback.track_uri
            if uri in live_uris:
                continue
            if uri in pushed_at:
                pushed = float(pushed_at[uri])
                passed = not truncated or (latest_visible_push is not None and latest_visible_push > pushed)
                if not switching and passed and now - pushed >= PUSH_SETTLE_SECONDS:
                    consumed.append(uri)
                continue
            await spotify.add_item_to_queue(
                access_token,
                uri,
                active_device["id"],
                **request_context,
            )
            await rd_client.hset(pushed_key, uri, now)
            live_uris.add(uri)
            added.append(uri)

        await mark_playbacks_played(channel_id, consumed)
        if added or consumed:
            await publish_queue_event(channel_id, "queue_changed")
        return {"status": "synced", "added": added, "consumed": consumed, "queue_size": len(live_uris)}
    except HTTPException as error:
        if error.code == 401:
            logger.warning("Spotify authorization requires reauthentication for channel %s", channel_id)
            return {"status": "reauth_required", "added": []}
        if error.code == 429:
            await pause_for_rate_limit(error)
        logger.exception("Failed to synchronize Spotify queue for channel %s", channel_id)
        return {"status": "failed", "added": []}
    except Exception:
        logger.exception("Failed to synchronize Spotify queue for channel %s", channel_id)
        return {"status": "failed", "added": []}
    finally:
        if await rd_client.get(lock_key) == lock_value:
            await rd_client.delete(lock_key)


async def dashboard_playback(channel_id: str) -> dict:
    async with async_session() as session:
        playbacks = (
            (
                await session.execute(
                    select(Playback)
                    .where(Playback.channel_id == channel_id, Playback.is_played.is_(False))
                    .order_by(Playback.added_at.asc(), Playback.id.asc())
                )
            )
            .scalars()
            .all()
        )
    return {
        "queue": {pb.track_uri: pb.requester_name for pb in playbacks if not pb.is_cancelled},
        "cancelled": [pb.track_uri for pb in playbacks if pb.is_cancelled],
    }


async def merge_queue(channel_id: str, spotify) -> dict[str, list[dict]]:
    spotify_context = await spotify_request_context(channel_id)
    if not spotify_context:
        logger.warning("Missing Spotify access token for channel %s.", channel_id)
        return {"queue": [], "cancelled": []}
    access_token, request_context = spotify_context
    if await is_spotify_rate_limited():
        raise HTTPException(429, "Spotify rate limit cool-down")

    try:
        user_queue = (await spotify.get_user_queue(access_token, **request_context)).model_dump()["queue"]
    except HTTPException as error:
        if error.code == 429:
            await pause_for_rate_limit(error)
        raise
    channel_queue = await dashboard_playback(channel_id)
    queue = channel_queue["queue"]
    cancelled = set(channel_queue["cancelled"])

    filtered_queue = []
    queued_uris = set()
    for track in user_queue:
        uri = track.get("uri")
        if not uri or uri in cancelled or uri in queued_uris:
            continue
        track["requester_name"] = queue.get(uri)
        filtered_queue.append(track)
        queued_uris.add(uri)

    unqueued = [(uri, name) for uri, name in queue.items() if uri not in queued_uris and uri not in cancelled]
    infos = await get_track_infos([uri for uri, _ in unqueued])
    for (uri, requester_name), (track_info, name) in zip(unqueued, infos, strict=True):
        image_url = track_info.get("image_url")
        filtered_queue.append(
            {
                "uri": uri,
                "name": track_info.get("name") or name or "신청곡",
                "artists": [{"name": artist} for artist in track_info.get("artists", [])],
                "album": {"name": "", "images": [{"url": image_url}] if image_url else []},
                "duration_ms": track_info.get("duration_ms") or 0,
                "requester_name": requester_name or "신청자 알 수 없음",
            }
        )

    return {"queue": filtered_queue, "cancelled": list(cancelled)}
