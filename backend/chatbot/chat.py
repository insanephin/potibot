import json
import logging
import time
from typing import Literal

import socketio

from core.channels import is_channel_live
from core.commands import COMMANDS
from core.keys import CHANNEL_COOLDOWN_KEY, USER_COOLDOWN_KEY
from core.playback import current_track_uri, get_stored_playback
from core.queue import publish_queue_event, sync_spotify_queue
from core.settings import get_settings
from core.song_requests import RequestResult, add_request, cancel_own_request, forget_cancelled_request
from core.spotify import search_tracks
from core.tracks import cache_track_info, get_track_name, track_display_name
from database.db import rd_client
from database.models import Playback
from providers.chzzk.client import ChzzkClient
from providers.chzzk.models import Chat, SystemMessage
from providers.http import HTTPException
from providers.spotify.client import SpotifyClient
from providers.spotify.models import Track

logger = logging.getLogger(__name__)

CHAT_MAX_LENGTH = 100
USER_COOLDOWN_SECONDS = 5
CHANNEL_COOLDOWN_SECONDS = 10


class SioClient(socketio.AsyncClient):
    def __init__(
        self,
        chzzk: ChzzkClient,
        spotify: SpotifyClient,
        access_token: str,
        refresh_token: str,
        user_id: str,
        bot_id: str,
    ):
        super().__init__(reconnection=False, request_timeout=3)
        self.chzzk: ChzzkClient = chzzk
        self.spotify: SpotifyClient = spotify
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.user_id = user_id
        self.bot_id = bot_id

        self.subscribed = False
        self.connected_at = 0.0

        self.on("connect", self._on_connect)
        self.on("disconnect", self._on_disconnect)
        self.on("connect_error", self._on_connect_error)
        self.on("SYSTEM", self._handle_system)
        self.on("CHAT", self._handle_chat)

    async def _update_access_token(self, access_token: str, refresh_token: str) -> None:
        self.access_token = access_token
        self.refresh_token = refresh_token

    async def _chzzk(self, method, *args, **kwargs) -> dict:
        kwargs.update(
            refresh_token=self.refresh_token,
            user_id=self.user_id,
            provider="chzzk",
            _token_updated=self._update_access_token,
        )
        return await method(self.access_token, *args, **kwargs)

    async def _on_connect(self) -> None:
        self.connected_at = time.time()
        logger.info("WebSocket connection established.")

    async def _on_disconnect(self) -> None:
        logger.info("WebSocket connection closed or expired. Reset session.")
        self.subscribed = False
        await self.disconnect()

    async def _on_connect_error(self, data) -> None:
        logger.error("WebSocket connection error: %s", data)

    async def _handle_system(self, data) -> None:
        try:
            message = SystemMessage.model_validate(data if isinstance(data, dict) else json.loads(data))
        except Exception:
            logger.exception("Received empty or invalid SYSTEM message.")
            return

        if message.type == "connected":
            logger.info("Subscribing to chat events...")
            await self._chzzk(self.chzzk.subscribe_chat_event, message.data["sessionKey"])
        elif message.type == "subscribed":
            self.subscribed = True
            logger.debug("Subscribed: data=%s", data)
        elif message.type == "unsubscribed":
            self.subscribed = False
            logger.debug("Unsubscribed: data=%s", data)
        elif message.type == "revoked":
            logger.warning("Access token revoked. Please re-authenticate.")

    async def _send_chat(self, message: str) -> dict:
        if len(message) > CHAT_MAX_LENGTH:
            message = message[: CHAT_MAX_LENGTH - 1] + "…"
        return await self._chzzk(self.chzzk.send_chat, message)

    async def _playing_track_uri(self, channel_id: str) -> str | None:
        return current_track_uri(await get_stored_playback(channel_id))

    async def _add_track_playback(self, chat: Chat, track: Track) -> RequestResult | None:
        try:
            channel_id = chat.channelId
            track_uri = track.uri
            playing_uri = await self._playing_track_uri(channel_id)
            result = await add_request(channel_id, chat.senderChannelId, chat.profile.nickname, track_uri, playing_uri)
            if result is not RequestResult.ADDED:
                return result

            sync_result = await sync_spotify_queue(channel_id, self.spotify)
            if sync_result["status"] not in {"synced", "already_running"}:
                logger.warning(
                    "Track %s saved but queue sync returned %s for channel %s",
                    track_uri,
                    sync_result["status"],
                    channel_id,
                )
            return RequestResult.ADDED
        except Exception:
            logger.exception("Error adding song playback.")
            return RequestResult.FAILED

    async def _remove_track_playback(self, chat: Chat) -> Playback | Literal["playing"] | None:  # type: ignore
        try:
            playing_uri = await self._playing_track_uri(chat.channelId)
            return await cancel_own_request(chat.channelId, chat.senderChannelId, playing_uri)
        except Exception:
            logger.exception("Error removing song playback.")
            return None

    async def _command_list(self) -> dict:
        return await self._send_chat(", ".join(f"!{command['key']}" for command in COMMANDS))

    async def _now_playing(self, chat: Chat) -> dict:
        track = ((await get_stored_playback(chat.channelId) or {}).get("track_window") or {}).get("current_track")
        if not track:
            return await self._send_chat("재생 중인 곡이 없습니다.")
        artists = ", ".join(artist["name"] for artist in track.get("artists", []))
        return await self._send_chat(f"재생중: {track['name']} - {artists}")

    async def _request_track(self, chat: Chat, keyword: str) -> dict:
        try:
            song_info = await search_tracks(self.spotify, keyword)
        except HTTPException:
            logger.exception("Track search failed for channel %s.", chat.channelId)
            return await self._send_chat("곡을 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.")
        track = song_info.items[0] if song_info.items else None
        if not track:
            return await self._send_chat(f"'{keyword}'(을)를 찾을 수 없습니다.")
        track_name = track_display_name(track)
        await cache_track_info(track)
        result = await self._add_track_playback(chat, track)
        if result is RequestResult.ADDED:
            await publish_queue_event(chat.channelId, "added")
            return await self._send_chat(f"'{track_name}'이(가) 대기열에 추가되었습니다.")
        if result is RequestResult.REQUESTER_PENDING:
            return await self._send_chat("대기 중인 신청곡이 있습니다.")
        if result is RequestResult.TRACK_PENDING:
            return await self._send_chat(f"'{track_name}'(은)는 이미 대기열에 있습니다.")
        return await self._send_chat("신청곡을 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.")

    async def _cancel_track(self, chat: Chat) -> dict:
        removed = await self._remove_track_playback(chat)
        if removed == "playing":
            return await self._send_chat("재생 중인 신청곡은 취소할 수 없습니다.")
        if not removed:
            return await self._send_chat("취소할 신청곡이 없습니다.")
        await forget_cancelled_request(chat.channelId, removed.track_uri)
        await publish_queue_event(chat.channelId, "removed", track_uri=removed.track_uri)
        track_name = await get_track_name(removed.track_uri) or "신청곡"
        return await self._send_chat(f"'{track_name}'이(가) 신청 취소되었습니다.")

    @staticmethod
    async def _cooldown(key: str, seconds: int) -> bool:
        return bool(await rd_client.set(key, 1, nx=True, ex=seconds))

    async def _handle_chat(self, data) -> dict | None:
        try:
            chat = Chat.model_validate(data) if isinstance(data, dict) else Chat.model_validate_json(data)
        except Exception:
            logger.exception("Received invalid CHAT message.")
            return
        if chat.senderChannelId == self.bot_id or not chat.content.startswith("!"):
            return

        parts = chat.content[1:].strip().split(" ", 1)
        command_name = parts[0]
        command_args = parts[1].strip() if len(parts) > 1 else None
        if command_name not in {"명령어", "노래"}:
            return
        if not (await get_settings(chat.channelId))["requests_enabled"]:
            return

        subcommand_parts = command_args.split(" ", 1) if command_args else [None]
        subcommand = subcommand_parts[0]
        subcommand_args = subcommand_parts[1].strip() if len(subcommand_parts) > 1 else None
        cooldown_command = command_name
        if command_name == "노래" and subcommand:
            cooldown_command += ":" + (subcommand if subcommand in {"신청", "취소"} else "usage")
        user_key = USER_COOLDOWN_KEY.format(
            channel_id=chat.channelId, user_id=chat.senderChannelId, command=cooldown_command
        )
        if not await self._cooldown(user_key, USER_COOLDOWN_SECONDS):
            return

        if command_name == "명령어":
            channel_key = CHANNEL_COOLDOWN_KEY.format(channel_id=chat.channelId, command="commands")
            if await self._cooldown(channel_key, CHANNEL_COOLDOWN_SECONDS):
                return await self._command_list()
            return

        if command_name == "노래":
            if not await is_channel_live(chat.channelId):
                return
            if not subcommand:
                channel_key = CHANNEL_COOLDOWN_KEY.format(channel_id=chat.channelId, command="now_playing")
                if await self._cooldown(channel_key, CHANNEL_COOLDOWN_SECONDS):
                    return await self._now_playing(chat)
                return

            if subcommand == "신청":
                if not subcommand_args:
                    return await self._send_chat("신청 형식: !노래 신청 <곡 제목 또는 가수>")
                return await self._request_track(chat, subcommand_args)
            if subcommand == "취소":
                return await self._cancel_track(chat)
            return await self._send_chat("사용법: !노래, !노래 신청 <검색어>, !노래 취소")

    async def connect(self, url: str) -> None:
        await super().connect(url, transports=["websocket"], socketio_path="socket.io")
