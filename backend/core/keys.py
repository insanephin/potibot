NOW_PLAYING_KEY = "playback_update:{channel_id}"
LIVE_CHANNELS_KEY = "live_channels"
CACHED_CHANNELS_KEY = "cached_channels"
CHANNEL_PROFILE_KEY = "channel:{channel_id}"
SPOTIFY_CLIENT_TOKEN_KEY = "spotify_client_credentials"
SPOTIFY_QUEUE_SYNC_LOCK_KEY = "spotify_queue_sync:{channel_id}"
SPOTIFY_RATE_LIMIT_KEY = "spotify_rate_limited"
PUSHED_QUEUE_KEY = "spotify_pushed:{channel_id}"
DEVICE_SWITCH_KEY = "spotify_device_switch:{channel_id}"
CANCELLED_PUSHED_KEY = "spotify_cancelled:{channel_id}"
TRACK_NAMES_KEY = "track_names"
TRACK_INFO_KEY = "track_info"
BOT_STATUS_KEY = "bot_status"
AUTH_STATE_KEY = "auth_state:{state}"
AUTH_EXTENSION_KEY = "auth_extension:{state}"
USER_COOLDOWN_KEY = "chat_cooldown:{channel_id}:{user_id}:{command}"
CHANNEL_COOLDOWN_KEY = "chat_cooldown:{channel_id}:{command}"

CHANNEL_KEYS = (
    CHANNEL_PROFILE_KEY,
    NOW_PLAYING_KEY,
    PUSHED_QUEUE_KEY,
    CANCELLED_PUSHED_KEY,
    DEVICE_SWITCH_KEY,
)
