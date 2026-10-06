import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core.account import delete_account as delete_user_account
from core.account import get_profile, revoke_sessions
from providers.http import HTTPException as ProviderHTTPException

from ..deps import App, CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(tags=["user"])


@router.get("/me")
async def get_user(app: App, user: CurrentUser) -> JSONResponse:
    try:
        data = await get_profile(app.chzzk, user.channel_id)
    except ProviderHTTPException:
        logger.warning("Failed to read Chzzk profile for channel %s", user.channel_id)
        return JSONResponse({"error": "Failed to load the Chzzk profile."}, status_code=502)
    return JSONResponse(data)


@router.post("/logout")
async def logout(user: CurrentUser) -> JSONResponse:
    await revoke_sessions(user.id)
    response = JSONResponse({"message": "Logged out."})
    response.delete_cookie("token", httponly=True, secure=True, samesite="lax")
    return response


@router.delete("/me")
async def delete_account(app: App, user: CurrentUser) -> JSONResponse:
    await delete_user_account(app.chzzk, user)
    response = JSONResponse({"message": "Account deleted."})
    response.delete_cookie("token", httponly=True, secure=True, samesite="lax")
    return response
