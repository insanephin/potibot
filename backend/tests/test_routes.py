from api.main import ApiRunner
from config import config

EXPECTED_ROUTES = [
    "GET,HEAD /openapi.json -> applications.openapi",
    "GET,HEAD /docs -> applications.swagger_ui_html",
    "GET,HEAD /docs/oauth2-redirect -> applications.swagger_ui_redirect",
    "GET,HEAD /redoc -> applications.redoc_html",
    "POST /dashboard/register -> dashboard.register",
    "GET /dashboard/state -> dashboard.state",
    "GET /dashboard/requests -> dashboard.requests",
    "DELETE /dashboard/requests/{request_id} -> dashboard.request_cancel",
    "GET /dashboard/settings -> dashboard.settings",
    "PATCH /dashboard/settings -> dashboard.settings_update",
    "GET /me -> user.get_user",
    "POST /logout -> user.logout",
    "DELETE /me -> user.delete_account",
    "GET /chzzk/channel -> chzzk.channel",
    "GET /chzzk/login -> chzzk.login",
    "GET /chzzk/callback -> chzzk.callback",
    "POST /chzzk/extension/login -> chzzk.extension_login",
    "POST /chzzk/extension/complete -> chzzk.extension_complete",
    "GET /spotify/account -> spotify.account",
    "DELETE /spotify/account -> spotify.disconnect",
    "GET /spotify/app -> spotify.get_app_credentials",
    "PUT /spotify/app -> spotify.save_app_credentials",
    "DELETE /spotify/app -> spotify.delete_app_credentials",
    "GET /spotify/access -> spotify.access",
    "POST /spotify/access -> spotify.access_request",
    "DELETE /spotify/access -> spotify.access_cancel",
    "GET /spotify/login -> spotify.login",
    "GET /spotify/callback -> spotify.callback",
    "POST /spotify/extension/login -> spotify.extension_login",
    "POST /spotify/extension/complete -> spotify.extension_complete",
    "GET /spotify/playback -> playback.playback_events",
    "WS /spotify/ws -> playback.player_websocket",
    "GET /search -> public.search_channel",
    "GET /stats/ranking -> public.stats_ranking",
    "GET /stats/status -> public.stats_status",
    "GET /commands -> public.commands",
]


def _walk(routes):
    for route in routes:
        if hasattr(route, "original_router"):
            yield from _walk(route.original_router.routes)
        else:
            methods = ",".join(sorted(getattr(route, "methods", None) or ["WS"]))
            module = route.endpoint.__module__.split(".")[-1]
            yield f"{methods} {route.path} -> {module}.{route.endpoint.__name__}"


def test_routes_unchanged():
    assert list(_walk(ApiRunner(config).api.routes)) == EXPECTED_ROUTES
