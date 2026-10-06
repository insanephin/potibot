from core import keys

EXPECTED = {
    "NOW_PLAYING_KEY": "playback_update:{channel_id}",
    "LIVE_CHANNELS_KEY": "live_channels",
    "CACHED_CHANNELS_KEY": "cached_channels",
    "CHANNEL_PROFILE_KEY": "channel:{channel_id}",
    "SPOTIFY_CLIENT_TOKEN_KEY": "spotify_client_credentials",
    "SPOTIFY_QUEUE_SYNC_LOCK_KEY": "spotify_queue_sync:{channel_id}",
    "SPOTIFY_RATE_LIMIT_KEY": "spotify_rate_limited",
    "PUSHED_QUEUE_KEY": "spotify_pushed:{channel_id}",
    "DEVICE_SWITCH_KEY": "spotify_device_switch:{channel_id}",
    "CANCELLED_PUSHED_KEY": "spotify_cancelled:{channel_id}",
    "TRACK_NAMES_KEY": "track_names",
    "TRACK_INFO_KEY": "track_info",
    "BOT_STATUS_KEY": "bot_status",
    "AUTH_STATE_KEY": "auth_state:{state}",
    "AUTH_EXTENSION_KEY": "auth_extension:{state}",
    "USER_COOLDOWN_KEY": "chat_cooldown:{channel_id}:{user_id}:{command}",
    "CHANNEL_COOLDOWN_KEY": "chat_cooldown:{channel_id}:{command}",
}


def test_keys_unchanged():
    defined = {name: value for name, value in vars(keys).items() if name.endswith("_KEY")}
    assert defined == EXPECTED


def test_channel_keys_are_per_channel():
    assert all("{channel_id}" in key for key in keys.CHANNEL_KEYS)
