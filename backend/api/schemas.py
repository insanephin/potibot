from pydantic import BaseModel


class SpotifyWebSocketMessage(BaseModel):
    state: str


class ExtensionLoginStart(BaseModel):
    redirect_uri: str


class ExtensionLoginComplete(BaseModel):
    code: str
    state: str
