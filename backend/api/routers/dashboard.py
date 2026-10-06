import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core.channels import dashboard_state, register_streamer
from core.queue import publish_queue_event
from core.settings import get_settings, update_settings
from core.song_requests import cancel_request, get_requests

from ..deps import App, CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.post("/register")
async def register(app: App, user: CurrentUser) -> JSONResponse:
    try:
        await register_streamer(app.chzzk, user.id)
    except Exception:
        logger.exception("Failed to register streamer.")
        return JSONResponse({"error": "Failed to register streamer."}, status_code=502)

    await app.cache_channels()
    return JSONResponse({"message": "Streamer registered successfully."})


@router.get("/state")
async def state(user: CurrentUser) -> JSONResponse:
    data = await dashboard_state(user.channel_id)
    if not data:
        return JSONResponse({"error": "Channel not found"}, status_code=404)
    return JSONResponse(data)


@router.get("/requests")
async def requests(user: CurrentUser, view: str = "pending") -> JSONResponse:
    if view not in {"pending", "history"}:
        return JSONResponse({"error": "view must be 'pending' or 'history'."}, status_code=400)
    return JSONResponse(await get_requests(user.channel_id, view))


@router.delete("/requests/{request_id}")
async def request_cancel(user: CurrentUser, request_id: int) -> JSONResponse:
    playback = await cancel_request(user.channel_id, request_id)
    if not playback:
        return JSONResponse({"error": "Request not found or already finished."}, status_code=404)
    await publish_queue_event(user.channel_id, "removed", track_uri=playback.track_uri)
    return JSONResponse({"message": "Request cancelled."})


@router.get("/settings")
async def settings(user: CurrentUser) -> JSONResponse:
    return JSONResponse(await get_settings(user.channel_id))


@router.patch("/settings")
async def settings_update(user: CurrentUser, changes: dict) -> JSONResponse:
    try:
        settings = await update_settings(user.channel_id, changes)
    except ValueError as error:
        return JSONResponse({"error": str(error)}, status_code=400)
    return JSONResponse(settings)
