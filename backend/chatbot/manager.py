import asyncio
import logging
import time

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from core.stats import publish_bot_status
from database.db import async_session
from database.models import AuthToken, User
from providers.chzzk.client import ChzzkClient
from providers.spotify.client import SpotifyClient

from .chat import SioClient

logger = logging.getLogger(__name__)

RECONNECT_INTERVAL_SECONDS = 10
CONNECT_TIMEOUT_SECONDS = 15
SUBSCRIBE_GRACE_SECONDS = 30


class SioManager:
    def __init__(self, chzzk: ChzzkClient, spotify: SpotifyClient, bot_id: str):
        self.chzzk: ChzzkClient = chzzk
        self.spotify: SpotifyClient = spotify
        self.bot_id = bot_id
        self.scheduler = AsyncIOScheduler()

        self.clients: dict[str, SioClient] = {}
        self.stop_event = asyncio.Event()

        self.scheduler.add_job(self.auto_reconnect, "interval", seconds=RECONNECT_INTERVAL_SECONDS, id="auto_reconnect")

    async def _connect(self, streamer: User) -> SioClient | None:
        async with async_session() as session:
            auth_token = (
                await session.execute(
                    select(AuthToken).where(AuthToken.user_id == streamer.id, AuthToken.provider == "chzzk")
                )
            ).scalar_one_or_none()
            if not auth_token:
                logger.warning("No auth token found for streamer %s. Cannot connect.", streamer.channel_id)
                return None

        session = await self.chzzk.create_client_session()
        sio = SioClient(
            self.chzzk,
            self.spotify,
            access_token=auth_token.access_token,
            refresh_token=auth_token.refresh_token,
            user_id=str(auth_token.user_id),
            bot_id=self.bot_id,
        )
        await sio.connect(session.url)
        return sio

    async def auto_reconnect(self):
        async with async_session() as session:
            streamers = (await session.execute(select(User).where(User.is_streamer.is_(True)))).scalars().all()

        active_channels = {streamer.channel_id for streamer in streamers}
        for channel_id in [channel_id for channel_id in self.clients if channel_id not in active_channels]:
            await self.clients.pop(channel_id).disconnect()

        for streamer in streamers:
            client = self.clients.get(streamer.channel_id)
            if client and client.connected:
                if client.subscribed or time.time() - client.connected_at < SUBSCRIBE_GRACE_SECONDS:
                    continue
                logger.warning("Chat subscription missing for %s; reconnecting.", streamer.channel_id)
                await client.disconnect()
            try:
                client = await asyncio.wait_for(self._connect(streamer), CONNECT_TIMEOUT_SECONDS)
            except Exception:
                logger.exception("Failed to connect chat for %s.", streamer.channel_id)
                continue
            if client is not None:
                self.clients[streamer.channel_id] = client

        await publish_bot_status(
            [channel_id for channel_id, client in self.clients.items() if client.connected and client.subscribed]
        )

    async def stop(self) -> None:
        self.stop_event.set()
        await asyncio.gather(*(client.disconnect() for client in self.clients.values()), return_exceptions=True)
        self.scheduler.shutdown()

    async def start(self) -> None:
        self.scheduler.start()
        await self.auto_reconnect()
        await self.stop_event.wait()

    async def run(self) -> None:
        try:
            await self.start()
        except asyncio.CancelledError:
            pass
        finally:
            await self.stop()
