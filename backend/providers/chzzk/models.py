from pydantic import BaseModel


class AccountInfo(BaseModel):
    channelId: str


class AccessToken(BaseModel):
    accessToken: str
    refreshToken: str
    tokenType: str = "Bearer"
    expiresIn: int | None = None
    scope: str | None = None


class SessionCreate(BaseModel):
    url: str


class SystemMessage(BaseModel):
    type: str
    data: dict | None = None


class Profile(BaseModel):
    nickname: str


class Chat(BaseModel):
    channelId: str
    senderChannelId: str
    profile: Profile
    content: str


class Message(BaseModel):
    messageId: str


class ChannelInfo(BaseModel):
    channelId: str
    channelName: str
    channelImageUrl: str | None = None
    verifiedMark: bool | None = None


class LiveInfo(BaseModel):
    channelId: str | None = None
