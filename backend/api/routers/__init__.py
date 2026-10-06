from . import chzzk, dashboard, playback, public, spotify, user

ROUTERS = [
    dashboard.router,
    user.router,
    chzzk.router,
    spotify.router,
    playback.router,
    public.router,
]
