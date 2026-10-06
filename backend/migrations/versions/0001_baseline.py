from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("channel_id", sa.String(50), nullable=False),
        sa.Column("token", sa.String(255), nullable=True),
        sa.Column("token_version", sa.Integer(), nullable=False),
        sa.Column("is_streamer", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("channel_id"),
    )
    op.create_table(
        "channel",
        sa.Column("channel_id", sa.String(50), nullable=False),
        sa.Column("channel_name", sa.String(50), nullable=True),
        sa.Column("channel_image_url", sa.String(255), nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("channel_id"),
    )
    op.create_table(
        "auth_token",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("accessToken", sa.Text(), nullable=True),
        sa.Column("refreshToken", sa.Text(), nullable=True),
        sa.Column("tokenType", sa.String(20), nullable=False),
        sa.Column("expiresIn", sa.Integer(), nullable=True),
        sa.Column("scope", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "provider"),
    )
    op.create_table(
        "setting",
        sa.Column("channel_id", sa.String(50), nullable=False),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["channel_id"], ["user.channel_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("channel_id", "key"),
    )
    op.create_table(
        "playback",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("channel_id", sa.String(50), nullable=False),
        sa.Column("track_uri", sa.String(200), nullable=False),
        sa.Column("requester_id", sa.String(50), nullable=True),
        sa.Column("requester_name", sa.String(50), nullable=True),
        sa.Column("is_played", sa.Boolean(), nullable=False),
        sa.Column("is_cancelled", sa.Boolean(), nullable=False),
        sa.Column("addedAt", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["channel_id"], ["user.channel_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "spotify_access_request",
        sa.Column("channel_id", sa.String(50), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["channel_id"], ["user.channel_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("channel_id"),
    )
    op.create_table(
        "spotify_app",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", sa.String(64), nullable=False),
        sa.Column("client_secret", sa.String(64), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    for table in ("spotify_app", "spotify_access_request", "playback", "setting", "auth_token", "channel", "user"):
        op.drop_table(table)
