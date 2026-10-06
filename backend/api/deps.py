import re
from typing import Annotated

from fastapi import Depends, HTTPException, Request, WebSocket, WebSocketException
from fastapi.requests import HTTPConnection
from fastapi.security import APIKeyCookie, HTTPAuthorizationCredentials, HTTPBearer

from database.models import User

from .server import ApiServer

WS_AUTH_PROTOCOL = "potibot"
EXTENSION_REDIRECT_PATTERN = re.compile(r"^https://(?P<id>[a-p]{32})\.chromiumapp\.org/[^\s?#]*$")

cookie_scheme = APIKeyCookie(name="token", auto_error=False)
bearer_scheme = HTTPBearer(auto_error=False)


def get_app(connection: HTTPConnection) -> ApiServer:
    return connection.app


def is_extension_redirect(app: ApiServer, uri: str) -> bool:
    match = EXTENSION_REDIRECT_PATTERN.match(uri)
    return bool(match) and (not app.auth.extension_ids or match["id"] in app.auth.extension_ids)


async def get_current_user(
    request: Request,
    token: Annotated[str | None, Depends(cookie_scheme)],
    bearer: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    user = await request.app.auth.verify_user(bearer.credentials if bearer else token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or missing JWT token. Please log in again.")
    return user


def websocket_auth_protocol(websocket: WebSocket) -> str | None:
    protocols = websocket.scope.get("subprotocols") or []
    if len(protocols) == 2 and protocols[0] == WS_AUTH_PROTOCOL:
        return protocols[1]
    return None


async def get_current_user_ws(websocket: WebSocket) -> User:
    token = websocket_auth_protocol(websocket) or websocket.cookies.get("token")
    user = await websocket.app.auth.verify_user(token)
    if not user:
        raise WebSocketException(code=1008, reason="Invalid or missing JWT token. Please log in again.")
    return user


App = Annotated[ApiServer, Depends(get_app)]
CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentUserWs = Annotated[User, Depends(get_current_user_ws)]
