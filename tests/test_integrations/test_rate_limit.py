"""Per-IP throttling (Plan 77): buckets, limits, the off switch, forwarded IPs."""

import pytest

from integrations import rate_limit as rl


@pytest.fixture(autouse=True)
def _fresh(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT", "on")
    monkeypatch.setenv("RATE_LIMIT_AUTH_PER_MIN", "3")
    monkeypatch.setenv("RATE_LIMIT_WRITES_PER_MIN", "5")
    rl.reset()
    yield
    rl.reset()


def test_buckets():
    assert rl.bucket_for("/api/auth/login", "POST") == ("auth", 3)
    assert rl.bucket_for("/api/play/join/abc/characters", "POST") == ("auth", 3)
    assert rl.bucket_for("/api/play/join/abc/options", "GET") is None
    assert rl.bucket_for("/api/campaigns", "POST") == ("writes", 5)
    assert rl.bucket_for("/api/campaigns", "GET") is None
    assert rl.bucket_for("/api/sessions/x/table/stream", "GET") is None


def test_auth_limit_trips_then_reports_wait():
    for _ in range(3):
        assert rl.check("/api/auth/login", "POST", {}, "1.2.3.4") is None
    wait = rl.check("/api/auth/login", "POST", {}, "1.2.3.4")
    assert isinstance(wait, int) and 1 <= wait <= 60


def test_buckets_and_ips_are_independent():
    for _ in range(3):
        rl.check("/api/auth/login", "POST", {}, "1.1.1.1")
    assert rl.check("/api/auth/login", "POST", {}, "2.2.2.2") is None  # other IP
    assert rl.check("/api/campaigns", "POST", {}, "1.1.1.1") is None  # other bucket


def test_forwarded_for_wins_over_socket():
    headers = {"x-forwarded-for": "9.9.9.9, 10.0.0.1"}
    for _ in range(3):
        rl.check("/api/auth/login", "POST", headers, "10.0.0.1")
    assert rl.check("/api/auth/login", "POST", headers, "10.0.0.1") is not None
    assert (
        rl.check("/api/auth/login", "POST", {}, "10.0.0.1") is None
    )  # proxy itself is a different key


def test_off_switch(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT", "off")
    for _ in range(10):
        assert rl.check("/api/auth/login", "POST", {}, "5.5.5.5") is None
