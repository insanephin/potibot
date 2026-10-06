import pytest

from core.settings import _normalize_setting, find_preferred_device

PC = {"id": "dev1", "name": "PC", "type": "Computer"}


def test_normalize_setting():
    assert _normalize_setting("requests_enabled", False) is False
    assert _normalize_setting("preferred_device", None) is None
    assert _normalize_setting("preferred_device", {**PC, "is_active": True}) == PC


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("unknown", 1),
        ("requests_enabled", "yes"),
        ("preferred_device", {"id": "d", "name": "TV", "type": "TV"}),
        ("preferred_device", {"id": "d"}),
    ],
)
def test_normalize_setting_rejects(key, value):
    with pytest.raises(ValueError, match=f"Invalid setting: {key}"):
        _normalize_setting(key, value)


def test_find_preferred_device():
    renamed_id = {**PC, "id": "dev9"}
    phone = {"id": "dev1", "name": "PC", "type": "Smartphone"}
    assert find_preferred_device([PC], None) is None
    assert find_preferred_device([phone, PC], PC) == PC
    assert find_preferred_device([renamed_id], PC) == renamed_id
    assert find_preferred_device([phone], PC) is None
