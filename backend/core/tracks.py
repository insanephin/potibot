import json
import logging

from sqlalchemy import select

from database.db import async_session, rd_client
from database.models import Playback
from providers.spotify.models import Track

from .keys import TRACK_INFO_KEY, TRACK_NAMES_KEY

logger = logging.getLogger(__name__)

TRACK_INFO_PRUNE_CHUNK = 5000


def track_display_name(track: Track) -> str:
    return f"{track.name} - {', '.join(artist.name for artist in track.artists)}"


async def cache_track_info(track: Track) -> None:
    await rd_client.hset(TRACK_NAMES_KEY, track.uri, track_display_name(track))
    await rd_client.hset(
        TRACK_INFO_KEY,
        track.uri,
        json.dumps(
            {
                "name": track.name,
                "artists": [artist.name for artist in track.artists],
                "image_url": track.album.images[0].url if track.album.images else None,
                "duration_ms": track.duration_ms,
            }
        ),
    )


async def get_track_name(uri: str) -> str | None:
    return await rd_client.hget(TRACK_NAMES_KEY, uri)


async def get_track_infos(uris: list[str]) -> list[tuple[dict, str | None]]:
    if not uris:
        return []
    infos = await rd_client.hmget(TRACK_INFO_KEY, uris)
    names = await rd_client.hmget(TRACK_NAMES_KEY, uris)
    return [(json.loads(info) if info else {}, name) for info, name in zip(infos, names, strict=True)]


async def prune_track_infos() -> int:
    cached = set(await rd_client.hkeys(TRACK_INFO_KEY)) | set(await rd_client.hkeys(TRACK_NAMES_KEY))
    if not cached:
        return 0
    uris = list(cached)
    referenced: set[str] = set()
    async with async_session() as session:
        for start in range(0, len(uris), TRACK_INFO_PRUNE_CHUNK):
            chunk = uris[start : start + TRACK_INFO_PRUNE_CHUNK]
            statement = select(Playback.track_uri).where(Playback.track_uri.in_(chunk)).distinct()
            referenced.update((await session.execute(statement)).scalars())
    stale = list(cached - referenced)
    if stale:
        await rd_client.hdel(TRACK_INFO_KEY, *stale)
        await rd_client.hdel(TRACK_NAMES_KEY, *stale)
        logger.info("Pruned %d cached track names.", len(stale))
    return len(stale)
