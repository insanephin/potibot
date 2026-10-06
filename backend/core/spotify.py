import logging

from sqlalchemy import select

from database.db import async_session, rd_client
from database.models import AuthToken, User
from providers.http import HTTPException

from .keys import DEVICE_SWITCH_KEY, SPOTIFY_CLIENT_TOKEN_KEY, SPOTIFY_RATE_LIMIT_KEY

logger = logging.getLogger(__name__)

SPOTIFY_RATE_LIMIT_DEFAULT_SECONDS = 30
SPOTIFY_RATE_LIMIT_MAX_SECONDS = 300
PUSH_SETTLE_SECONDS = 15


async def get_spotify_token_context(channel_id: str) -> tuple[str, AuthToken] | None:
    async with async_session() as session:
        result = await session.execute(
            select(User.id, AuthToken)
            .join(AuthToken, AuthToken.user_id == User.id)
            .where(
                User.channel_id == channel_id,
                AuthToken.provider == "spotify",
            )
        )
        row = result.first()
    return (row[0], row[1]) if row else None


async def spotify_request_context(channel_id: str) -> tuple[str, dict] | None:  # type: ignore
    token_context = await get_spotify_token_context(channel_id)
    if not token_context:
        return None
    user_id, auth_token = token_context
    if not auth_token.access_token or not auth_token.refresh_token:
        return None
    return auth_token.access_token, {
        "refresh_token": auth_token.refresh_token,
        "user_id": str(user_id),
        "provider": "spotify",
    }


async def get_spotify_channels() -> list[str]:
    async with async_session() as session:
        result = await session.execute(
            select(User.channel_id)
            .join(AuthToken, AuthToken.user_id == User.id)
            .where(
                User.is_streamer.is_(True),
                AuthToken.provider == "spotify",
                AuthToken.refresh_token.is_not(None),
            )
        )
        return list(result.scalars().all())


async def pause_for_rate_limit(error: HTTPException) -> None:
    seconds = min(error.retry_after or SPOTIFY_RATE_LIMIT_DEFAULT_SECONDS, SPOTIFY_RATE_LIMIT_MAX_SECONDS)
    logger.warning("Spotify rate limited; pausing polling for %.0f seconds.", seconds)
    await rd_client.set(SPOTIFY_RATE_LIMIT_KEY, 1, ex=max(int(seconds), 1))


async def is_spotify_rate_limited() -> bool:
    return bool(await rd_client.exists(SPOTIFY_RATE_LIMIT_KEY))


async def get_client_token(spotify, refresh: bool = False) -> str:
    if not refresh and (token := await rd_client.get(SPOTIFY_CLIENT_TOKEN_KEY)):
        return token
    credentials = await spotify.get_client_credentials()
    ttl = max((credentials.expires_in or 3600) - 60, 60)
    await rd_client.set(SPOTIFY_CLIENT_TOKEN_KEY, credentials.access_token, ex=ttl)
    return credentials.access_token


async def search_tracks(spotify, keyword: str):
    try:
        return await spotify.get_track_by_keyword(await get_client_token(spotify), keyword)
    except HTTPException as error:
        if error.code != 401:
            raise
    return await spotify.get_track_by_keyword(await get_client_token(spotify, refresh=True), keyword)


async def mark_device_switch(channel_id: str) -> None:
    await rd_client.set(DEVICE_SWITCH_KEY.format(channel_id=channel_id), 1, ex=PUSH_SETTLE_SECONDS)


async def is_device_switching(channel_id: str) -> bool:
    return bool(await rd_client.exists(DEVICE_SWITCH_KEY.format(channel_id=channel_id)))
