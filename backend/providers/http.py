import asyncio
import logging
import time
from functools import wraps
from typing import Any

import aiohttp
from aiohttp import ClientError, ContentTypeError

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=10)


def token_fields(token: Any) -> dict[str, Any]:
    return {
        "access_token": getattr(token, "accessToken", None) or getattr(token, "access_token", None),
        "refresh_token": getattr(token, "refreshToken", None) or getattr(token, "refresh_token", None),
        "token_type": getattr(token, "tokenType", None) or getattr(token, "token_type", None),
        "expires_in": getattr(token, "expiresIn", None) or getattr(token, "expires_in", None),
        "scope": getattr(token, "scope", None),
    }


class HTTPException(Exception):
    def __init__(self, code: int, message: Any, retry_after: float | None = None):
        super().__init__(f"HTTP {code}: {message}")
        self.code = code
        self.message = message
        self.retry_after = retry_after


def _retry_after(response: aiohttp.ClientResponse) -> float | None:
    if response.status != 429:
        return None
    try:
        return float(response.headers.get("Retry-After", ""))
    except ValueError:
        return None


class HttpClient:
    def __init__(
        self,
        base_url: str,
        client_id: str | None = None,
        client_secret: str | None = None,
        redirect_uri: str | None = None,
        content_type: str = "application/json",
    ):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.base_headers = {"Content-Type": content_type}

        self.session: aiohttp.ClientSession | None = None
        self._refresh_lock: asyncio.Lock | None = None
        self._refreshed_tokens: dict[str, tuple[Any, float]] = {}
        self.on_token_refreshed = None
        self.on_refresh_rejected = None

    @property
    def refresh_lock(self) -> asyncio.Lock:
        if self._refresh_lock is None:
            self._refresh_lock = asyncio.Lock()
        return self._refresh_lock

    async def start(self) -> None:
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(headers=self.base_headers, timeout=REQUEST_TIMEOUT)

    async def close(self) -> None:
        if self.session and not self.session.closed:
            await self.session.close()
            self.session = None

    async def _request_wrapper(self, method: str, endpoint: str, use_base: bool = True, **kwargs) -> Any:
        if not self.session or self.session.closed:
            await self.start()

        url = f"{self.base_url}/{endpoint.lstrip('/')}" if use_base else endpoint
        logger.debug("Request: %s %s | Params: %s", method, url, kwargs.get("params", {}))

        try:
            async with self.session.request(method, url, **kwargs) as response:
                if response.status == 204:
                    return None
                try:
                    data = await response.json()
                except ContentTypeError:
                    text = await response.text()
                    if 200 <= response.status < 300:
                        return text or None
                    logger.error("Non-JSON error response (HTTP %s): %s", response.status, text[:200])
                    raise HTTPException(
                        response.status, text or response.reason or "Request failed", _retry_after(response)
                    ) from None

                code = data.get("code", response.status) if isinstance(data, dict) else response.status

                if 200 <= response.status < 300 and (isinstance(code, int) and 200 <= code < 300):
                    return data.get("content", data) if isinstance(data, dict) else data

                error_msg = data.get("message", data) if isinstance(data, dict) else data
                raise HTTPException(code, error_msg, _retry_after(response))

        except ClientError as e:
            logger.exception("Failed HTTP request: %s", e)
            raise HTTPException(500, f"Client Error: {e}") from e
        except TimeoutError as e:
            logger.warning("HTTP request timed out: %s %s", method, url)
            raise HTTPException(504, "Request timed out") from e

    async def get(self, endpoint: str, **kwargs) -> Any:
        return await self._request_wrapper("GET", endpoint, **kwargs)

    async def post(self, endpoint: str, **kwargs) -> Any:
        return await self._request_wrapper("POST", endpoint, **kwargs)

    async def put(self, endpoint: str, **kwargs) -> Any:
        return await self._request_wrapper("PUT", endpoint, **kwargs)

    async def refresh_access_token(self, refresh_token: str, user_id=None) -> dict:
        raise NotImplementedError("Subclasses must implement this method.")

    def is_refresh_rejected(self, error: HTTPException) -> bool:
        return False

    async def _reject_refresh_token(self, user_id=None, provider=None, refresh_token=None) -> None:
        if self.on_refresh_rejected is not None and user_id and provider:
            await self.on_refresh_rejected(user_id=user_id, provider=provider, refresh_token=refresh_token)

    async def _persist_refreshed_token(self, user_id=None, provider=None, refresh_token=None, new_token=None) -> None:
        if self.on_token_refreshed is None:
            return

        fields = token_fields(new_token)
        if not fields["access_token"]:
            return

        await self.on_token_refreshed(
            user_id=user_id,
            provider=provider,
            **{**fields, "refresh_token": fields["refresh_token"] or refresh_token},
        )

    async def _refresh_token_once(self, refresh_token: str, user_id=None) -> dict:
        if not refresh_token:
            raise ValueError("Refresh token is required for token renewal.")

        cached = self._refreshed_tokens.get(refresh_token)
        if cached and cached[1] > time.monotonic():
            return cached[0]
        self._refreshed_tokens.pop(refresh_token, None)

        async with self.refresh_lock:
            cached = self._refreshed_tokens.get(refresh_token)
            if cached and cached[1] > time.monotonic():
                return cached[0]
            self._refreshed_tokens.pop(refresh_token, None)

            refreshed = await self.refresh_access_token(refresh_token, user_id=user_id)
            fields = token_fields(refreshed)
            if not fields["access_token"]:
                raise ValueError("Refresh token response did not include an access token.")

            cache_seconds = min(max((fields["expires_in"] or 5) - 30, 1), 30)
            self._refreshed_tokens[refresh_token] = (
                refreshed,
                time.monotonic() + cache_seconds,
            )
            return refreshed

    @staticmethod
    def auto_refresh_auth(func):
        @wraps(func)
        async def wrapper(self: "HttpClient", *args, **kwargs):
            access_token = args[0] if args else kwargs.get("access_token")
            refresh_token = kwargs.get("refresh_token")
            user_id = kwargs.get("user_id")
            provider = kwargs.get("provider")
            token_updated = kwargs.pop("_token_updated", None)
            kwargs.pop("_refresh_attempted", None)

            if not access_token:
                raise ValueError("Access token is required for this operation.")

            headers = {
                **self.base_headers,
                "Authorization": f"Bearer {access_token}",
            }
            retry_kwargs = {
                key: value for key, value in kwargs.items() if key not in {"refresh_token", "user_id", "provider"}
            }
            retry_kwargs["headers"] = headers

            try:
                return await func(self, *args, **retry_kwargs)
            except HTTPException as e:
                if e.code == 401 and refresh_token:
                    try:
                        refreshed_token = await self._refresh_token_once(refresh_token, user_id=user_id)
                    except HTTPException as refresh_error:
                        if not self.is_refresh_rejected(refresh_error):
                            raise
                        await self._reject_refresh_token(user_id, provider, refresh_token)
                        raise HTTPException(401, "Reauthentication required") from refresh_error
                    fields = token_fields(refreshed_token)
                    new_access_token = fields["access_token"]
                    await self._persist_refreshed_token(
                        user_id=user_id,
                        provider=provider,
                        refresh_token=refresh_token,
                        new_token=refreshed_token,
                    )

                    if token_updated is not None:
                        await token_updated(new_access_token, fields["refresh_token"] or refresh_token)

                    retry_kwargs["headers"] = {
                        **self.base_headers,
                        "Authorization": f"Bearer {new_access_token}",
                    }
                    retry_args = (new_access_token, *args[1:]) if args else args

                    return await func(
                        self,
                        *retry_args,
                        **retry_kwargs,
                    )

                raise

        return wrapper
