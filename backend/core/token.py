from sqlalchemy import func, update
from sqlalchemy.dialects.postgresql import insert

from database.db import async_session
from database.models import AuthToken, SpotifyApp
from providers.http import token_fields


async def save_provider_token(session, user_id, provider: str, token) -> None:
    fields = token_fields(token)
    values = {
        AuthToken.access_token: fields["access_token"],
        AuthToken.refresh_token: fields["refresh_token"],
        AuthToken.token_type: fields["token_type"],
        AuthToken.expires_in: fields["expires_in"],
        AuthToken.scope: fields["scope"],
    }
    statement = (
        insert(AuthToken)
        .values({AuthToken.user_id: user_id, AuthToken.provider: provider, **values})
        .on_conflict_do_update(index_elements=[AuthToken.user_id, AuthToken.provider], set_=values)
    )
    await session.execute(statement)


async def persist_refreshed_token(
    user_id=None,
    provider: str | None = None,
    access_token: str | None = None,
    refresh_token: str | None = None,
    token_type: str | None = None,
    expires_in: int | None = None,
    scope: str | None = None,
) -> None:
    if not user_id or not provider or not access_token:
        return

    statement = insert(AuthToken).values(
        user_id=user_id,
        provider=provider,
        access_token=access_token,
        refresh_token=refresh_token,
        token_type=token_type,
        expires_in=expires_in,
        scope=scope,
    )
    excluded = statement.excluded
    statement = statement.on_conflict_do_update(
        index_elements=[AuthToken.user_id, AuthToken.provider],
        set_={
            AuthToken.access_token: excluded.accessToken,
            AuthToken.refresh_token: func.coalesce(excluded.refreshToken, AuthToken.refresh_token),
            AuthToken.token_type: func.coalesce(excluded.tokenType, AuthToken.token_type),
            AuthToken.expires_in: func.coalesce(excluded.expiresIn, AuthToken.expires_in),
            AuthToken.scope: func.coalesce(excluded.scope, AuthToken.scope),
        },
    )
    async with async_session() as session:
        await session.execute(statement)
        await session.commit()


async def drop_refresh_token(user_id=None, provider: str | None = None, refresh_token: str | None = None) -> None:
    if not user_id or not provider or not refresh_token:
        return
    async with async_session() as session:
        await session.execute(
            update(AuthToken)
            .where(
                AuthToken.user_id == user_id,
                AuthToken.provider == provider,
                AuthToken.refresh_token == refresh_token,
            )
            .values(refresh_token=None)
        )
        await session.commit()


async def load_spotify_app(user_id: str) -> tuple[str, str] | None:
    async with async_session() as session:
        app = await session.get(SpotifyApp, user_id)
    return (app.client_id, app.client_secret) if app else None
