import base64
from collections.abc import Awaitable, Callable

from providers.http import HttpClient, HTTPException

from .models import AccessToken, AccountInfo, Tracks, UserQueue

TOKEN_URL = "https://accounts.spotify.com/api/token"


SpotifyCredentials = tuple[str, str]


def basic_auth_headers(client_id: str, client_secret: str) -> dict:
    return {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": f"Basic {base64.b64encode(f'{client_id}:{client_secret}'.encode()).decode()}",
    }


class SpotifyClient(HttpClient):
    def __init__(self, client_id: str, client_secret: str, redirect_uri: str | None = None):
        super().__init__("https://api.spotify.com/v1", client_id, client_secret, redirect_uri)
        self.client_headers = basic_auth_headers(self.client_id, self.client_secret)
        self.credentials_loader: Callable[[str], Awaitable[SpotifyCredentials | None]] | None = None

    async def _request_token(self, payload: dict, credentials: SpotifyCredentials | None = None) -> AccessToken:
        headers = basic_auth_headers(*credentials) if credentials else self.client_headers
        result = await self.post(TOKEN_URL, use_base=False, data=payload, headers=headers)
        return AccessToken.model_validate(result)

    async def get_client_credentials(self, credentials: SpotifyCredentials | None = None) -> AccessToken:
        return await self._request_token({"grant_type": "client_credentials"}, credentials)

    async def get_access_token(self, code: str, credentials: SpotifyCredentials | None = None) -> AccessToken:
        return await self._request_token(
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self.redirect_uri,
            },
            credentials,
        )

    async def refresh_access_token(self, refresh_token: str, user_id=None) -> AccessToken:
        credentials = await self.credentials_loader(str(user_id)) if self.credentials_loader and user_id else None
        return await self._request_token(
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
            credentials,
        )

    def is_refresh_rejected(self, error: HTTPException) -> bool:
        return error.code == 400 and isinstance(error.message, dict) and error.message.get("error") == "invalid_grant"

    @HttpClient.auto_refresh_auth
    async def get_track_by_keyword(self, access_token: str, keyword: str, headers: dict | None = None) -> Tracks:
        params = {
            "q": keyword,
            "type": "track",
            "market": "KR",
            "limit": 5,
        }
        result = await self.get("/search", params=params, headers=headers)
        return Tracks.model_validate(result.get("tracks"))

    @HttpClient.auto_refresh_auth
    async def get_account_info(self, access_token: str, headers: dict | None = None) -> AccountInfo:
        result = await self.get("/me", headers=headers)
        return AccountInfo.model_validate(result)

    @HttpClient.auto_refresh_auth
    async def add_item_to_queue(
        self, access_token: str, track_uri: str, device_id: str, headers: dict | None = None
    ) -> bool:
        params = {
            "uri": track_uri,
            "device_id": device_id,
        }
        await self.post("/me/player/queue", params=params, headers=headers)
        return True

    @HttpClient.auto_refresh_auth
    async def get_user_queue(self, access_token: str, headers: dict | None = None) -> UserQueue:
        result = await self.get("/me/player/queue", headers=headers)
        return UserQueue.model_validate(result)

    @HttpClient.auto_refresh_auth
    async def get_playback_state(self, access_token: str, headers: dict | None = None) -> dict | None:
        return await self.get("/me/player", headers=headers)

    @HttpClient.auto_refresh_auth
    async def skip_to_next(self, access_token: str, headers: dict | None = None) -> None:
        await self.post("/me/player/next", headers=headers)

    @HttpClient.auto_refresh_auth
    async def transfer_playback(self, access_token: str, device_id: str, headers: dict | None = None) -> None:
        await self.put("/me/player", json={"device_ids": [device_id], "play": False}, headers=headers)

    @HttpClient.auto_refresh_auth
    async def get_user_devices(self, access_token: str, headers: dict | None = None) -> list[dict]:
        result = await self.get("/me/player/devices", headers=headers)
        return result.get("devices", [])
