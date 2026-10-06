import logging
import secrets
from datetime import UTC, datetime

import jwt
from sqlalchemy import select

from core.keys import AUTH_EXTENSION_KEY, AUTH_STATE_KEY
from core.token import drop_refresh_token, load_spotify_app, save_provider_token
from database.db import async_session, rd_client
from database.models import AuthToken, SpotifyAccessRequest, User
from providers.chzzk.client import ChzzkClient
from providers.http import HTTPException as ProviderHTTPException
from providers.spotify.client import SpotifyClient

logger = logging.getLogger(__name__)

AUTH_STATE_TTL_SECONDS = 300


class SpotifyAccessRequired(Exception):
    def __init__(self, own_app: bool):
        super().__init__()
        self.own_app = own_app


class AuthService:
    def __init__(self, global_set, chzzk: ChzzkClient, spotify: SpotifyClient):
        self.private_key = global_set["private_key"]
        self.public_key = global_set["public_key"]
        self.algorithm = global_set["algorithm"]
        self.extension_ids = {item.strip() for item in global_set.get("extension_ids", "").split(",") if item.strip()}
        self.chzzk = chzzk
        self.spotify = spotify

    async def create_state(self, provider: str, user_id=None, extension_redirect: str | None = None) -> str:
        state = secrets.token_hex(32)
        await rd_client.setex(AUTH_STATE_KEY.format(state=state), AUTH_STATE_TTL_SECONDS, f"{provider}:{user_id}")
        if extension_redirect:
            await rd_client.setex(AUTH_EXTENSION_KEY.format(state=state), AUTH_STATE_TTL_SECONDS, extension_redirect)
        return state

    async def get_extension_redirect(self, state: str) -> str | None:
        return await rd_client.get(AUTH_EXTENSION_KEY.format(state=state))

    async def consume_state(self, state: str, provider: str, user_id=None) -> bool:
        result = await rd_client.eval(
            "local value = redis.call('GET', KEYS[1]); "
            "if value then redis.call('DEL', KEYS[1], KEYS[2]); end; "
            "return value",
            2,
            AUTH_STATE_KEY.format(state=state),
            AUTH_EXTENSION_KEY.format(state=state),
        )
        if not result:
            return False
        stored_provider, stored_user_id = result.split(":", 1)
        return stored_provider == provider and stored_user_id == str(user_id)

    def encode_token(self, channel_id: str, token_version: int) -> str:
        payload = {
            "channel_id": channel_id,
            "token_version": token_version,
            "iat": datetime.now(UTC),
        }
        return jwt.encode(payload, self.private_key, algorithm=self.algorithm)

    def decode_token(self, token: str) -> dict | None:
        try:
            return jwt.decode(token, self.public_key, algorithms=[self.algorithm])
        except jwt.InvalidTokenError:
            logger.warning("Invalid JWT token.")
            return None

    async def verify_user(self, token: str | None) -> User | None:
        if not token:
            return None

        async with async_session() as session:
            user = (await session.execute(select(User).where(User.token == token))).scalar_one_or_none()
        if not user:
            return None

        payload = self.decode_token(token)
        if not payload or payload.get("token_version") != user.token_version:
            return None
        return user

    async def complete_chzzk_login(self, code: str, state: str) -> str:
        raw_token = await self.chzzk.get_access_token(code, state)
        account = await self.chzzk.get_account_info(raw_token.accessToken)

        async with async_session() as session:
            user = (
                await session.execute(select(User).where(User.channel_id == account.channelId))
            ).scalar_one_or_none()
            if not user:
                user = User(channel_id=account.channelId, token_version=1)
                session.add(user)

            payload = self.decode_token(user.token) if user.token else None
            if not payload or payload.get("token_version") != user.token_version:
                user.token = self.encode_token(account.channelId, user.token_version)
            token = user.token
            await session.flush()

            await save_provider_token(session, user.id, "chzzk", raw_token)
            await session.commit()
            return token

    async def get_spotify_token(self, user_id: str) -> AuthToken | None:
        async with async_session() as session:
            result = await session.execute(
                select(AuthToken).where(AuthToken.user_id == user_id, AuthToken.provider == "spotify")
            )
            return result.scalar_one_or_none()

    async def complete_spotify_login(self, user: User, code: str) -> None:
        credentials = await load_spotify_app(str(user.id))
        raw_token = await self.spotify.get_access_token(code, credentials)
        try:
            await self.spotify.get_account_info(raw_token.access_token)
        except ProviderHTTPException as error:
            if error.code == 403:
                raise SpotifyAccessRequired(own_app=credentials is not None) from error
            raise

        async with async_session() as session:
            await save_provider_token(session, user.id, "spotify", raw_token)
            request = await session.get(SpotifyAccessRequest, user.channel_id)
            if request:
                request.status = "approved"
            await session.commit()

    async def refresh_spotify_token(self, user_id: str) -> str:
        spotify_token = await self.get_spotify_token(user_id)
        if not spotify_token:
            raise ValueError("Spotify token not found for the user.")
        if not spotify_token.refresh_token:
            raise ValueError("Spotify reauthentication is required.")

        try:
            refreshed_token = await self.spotify.refresh_access_token(spotify_token.refresh_token, user_id=user_id)
        except ProviderHTTPException as error:
            if self.spotify.is_refresh_rejected(error):
                await drop_refresh_token(user_id, "spotify", spotify_token.refresh_token)
            raise
        refreshed_token.refresh_token = refreshed_token.refresh_token or spotify_token.refresh_token
        async with async_session() as session:
            await save_provider_token(session, user_id, "spotify", refreshed_token)
            await session.commit()
        return refreshed_token.access_token
