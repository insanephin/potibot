import json
import logging

from sqlalchemy import delete, update

from database.db import async_session, rd_client
from database.models import AuthToken, Channel, Playback, Setting, SpotifyAccessRequest, SpotifyApp, User
from providers.chzzk.client import ChzzkClient
from providers.http import HTTPException

from .channels import cache_channels
from .keys import CHANNEL_KEYS, CHANNEL_PROFILE_KEY

logger = logging.getLogger(__name__)

PROFILE_CACHE_SECONDS = 60 * 60


async def get_profile(chzzk: ChzzkClient, channel_id: str) -> dict | None:
    profile_key = CHANNEL_PROFILE_KEY.format(channel_id=channel_id)
    cached_data = await rd_client.get(profile_key)
    try:
        data = json.loads(cached_data) if cached_data else None
    except json.JSONDecodeError:
        data = None

    if not data:
        channel_data = await chzzk.get_channels_info([channel_id])
        if channel_data:
            data = {
                "channel_name": channel_data[0].channelName,
                "channel_image_url": channel_data[0].channelImageUrl,
            }
            await rd_client.set(profile_key, json.dumps(data), ex=PROFILE_CACHE_SECONDS)
    return data


async def revoke_sessions(user_id) -> None:
    async with async_session() as session:
        await session.execute(update(User).where(User.id == user_id).values(token_version=User.token_version + 1))
        await session.commit()


async def delete_account(chzzk: ChzzkClient, user: User) -> None:
    async with async_session() as session:
        chzzk_token = await session.get(AuthToken, (user.id, "chzzk"))
    if chzzk_token and chzzk_token.refresh_token:
        try:
            await chzzk.revoke_token(chzzk_token.refresh_token)
        except HTTPException:
            logger.warning("Failed to revoke Chzzk token for channel %s", user.channel_id)

    async with async_session() as session:
        await session.execute(delete(Playback).where(Playback.channel_id == user.channel_id))
        await session.execute(
            update(Playback)
            .where(Playback.requester_id == user.channel_id)
            .values(requester_id=None, requester_name=None)
        )
        await session.execute(delete(Setting).where(Setting.channel_id == user.channel_id))
        await session.execute(delete(SpotifyAccessRequest).where(SpotifyAccessRequest.channel_id == user.channel_id))
        await session.execute(delete(SpotifyApp).where(SpotifyApp.user_id == user.id))
        await session.execute(delete(AuthToken).where(AuthToken.user_id == user.id))
        await session.execute(delete(Channel).where(Channel.channel_id == user.channel_id))
        await session.execute(delete(User).where(User.id == user.id))
        await session.commit()

    await rd_client.delete(*(key.format(channel_id=user.channel_id) for key in CHANNEL_KEYS))
    logger.info("Account deleted for channel %s", user.channel_id)
    await cache_channels()
