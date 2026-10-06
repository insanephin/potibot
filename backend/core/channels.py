import json

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from database.db import async_session, rd_client
from database.models import Channel, User
from providers.chzzk.client import ChzzkClient

from .keys import CACHED_CHANNELS_KEY, LIVE_CHANNELS_KEY


async def get_channel(channel_id: str) -> dict | None:
    async with async_session() as session:
        channel = (await session.execute(select(Channel).where(Channel.channel_id == channel_id))).scalar_one_or_none()
    if not channel:
        return None
    return {
        "channel_name": channel.channel_name,
        "channel_image_url": channel.channel_image_url,
        "is_verified": channel.is_verified,
    }


async def get_info_by_channel_id(channel_id: str) -> dict | None:
    channel = await get_channel(channel_id)
    if not channel:
        return None
    return {"channel": channel, "playback": f"/api/spotify/playback?channel_id={channel_id}"}


async def dashboard_state(channel_id: str) -> dict | None:
    channel = await get_channel(channel_id)
    return {"channel": channel} if channel else None


async def register_streamer(chzzk: ChzzkClient, user_id: str) -> None:
    async with async_session() as session:
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not user:
            return
        user.is_streamer = True

        channels = await chzzk.get_channels_info([user.channel_id])
        channel = channels[0] if channels else None
        values = {
            "channel_name": channel.channelName if channel else None,
            "channel_image_url": channel.channelImageUrl if channel else None,
            "is_verified": bool(channel and channel.verifiedMark),
        }
        await session.execute(
            insert(Channel)
            .values(channel_id=user.channel_id, **values)
            .on_conflict_do_update(index_elements=[Channel.channel_id], set_=values)
        )
        await session.commit()


async def update_live_channels(chzzk: ChzzkClient) -> None:
    lives = await chzzk.get_lives()
    await rd_client.set(LIVE_CHANNELS_KEY, ",".join(live.channelId for live in lives if live.channelId))


async def get_live_channels() -> set[str]:
    return set(filter(None, (await rd_client.get(LIVE_CHANNELS_KEY) or "").split(",")))


async def is_channel_live(channel_id: str) -> bool:
    return channel_id in await get_live_channels()


async def cache_channels() -> None:
    async with async_session() as session:
        channels = (await session.execute(select(Channel))).scalars().all()
    channel_data = [
        {
            "channel_id": channel.channel_id,
            "channel_name": channel.channel_name,
            "channel_image_url": channel.channel_image_url,
            "is_verified": channel.is_verified,
        }
        for channel in channels
        if channel.channel_name
    ]
    await rd_client.set(CACHED_CHANNELS_KEY, json.dumps(channel_data))


async def search_channels(query: str) -> list[dict]:
    channels = await rd_client.get(CACHED_CHANNELS_KEY)
    channels = json.loads(channels) if channels else []

    normalized_query = query.replace(" ", "").lower()
    return [channel for channel in channels if normalized_query in channel["channel_name"].replace(" ", "").lower()]
