import logging
import re
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response

from core.spotify import get_spotify_token_context
from core.spotify_account import (
    cancel_access_request,
    delete_spotify_app,
    disconnect_spotify,
    get_access_request,
    get_spotify_app,
    request_access,
    save_spotify_app,
)
from core.token import load_spotify_app
from database.models import SpotifyAccessRequest, User
from providers.http import HTTPException as ProviderHTTPException

from ..auth import SpotifyAccessRequired
from ..deps import App, CurrentUser, is_extension_redirect
from ..schemas import ExtensionLoginComplete, ExtensionLoginStart
from ..server import ApiServer

logger = logging.getLogger(__name__)

SPOTIFY_CREDENTIAL_PATTERN = re.compile(r"^[0-9a-f]{32}$")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SPOTIFY_SCOPES = (
    "user-read-private",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
)

router = APIRouter(prefix="/spotify", tags=["spotify"])

JsonObject = Annotated[dict, Body()]


async def authorize_url(app: ApiServer, user: User, extension_redirect: str | None = None) -> str:
    credentials = await load_spotify_app(str(user.id))
    state = await app.auth.create_state("spotify", user.id, extension_redirect)
    return "https://accounts.spotify.com/authorize?" + urlencode(
        {
            "client_id": credentials[0] if credentials else app.spotify.client_id,
            "response_type": "code",
            "redirect_uri": app.spotify.redirect_uri,
            "scope": " ".join(SPOTIFY_SCOPES),
            "state": state,
            "show_dialog": "true",
        }
    )


def access_request_json(request: SpotifyAccessRequest) -> dict:
    return {
        "email": request.email,
        "status": request.status,
        "requested_at": request.requested_at.isoformat() if request.requested_at else None,
    }


@router.get("/account")
async def account(app: App, user: CurrentUser) -> JSONResponse:
    token_context = await get_spotify_token_context(user.channel_id)
    if not token_context or not token_context[1].access_token:
        return JSONResponse({"connected": False})
    user_id, auth_token = token_context
    try:
        account = await app.spotify.get_account_info(
            auth_token.access_token,
            refresh_token=auth_token.refresh_token,
            user_id=str(user_id),
            provider="spotify",
        )
    except (ProviderHTTPException, ValueError):
        logger.warning("Failed to read Spotify account for channel %s", user.channel_id)
        return JSONResponse({"connected": True, "reauth_required": True})
    return JSONResponse({"connected": True, "display_name": account.display_name, "product": account.product})


@router.delete("/account")
async def disconnect(user: CurrentUser) -> JSONResponse:
    await disconnect_spotify(user)
    return JSONResponse({"message": "Spotify disconnected."})


@router.get("/app")
async def get_app_credentials(app: App, user: CurrentUser) -> JSONResponse:
    spotify_app = await get_spotify_app(user)
    return JSONResponse(
        {
            "configured": spotify_app is not None,
            "client_id": spotify_app.client_id if spotify_app else None,
            "redirect_uri": app.spotify.redirect_uri,
        }
    )


@router.put("/app")
async def save_app_credentials(app: App, body: JsonObject, user: CurrentUser) -> JSONResponse:
    client_id = str(body.get("client_id", "")).strip().lower()
    client_secret = str(body.get("client_secret", "")).strip().lower()
    if not SPOTIFY_CREDENTIAL_PATTERN.match(client_id) or not SPOTIFY_CREDENTIAL_PATTERN.match(client_secret):
        return JSONResponse({"error": "invalid_format"}, status_code=400)
    try:
        await app.spotify.get_client_credentials((client_id, client_secret))
    except ProviderHTTPException:
        return JSONResponse({"error": "invalid_credentials"}, status_code=400)

    await save_spotify_app(user, client_id, client_secret)
    return JSONResponse({"configured": True, "client_id": client_id, "redirect_uri": app.spotify.redirect_uri})


@router.delete("/app")
async def delete_app_credentials(app: App, user: CurrentUser) -> JSONResponse:
    await delete_spotify_app(user)
    return JSONResponse({"configured": False, "client_id": None, "redirect_uri": app.spotify.redirect_uri})


@router.get("/access")
async def access(user: CurrentUser) -> JSONResponse:
    request = await get_access_request(user)
    return JSONResponse(access_request_json(request) if request else {"status": "none"})


@router.post("/access")
async def access_request(body: JsonObject, user: CurrentUser) -> JSONResponse:
    email = str(body.get("email", "")).strip()
    if len(email) > 254 or not EMAIL_PATTERN.match(email):
        return JSONResponse({"error": "Invalid email."}, status_code=400)

    access_request = await request_access(user, email)
    logger.info("Spotify access requested by channel %s", user.channel_id)
    return JSONResponse(access_request_json(access_request))


@router.delete("/access")
async def access_cancel(user: CurrentUser) -> JSONResponse:
    await cancel_access_request(user)
    return JSONResponse({"status": "none"})


@router.get("/login")
async def login(app: App, user: CurrentUser) -> RedirectResponse:
    return RedirectResponse(url=await authorize_url(app, user))


@router.get("/callback")
async def callback(
    app: App, request: Request, state: str, code: str | None = None, error: str | None = None
) -> Response:
    if extension_redirect := await app.auth.get_extension_redirect(state):
        params = {"code": code} if code else {"error": error or "missing_code"}
        return RedirectResponse(url=f"{extension_redirect}?{urlencode({**params, 'state': state})}")

    user = await app.auth.verify_user(request.cookies.get("token"))
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or missing JWT token. Please log in again.")
    if not code:
        return RedirectResponse(url="/dashboard")
    if not await app.auth.consume_state(state, "spotify", user.id):
        return JSONResponse({"error": "Invalid or expired state parameter."}, status_code=400)

    try:
        await app.auth.complete_spotify_login(user, code)
    except SpotifyAccessRequired as error:
        reason = "app_forbidden" if error.own_app else "access_required"
        return RedirectResponse(url=f"/dashboard?spotify={reason}")
    except Exception:
        logger.exception("Failed to complete Spotify login.")
        return JSONResponse({"error": "Failed to complete Spotify login."}, status_code=502)

    return RedirectResponse(url="/dashboard")


@router.post("/extension/login")
async def extension_login(app: App, body: ExtensionLoginStart, user: CurrentUser) -> JSONResponse:
    if not is_extension_redirect(app, body.redirect_uri):
        return JSONResponse({"error": "Invalid redirect URI."}, status_code=400)
    return JSONResponse({"url": await authorize_url(app, user, body.redirect_uri)})


@router.post("/extension/complete")
async def extension_complete(app: App, body: ExtensionLoginComplete, user: CurrentUser) -> JSONResponse:
    if not await app.auth.consume_state(body.state, "spotify", user.id):
        return JSONResponse({"error": "Invalid or expired state parameter."}, status_code=400)
    try:
        await app.auth.complete_spotify_login(user, body.code)
    except SpotifyAccessRequired as error:
        reason = "app_forbidden" if error.own_app else "access_required"
        return JSONResponse({"error": reason}, status_code=403)
    except Exception:
        logger.exception("Failed to complete Spotify login from the extension.")
        return JSONResponse({"error": "Failed to complete Spotify login."}, status_code=502)
    return JSONResponse({"message": "Spotify connected."})
