import asyncio
import contextlib

from config import config
from core.clients import create_clients
from utils.logger import setup_logging

from .manager import SioManager


def run() -> None:
    setup_logging()
    chzzk, spotify = create_clients(config)
    manager = SioManager(chzzk=chzzk, spotify=spotify, bot_id=config.get("global", "bot_id"))
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(manager.run())
