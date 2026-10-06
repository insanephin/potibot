import asyncio
import contextlib
import json
import logging
import time
from collections.abc import AsyncIterable

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect, WebSocketException
from fastapi.sse import EventSourceResponse, ServerSentEvent

from core.channels import is_channel_live
from core.keys import NOW_PLAYING_KEY
from core.playback import get_stored_playback, stamp_for_client
from core.queue import QUEUE_EVENTS, sync_spotify_queue
from database.db import rd_client
from providers.http import HTTPException as ProviderHTTPException

from ..deps import WS_AUTH_PROTOCOL, App, CurrentUserWs, websocket_auth_protocol
from ..schemas import SpotifyWebSocketMessage
from ..server import ApiServer

logger = logging.getLogger(__name__)

LIVE_CHECK_SECONDS = 5.0
SNAPSHOT_MAX_AGE_SECONDS = 10.0

router = APIRouter(prefix="/spotify", tags=["playback"])


def decode_message(data) -> dict:
    if isinstance(data, bytes):
        data = data.decode()
    return json.loads(data) if isinstance(data, str) else data


async def queue_payload(app: ApiServer, channel_id: str, since: float, fallback: bool = False) -> dict | None:
    try:
        return {"playback_data": await app.queue_snapshot(channel_id, since)}
    except Exception as error:
        logger.warning("Queue snapshot failed for channel %s: %s", channel_id, error)
        return {"playback_data": app.last_queue_snapshot(channel_id)} if fallback else None


def event_time(payload: dict) -> float:
    return payload.get("at") or time.time()


@router.get("/playback", response_class=EventSourceResponse)
async def playback_events(app: App, request: Request) -> AsyncIterable[ServerSentEvent]:
    channel_id = request.query_params.get("channel_id")
    if not channel_id:
        yield ServerSentEvent(data={"error": "Missing channel_id parameter."})
        return

    channel_key = NOW_PLAYING_KEY.format(channel_id=channel_id)

    async def current_snapshot():
        if (stored := await get_stored_playback(channel_id)) is not None:
            yield ServerSentEvent(data=stamp_for_client(stored))
        if queue := await queue_payload(app, channel_id, time.time() - SNAPSHOT_MAX_AGE_SECONDS):
            yield ServerSentEvent(data=queue)

    live = await is_channel_live(channel_id)
    yield ServerSentEvent(data={"event": "live_status", "live": live})
    if live:
        async for event in current_snapshot():
            yield event

    pubsub = rd_client.pubsub()
    await pubsub.subscribe(channel_key)
    try:
        while True:
            if await request.is_disconnected():
                break

            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=LIVE_CHECK_SECONDS)
            now_live = await is_channel_live(channel_id)
            if now_live != live:
                live = now_live
                yield ServerSentEvent(data={"event": "live_status", "live": live})
                if live:
                    async for event in current_snapshot():
                        yield event
            if not message:
                yield ServerSentEvent(comment="ping")
                continue
            if not live:
                continue

            payload = decode_message(message["data"])
            if payload.get("event") in QUEUE_EVENTS:
                if queue := await queue_payload(app, channel_id, event_time(payload)):
                    yield ServerSentEvent(data=queue)
            elif payload.get("event") == "playback_update":
                yield ServerSentEvent(data=stamp_for_client(payload))
    finally:
        await pubsub.unsubscribe(channel_key)
        await pubsub.close()


@router.websocket("/ws")
async def player_websocket(app: App, websocket: WebSocket, user: CurrentUserWs) -> None:
    await websocket.accept(subprotocol=WS_AUTH_PROTOCOL if websocket_auth_protocol(websocket) else None)
    auth_token = await app.auth.get_spotify_token(user.id)
    if not auth_token:
        await websocket.close(code=1008, reason="Spotify user not found or token expired.")
        return

    channel_id = user.channel_id

    async def send(payload: dict):
        await websocket.send_text(json.dumps(payload))

    async def send_queue(since: float | None = None, **extra):
        reply = since is None
        queue = await queue_payload(app, channel_id, time.time() if reply else since, fallback=reply)
        if queue:
            await send({**queue, **extra})

    async def sync_and_send_queue(_message: SpotifyWebSocketMessage):
        sync_result = await sync_spotify_queue(channel_id, app.spotify)
        await send_queue(state="queue_sync", **sync_result)

    async def initialize(_message: SpotifyWebSocketMessage):
        await send({"access_token": auth_token.access_token})

    async def refresh_token(_message: SpotifyWebSocketMessage):
        try:
            access_token = await app.auth.refresh_spotify_token(user.id)
        except (ProviderHTTPException, ValueError):
            await send(
                {"state": "reauth_required", "error": "Spotify authorization expired. Please reconnect Spotify."}
            )
            return
        await send({"access_token": access_token})

    async def refresh_player(_message: SpotifyWebSocketMessage):
        await app.refresh_channel_playback(channel_id, force=True)

    handlers = {
        "initialize": initialize,
        "request_playlist": lambda _message: send_queue(),
        "sync_queue": sync_and_send_queue,
        "refresh_token": refresh_token,
        "refresh_player": refresh_player,
    }

    channel_key = NOW_PLAYING_KEY.format(channel_id=channel_id)
    pubsub = rd_client.pubsub()
    await pubsub.subscribe(channel_key)
    app.dashboard_connections[channel_id] += 1
    update_task = asyncio.create_task(forward_playback_updates(pubsub, send, send_queue))
    try:
        if (stored := await get_stored_playback(channel_id)) is not None:
            await send(stamp_for_client(stored))
        while True:
            message = SpotifyWebSocketMessage.model_validate_json(await websocket.receive_text())
            handler = handlers.get(message.state)
            if handler:
                await handler(message)
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for channel %s.", channel_id)
    except Exception:
        logger.exception("Unexpected WebSocket error for channel %s.", channel_id)
    finally:
        app.dashboard_connections[channel_id] -= 1
        if app.dashboard_connections[channel_id] <= 0:
            del app.dashboard_connections[channel_id]
        update_task.cancel()
        await pubsub.unsubscribe()
        await pubsub.close()
        with contextlib.suppress(RuntimeError, WebSocketDisconnect, WebSocketException):
            await websocket.close()


async def forward_playback_updates(pubsub, send, send_queue) -> None:
    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        try:
            payload = json.loads(message["data"])
            if payload.get("event") in QUEUE_EVENTS:
                await send_queue(since=event_time(payload))
            elif payload.get("event") == "playback_update":
                await send(stamp_for_client(payload))
        except (WebSocketDisconnect, RuntimeError):
            return
        except Exception:
            logger.exception("Failed to forward a playback update.")
