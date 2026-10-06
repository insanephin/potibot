from sqlalchemy import delete, func

from database.db import async_session
from database.models import AuthToken, SpotifyAccessRequest, SpotifyApp, User


def _drop_spotify_token(user: User):
    return delete(AuthToken).where(AuthToken.user_id == user.id, AuthToken.provider == "spotify")


async def disconnect_spotify(user: User) -> None:
    async with async_session() as session:
        await session.execute(_drop_spotify_token(user))
        await session.commit()


async def get_spotify_app(user: User) -> SpotifyApp | None:
    async with async_session() as session:
        return await session.get(SpotifyApp, user.id)


async def save_spotify_app(user: User, client_id: str, client_secret: str) -> None:
    async with async_session() as session:
        spotify_app = await session.get(SpotifyApp, user.id)
        if spotify_app:
            spotify_app.client_id, spotify_app.client_secret = client_id, client_secret
        else:
            session.add(SpotifyApp(user_id=user.id, client_id=client_id, client_secret=client_secret))
        await session.execute(_drop_spotify_token(user))
        await session.commit()


async def delete_spotify_app(user: User) -> None:
    async with async_session() as session:
        await session.execute(delete(SpotifyApp).where(SpotifyApp.user_id == user.id))
        await session.execute(_drop_spotify_token(user))
        await session.commit()


async def get_access_request(user: User) -> SpotifyAccessRequest | None:
    async with async_session() as session:
        return await session.get(SpotifyAccessRequest, user.channel_id)


async def request_access(user: User, email: str) -> SpotifyAccessRequest:
    async with async_session() as session:
        access_request = await session.get(SpotifyAccessRequest, user.channel_id)
        if access_request:
            access_request.email = email
            access_request.status = "pending"
            access_request.requested_at = func.now()
        else:
            access_request = SpotifyAccessRequest(channel_id=user.channel_id, email=email, status="pending")
            session.add(access_request)
        await session.commit()
        await session.refresh(access_request)
    return access_request


async def cancel_access_request(user: User) -> None:
    async with async_session() as session:
        await session.execute(
            delete(SpotifyAccessRequest).where(
                SpotifyAccessRequest.channel_id == user.channel_id, SpotifyAccessRequest.status == "pending"
            )
        )
        await session.commit()
