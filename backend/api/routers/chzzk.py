import logging
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response

from core.channels import get_info_by_channel_id

from ..auth import AUTH_STATE_TTL_SECONDS
from ..deps import App, is_extension_redirect
from ..schemas import ExtensionLoginComplete, ExtensionLoginStart
from ..server import ApiServer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chzzk", tags=["chzzk"])
STATE_COOKIE = "chzzk_oauth_state"


async def authorize_url(app: ApiServer, extension_redirect: str | None = None) -> tuple[str, str]:
    state = await app.auth.create_state("chzzk", extension_redirect=extension_redirect)
    url = (
        "https://chzzk.naver.com/account-interlock"
        f"?clientId={app.chzzk.client_id}"
        f"&redirectUri={app.chzzk.redirect_uri}"
        f"&state={state}"
    )
    return url, state


@router.get("/channel")
async def channel(request: Request) -> JSONResponse:
    user_data = await get_info_by_channel_id(request.query_params.get("channel_id"))
    if not user_data:
        return JSONResponse({"error": "User not found."}, status_code=404)

    return JSONResponse(user_data)


@router.get("/login")
async def login(app: App, request: Request) -> RedirectResponse:
    user = await app.auth.verify_user(request.cookies.get("token"))
    if user:
        return RedirectResponse(url="/")

    url, state = await authorize_url(app)
    response = RedirectResponse(url=url)
    response.set_cookie(
        key=STATE_COOKIE, value=state, max_age=AUTH_STATE_TTL_SECONDS, httponly=True, secure=True, samesite="lax"
    )
    return response


@router.get("/callback")
async def callback(app: App, request: Request, code: str, state: str) -> Response:
    if extension_redirect := await app.auth.get_extension_redirect(state):
        return RedirectResponse(url=f"{extension_redirect}?{urlencode({'code': code, 'state': state})}")
    if not secrets.compare_digest(request.cookies.get(STATE_COOKIE, ""), state):
        return JSONResponse({"error": "Login was started in another browser. Please log in again."}, status_code=400)
    if not await app.auth.consume_state(state, "chzzk"):
        return JSONResponse({"error": "Invalid or expired state parameter."}, status_code=400)

    try:
        token = await app.auth.complete_chzzk_login(code, state)
    except Exception:
        logger.exception("Failed to complete Chzzk login.")
        return JSONResponse({"error": "Failed to complete Chzzk login."}, status_code=502)

    response = RedirectResponse(url="/")
    response.set_cookie(key="token", value=token, httponly=True, secure=True, samesite="lax")
    response.delete_cookie(STATE_COOKIE, httponly=True, secure=True, samesite="lax")
    return response


@router.post("/extension/login")
async def extension_login(app: App, body: ExtensionLoginStart) -> Response:
    if not is_extension_redirect(app, body.redirect_uri):
        return JSONResponse({"error": "Invalid redirect URI."}, status_code=400)
    url, _state = await authorize_url(app, body.redirect_uri)
    return JSONResponse({"url": url})


@router.post("/extension/complete")
async def extension_complete(app: App, body: ExtensionLoginComplete) -> Response:
    if not await app.auth.consume_state(body.state, "chzzk"):
        return JSONResponse({"error": "Invalid or expired state parameter."}, status_code=400)
    try:
        token = await app.auth.complete_chzzk_login(body.code, body.state)
    except Exception:
        logger.exception("Failed to complete Chzzk login from the extension.")
        return JSONResponse({"error": "Failed to complete Chzzk login."}, status_code=502)
    return JSONResponse({"token": token})
