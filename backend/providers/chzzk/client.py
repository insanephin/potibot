from providers.http import HttpClient

from .models import AccessToken, AccountInfo, ChannelInfo, LiveInfo, Message, SessionCreate


class ChzzkClient(HttpClient):
    def __init__(self, client_id: str, client_secret: str, redirect_uri: str):
        super().__init__("https://openapi.chzzk.naver.com", client_id, client_secret, redirect_uri)
        self.client_headers = {
            **self.base_headers,
            "Client-Id": self.client_id,
            "Client-Secret": self.client_secret,
        }

    async def get_access_token(self, code: str, state: str) -> AccessToken:
        payload = {
            "grantType": "authorization_code",
            "clientId": self.client_id,
            "clientSecret": self.client_secret,
            "code": code,
            "state": state,
        }
        result = await self.post("/auth/v1/token", json=payload)
        return AccessToken.model_validate(result)

    async def refresh_access_token(self, refresh_token: str, user_id=None) -> AccessToken:
        payload = {
            "grantType": "refresh_token",
            "refreshToken": refresh_token,
            "clientId": self.client_id,
            "clientSecret": self.client_secret,
        }
        result = await self.post("/auth/v1/token", json=payload)
        return AccessToken.model_validate(result)

    async def revoke_token(self, token: str, token_type_hint: str = "refresh_token") -> None:
        payload = {
            "clientId": self.client_id,
            "clientSecret": self.client_secret,
            "token": token,
            "tokenTypeHint": token_type_hint,
        }
        await self.post("/auth/v1/token/revoke", json=payload)

    async def get_channels_info(self, channels: list[str]) -> list[ChannelInfo]:
        if len(channels) > 20:
            raise ValueError("Maximum of 20 channel IDs can be requested at once.")

        params = {"channelIds": ",".join(channels)}
        result = await self.get("/open/v1/channels", params=params, headers=self.client_headers)
        return [ChannelInfo.model_validate(channel) for channel in result.get("data", [])]

    async def get_lives(self) -> list[LiveInfo]:
        lives = []
        params = {}
        while True:
            result = await self.get("/open/v1/lives", params=params, headers=self.client_headers)
            lives.extend(LiveInfo.model_validate(live) for live in result.get("data", []))
            next_page = (result.get("page") or {}).get("next")
            if not next_page:
                return lives
            params = {"next": next_page}

    async def create_client_session(self) -> SessionCreate:
        result = await self.get("/open/v1/sessions/auth/client", headers=self.client_headers)
        return SessionCreate.model_validate(result)

    @HttpClient.auto_refresh_auth
    async def get_account_info(self, access_token: str, headers: dict | None = None) -> AccountInfo:
        result = await self.get("/open/v1/users/me", headers=headers)
        return AccountInfo.model_validate(result)

    @HttpClient.auto_refresh_auth
    async def subscribe_chat_event(self, access_token: str, session_key: str, headers: dict | None = None) -> dict:
        params = {"sessionKey": session_key}
        return await self.post("/open/v1/sessions/events/subscribe/chat", params=params, headers=headers)

    @HttpClient.auto_refresh_auth
    async def send_chat(self, access_token: str, message: str, headers: dict | None = None) -> Message:
        if len(message) > 100:
            raise ValueError("Message length exceeds 100 characters.")

        result = await self.post("/open/v1/chats/send", json={"message": message}, headers=headers)
        return Message.model_validate(result)
