import asyncio
import logging

from uvicorn import Config, Server

from config import config
from core.clients import create_clients
from database.db import engine, rd_client
from utils.logger import setup_logging

from .routers import ROUTERS
from .server import ApiServer

logger = logging.getLogger(__name__)


class ApiRunner:
    def __init__(self, config):
        self.chzzk, self.spotify = create_clients(config)
        self.api: ApiServer = ApiServer(config["global"], self.chzzk, self.spotify)
        for router in ROUTERS:
            self.api.include_router(router)

    async def start(self) -> None:
        await self.chzzk.start()
        await self.spotify.start()

    async def close(self) -> None:
        for http in (self.chzzk, self.spotify):
            try:
                await http.close()
            except Exception as e:
                logger.warning("Failed to close provider HTTP session.", exc_info=e)

        await rd_client.aclose()
        await engine.dispose()

    def run(self) -> None:
        log_config = setup_logging()

        async def runner():
            await self.start()
            try:
                server = Server(Config(self.api, host="0.0.0.0", port=8000, log_config=log_config))
                await server.serve()
            finally:
                await self.close()

        try:
            asyncio.run(runner())
        except KeyboardInterrupt:
            return


def run() -> None:
    ApiRunner(config).run()
