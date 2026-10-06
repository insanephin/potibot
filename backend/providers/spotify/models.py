from pydantic import BaseModel, Field


class AccessToken(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "Bearer"
    expires_in: int | None = None
    scope: str | None = None


class Image(BaseModel):
    url: str


class Artist(BaseModel):
    name: str


class Album(BaseModel):
    name: str = ""
    images: list[Image] = []


class AccountInfo(BaseModel):
    display_name: str | None = None
    product: str | None = None


class Track(BaseModel):
    uri: str
    name: str
    duration_ms: int = 0
    artists: list[Artist] = []
    album: Album = Field(default_factory=Album)


class Tracks(BaseModel):
    items: list[Track] = []


class UserQueue(BaseModel):
    currently_playing: Track | None = None
    queue: list[Track] = []
