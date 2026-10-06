from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from database.db import async_session
from database.models import Setting

from .spotify import mark_device_switch

DEFAULT_SETTINGS = {
    "requests_enabled": True,
    "preferred_device": None,
}
DEVICE_FIELDS = ("id", "name", "type")


def _normalize_setting(key: str, value) -> object:
    if key == "preferred_device":
        if value is None:
            return None
        if (
            isinstance(value, dict)
            and all(isinstance(value.get(field), str) for field in DEVICE_FIELDS)
            and _is_selectable_device(value)
        ):
            return {field: value[field] for field in DEVICE_FIELDS}
    elif key in DEFAULT_SETTINGS and type(value) is type(DEFAULT_SETTINGS[key]):
        return value
    raise ValueError(f"Invalid setting: {key}")


def _is_selectable_device(device: dict) -> bool:
    return str(device.get("type", "")).lower() == "computer"


def find_preferred_device(devices: list[dict], preferred: dict | None) -> dict | None:
    if not preferred:
        return None
    devices = [device for device in devices if _is_selectable_device(device)]
    return next((device for device in devices if device.get("id") == preferred["id"]), None) or next(
        (
            device
            for device in devices
            if device.get("name") == preferred["name"] and device.get("type") == preferred["type"]
        ),
        None,
    )


async def get_settings(channel_id: str) -> dict:
    async with async_session() as session:
        result = await session.execute(select(Setting).where(Setting.channel_id == channel_id))
        stored = {setting.key: setting.value for setting in result.scalars().all()}
    return {key: stored.get(key, default) for key, default in DEFAULT_SETTINGS.items()}


async def update_settings(channel_id: str, changes: dict) -> dict:
    changes = {key: _normalize_setting(key, value) for key, value in changes.items()}
    if "preferred_device" in changes:
        await mark_device_switch(channel_id)
    async with async_session() as session:
        for key, value in changes.items():
            await session.execute(
                insert(Setting)
                .values(channel_id=channel_id, key=key, value=value)
                .on_conflict_do_update(index_elements=[Setting.channel_id, Setting.key], set_={"value": value})
            )
        await session.commit()
    return await get_settings(channel_id)
