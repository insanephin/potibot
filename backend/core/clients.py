from configparser import ConfigParser

from providers.chzzk.client import ChzzkClient
from providers.spotify.client import SpotifyClient

from .token import drop_refresh_token, load_spotify_app, persist_refreshed_token


def create_clients(config: ConfigParser) -> tuple[ChzzkClient, SpotifyClient]:
    chzzk = ChzzkClient(**config["chzzk"])
    spotify = SpotifyClient(**config["spotify"])
    chzzk.on_token_refreshed = persist_refreshed_token
    spotify.on_token_refreshed = persist_refreshed_token
    spotify.on_refresh_rejected = drop_refresh_token
    spotify.credentials_loader = load_spotify_app
    return chzzk, spotify
