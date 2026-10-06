import json
import time
from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy import func, select

from database.db import async_session, rd_client
from database.models import Playback

from .keys import BOT_STATUS_KEY
from .tracks import get_track_infos

BOT_STATUS_STALE_SECONDS = 60
RANKING_PERIODS = {"day": timedelta(days=1), "week": timedelta(days=7), "month": timedelta(days=30)}
RANKING_LIMIT = 10
KST = timezone(timedelta(hours=9))


async def get_track_ranking(period: str) -> list[dict]:
    since = datetime.now(UTC) - RANKING_PERIODS[period]
    plays = func.count(Playback.id).label("plays")
    async with async_session() as session:
        rows = (
            await session.execute(
                select(Playback.track_uri, plays)
                .where(Playback.is_played.is_(True), Playback.added_at >= since)
                .group_by(Playback.track_uri)
                .order_by(plays.desc(), func.max(Playback.added_at).desc())
                .limit(RANKING_LIMIT)
            )
        ).all()

    infos = await get_track_infos([row.track_uri for row in rows])
    ranking = []
    for rank, (row, (track_info, name)) in enumerate(zip(rows, infos, strict=True), start=1):
        ranking.append(
            {
                "rank": rank,
                "track_uri": row.track_uri,
                "name": track_info.get("name") or name or "알 수 없는 곡",
                "artists": track_info.get("artists", []),
                "image_url": track_info.get("image_url"),
                "plays": row.plays,
            }
        )
    return ranking


async def publish_bot_status(connected_channels: list[str]) -> None:
    await rd_client.set(
        BOT_STATUS_KEY, json.dumps({"updated_at": time.time(), "connected_channels": connected_channels})
    )


async def get_bot_status() -> dict:
    heartbeat = await rd_client.get(BOT_STATUS_KEY)
    heartbeat = json.loads(heartbeat) if heartbeat else {}
    updated_at = heartbeat.get("updated_at")
    today = datetime.now(KST).replace(hour=0, minute=0, second=0, microsecond=0)

    async with async_session() as session:
        requests_today = (
            await session.execute(select(func.count(Playback.id)).where(Playback.added_at >= today))
        ).scalar_one()
        total_played = (
            await session.execute(select(func.count(Playback.id)).where(Playback.is_played.is_(True)))
        ).scalar_one()

    return {
        "worker_online": bool(updated_at) and time.time() - updated_at < BOT_STATUS_STALE_SECONDS,
        "checked_at": datetime.fromtimestamp(updated_at, UTC).isoformat() if updated_at else None,
        "requests_today": requests_today,
        "total_played": total_played,
    }
