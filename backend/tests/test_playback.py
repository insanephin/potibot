from core.playback import build_playback_state, current_track_uri, playback_changed


def player(uri="spotify:track:1", playing=True, progress=1000, device="dev1"):
    return {
        "device": {"id": device, "name": "PC", "type": "Computer", "volume_percent": 50},
        "is_playing": playing,
        "progress_ms": progress,
        "item": {"id": "1", "uri": uri, "name": "Song", "duration_ms": 200000, "artists": [{"name": "A"}]},
    }


def test_nothing_playing():
    assert build_playback_state(None) == {
        "event": "playback_update",
        "device": None,
        "paused": True,
        "position": 0,
        "duration": 0,
        "track_window": None,
    }


def test_playing_track():
    state = build_playback_state(player())
    assert state["device"] == {"id": "dev1", "name": "PC", "type": "Computer"}
    assert state["paused"] is False
    assert state["position"] == 1000
    assert current_track_uri(state) == "spotify:track:1"
    assert state["track_window"]["current_track"]["album"] == {"name": None, "images": []}


def test_playback_changed():
    previous = build_playback_state(player(progress=1000))
    assert playback_changed(None, previous, 0)
    assert not playback_changed(previous, build_playback_state(player(progress=6000)), 5000)
    assert playback_changed(previous, build_playback_state(player(progress=60000)), 5000)
    assert playback_changed(previous, build_playback_state(player(uri="spotify:track:2")), 0)
    assert playback_changed(previous, build_playback_state(player(playing=False)), 0)
    assert playback_changed(previous, build_playback_state(player(device="dev2")), 0)
