"""Email + password accounts (Plan 73b): signup, login, wrong password, duplicate, hashing."""

import pytest

from integrations import passwords


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("APP_SECRET", "test-secret")
    monkeypatch.delenv("AUTH_MODE", raising=False)


def test_hash_roundtrip_and_mismatch():
    h = passwords.hash_password("correct horse battery")
    assert h.startswith("scrypt$") and passwords.verify_password("correct horse battery", h)
    assert not passwords.verify_password("wrong", h)
    assert not passwords.verify_password("x", "garbage")
    with pytest.raises(ValueError):
        passwords.hash_password("short")


def test_signup_then_login_owns_campaigns(client):
    r = client.post(
        "/api/auth/signup",
        json={"name": "Tamsin the DM", "email": "Tamsin@Example.com", "password": "rollforinit"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["email"] == "tamsin@example.com"
    assert body["user"]["display_name"] == "Tamsin the DM"
    token = body["token"]
    created = client.post(
        "/api/campaigns",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Mine", "setting": "x", "tone": "y"},
    )
    assert created.status_code == 201 and created.json()["dm_email"] == "tamsin@example.com"
    # Log in again from a fresh device.
    again = client.post(
        "/api/auth/login", json={"email": "tamsin@example.com", "password": "rollforinit"}
    )
    assert again.status_code == 200 and again.json()["user"]["email"] == "tamsin@example.com"


def test_duplicate_signup_and_bad_password(client):
    client.post(
        "/api/auth/signup", json={"name": "A", "email": "dup@example.com", "password": "password1"}
    )
    dup = client.post(
        "/api/auth/signup", json={"name": "B", "email": "dup@example.com", "password": "password2"}
    )
    assert dup.status_code == 422 and "sign in" in dup.json()["detail"]
    bad = client.post("/api/auth/login", json={"email": "dup@example.com", "password": "nope-nope"})
    assert bad.status_code == 401
    unknown = client.post(
        "/api/auth/login", json={"email": "ghost@example.com", "password": "nope-nope"}
    )
    assert unknown.status_code == 401 and unknown.json()["detail"] == bad.json()["detail"]


def test_providers_reports_password_signup(client, monkeypatch):
    assert client.get("/api/auth/providers").json()["password_signup"] is True
    monkeypatch.delenv("APP_SECRET")
    assert client.get("/api/auth/providers").json()["password_signup"] is False
