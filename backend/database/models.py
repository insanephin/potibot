import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class AuthToken(Base):
    __tablename__ = "auth_token"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), primary_key=True
    )
    provider: Mapped[str] = mapped_column(String(20), primary_key=True)
    access_token: Mapped[str | None] = mapped_column("accessToken", Text)
    refresh_token: Mapped[str | None] = mapped_column("refreshToken", Text)
    token_type: Mapped[str] = mapped_column("tokenType", String(20), default="Bearer")
    expires_in: Mapped[int | None] = mapped_column("expiresIn", Integer)
    scope: Mapped[str | None] = mapped_column(Text)


class User(Base):
    __tablename__ = "user"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    channel_id: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    token: Mapped[str] = mapped_column(String(255), nullable=True)
    token_version: Mapped[int] = mapped_column(Integer, nullable=False)
    is_streamer: Mapped[bool] = mapped_column(Boolean, default=False)


class Channel(Base):
    __tablename__ = "channel"

    channel_id: Mapped[str] = mapped_column(String(50), nullable=False, primary_key=True)
    channel_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    channel_image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)


class Setting(Base):
    __tablename__ = "setting"

    channel_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("user.channel_id", ondelete="CASCADE"), primary_key=True
    )
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)


class Playback(Base):
    __tablename__ = "playback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel_id: Mapped[str] = mapped_column(String(50), ForeignKey("user.channel_id", ondelete="CASCADE"))
    track_uri: Mapped[str] = mapped_column(String(200))
    requester_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    requester_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_played: Mapped[bool] = mapped_column(Boolean, default=False)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
    added_at: Mapped[datetime | None] = mapped_column("addedAt", DateTime(timezone=True), server_default=func.now())


class SpotifyAccessRequest(Base):
    __tablename__ = "spotify_access_request"

    channel_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("user.channel_id", ondelete="CASCADE"), primary_key=True
    )
    email: Mapped[str] = mapped_column(String(254))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SpotifyApp(Base):
    __tablename__ = "spotify_app"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), primary_key=True
    )
    client_id: Mapped[str] = mapped_column(String(64))
    client_secret: Mapped[str] = mapped_column(String(64))
