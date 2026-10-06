import time
from enum import Enum
from typing import Literal

from sqlalchemy import func, or_, select, update

from database.db import async_session, rd_client
from database.models import Playback

from .keys import CANCELLED_PUSHED_KEY, PUSHED_QUEUE_KEY
from .tracks import get_track_infos

REQUEST_HISTORY_LIMIT = 50


class RequestResult(Enum):
    ADDED = "added"
    REQUESTER_PENDING = "requester_pending"
    TRACK_PENDING = "track_pending"
    FAILED = "failed"


async def get_pending_playbacks(channel_id: str) -> list[Playback]:
    async with async_session() as session:
        result = await session.execute(
            select(Playback)
            .where(
                Playback.channel_id == channel_id,
                Playback.is_played.is_(False),
                Playback.is_cancelled.is_(False),
            )
            .order_by(Playback.added_at.asc(), Playback.id.asc())
        )
    return list(result.scalars().all())


async def has_pending_request(channel_id: str, track_uri: str) -> bool:
    async with async_session() as session:
        playback_id = await session.scalar(
            select(Playback.id)
            .where(
                Playback.channel_id == channel_id,
                Playback.track_uri == track_uri,
                Playback.is_played.is_(False),
                Playback.is_cancelled.is_(False),
            )
            .limit(1)
        )
    return playback_id is not None


async def add_request(
    channel_id: str, requester_id: str, requester_name: str, track_uri: str, playing_uri: str | None
) -> RequestResult:
    async with async_session() as session:
        await session.execute(select(func.pg_advisory_xact_lock(func.hashtext(channel_id))))
        pending = (
            (
                await session.execute(
                    select(Playback).where(
                        Playback.channel_id == channel_id,
                        Playback.is_played.is_(False),
                        Playback.is_cancelled.is_(False),
                        or_(Playback.requester_id == requester_id, Playback.track_uri == track_uri),
                    )
                )
            )
            .scalars()
            .all()
        )
        if any(playback.track_uri == track_uri for playback in pending):
            return RequestResult.TRACK_PENDING
        if any(playback.requester_id == requester_id and playback.track_uri != playing_uri for playback in pending):
            return RequestResult.REQUESTER_PENDING

        session.add(
            Playback(
                channel_id=channel_id,
                track_uri=track_uri,
                requester_id=requester_id,
                requester_name=requester_name,
            )
        )
        await session.commit()
    return RequestResult.ADDED


async def cancel_own_request(
    channel_id: str, requester_id: str, playing_uri: str | None
) -> Playback | Literal["playing"] | None:  # type: ignore
    async with async_session() as session:
        pending = (
            (
                await session.execute(
                    select(Playback).where(
                        Playback.channel_id == channel_id,
                        Playback.requester_id == requester_id,
                        Playback.is_played.is_(False),
                        Playback.is_cancelled.is_(False),
                    )
                )
            )
            .scalars()
            .all()
        )
        playback = next((item for item in pending if item.track_uri != playing_uri), None)
        if not playback:
            return "playing" if pending else None

        playback.is_cancelled = True
        await session.commit()
        return playback


async def mark_playbacks_played(channel_id: str, track_uris: list[str]) -> None:
    if not track_uris:
        return
    async with async_session() as session:
        await session.execute(
            update(Playback)
            .where(
                Playback.channel_id == channel_id,
                Playback.track_uri.in_(track_uris),
                Playback.is_played.is_(False),
                Playback.is_cancelled.is_(False),
            )
            .values(is_played=True)
        )
        await session.commit()
    await rd_client.hdel(PUSHED_QUEUE_KEY.format(channel_id=channel_id), *track_uris)


def _request_status(playback: Playback) -> str:
    if playback.is_cancelled:
        return "cancelled"
    if playback.is_played:
        return "played"
    return "pending"


async def get_requests(channel_id: str, view: str) -> list[dict]:
    async with async_session() as session:
        statement = select(Playback).where(Playback.channel_id == channel_id)
        if view == "history":
            statement = (
                statement.where((Playback.is_played.is_(True)) | (Playback.is_cancelled.is_(True)))
                .order_by(Playback.added_at.desc(), Playback.id.desc())
                .limit(REQUEST_HISTORY_LIMIT)
            )
        else:
            statement = statement.where(
                Playback.is_played.is_(False),
                Playback.is_cancelled.is_(False),
            ).order_by(Playback.added_at.asc(), Playback.id.asc())
        playbacks = (await session.execute(statement)).scalars().all()

    infos = await get_track_infos([playback.track_uri for playback in playbacks])
    requests = []
    for playback, (track_info, name) in zip(playbacks, infos, strict=True):
        requests.append(
            {
                "id": playback.id,
                "track_uri": playback.track_uri,
                "name": track_info.get("name") or name or "신청곡",
                "artists": track_info.get("artists", []),
                "image_url": track_info.get("image_url"),
                "duration_ms": track_info.get("duration_ms"),
                "requester_name": playback.requester_name,
                "added_at": playback.added_at.isoformat() if playback.added_at else None,
                "status": _request_status(playback),
            }
        )
    return requests


async def cancel_request(channel_id: str, request_id: int) -> Playback | None:
    async with async_session() as session:
        playback = (
            await session.execute(
                select(Playback).where(
                    Playback.channel_id == channel_id,
                    Playback.id == request_id,
                    Playback.is_played.is_(False),
                    Playback.is_cancelled.is_(False),
                )
            )
        ).scalar_one_or_none()
        if not playback:
            return None
        playback.is_cancelled = True
        await session.commit()
    await forget_cancelled_request(channel_id, playback.track_uri)
    return playback


async def forget_cancelled_request(channel_id: str, track_uri: str) -> None:
    if await rd_client.hdel(PUSHED_QUEUE_KEY.format(channel_id=channel_id), track_uri):
        await rd_client.hset(CANCELLED_PUSHED_KEY.format(channel_id=channel_id), track_uri, time.time())
