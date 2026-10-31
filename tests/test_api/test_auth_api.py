"""Auth API (Plan 73): providers, OAuth completion with a stubbed provider, bearer
sessions, and header rejection in oauth mode."""

import pytest

from integrations import oauth, session_token

_AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("APP_SECRET", "test-secret")
    monkeypatch.setenv("DISCORD_CLIENT_ID", "cid")
    monkeypatch.setenv("DISCORD_CLIENT_SECRET", "csecret")
    monkeypatch.setenv("OAUTH_REDIRECT_BASE", "http://testserver/api")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://front.test")
    monkeypatch.delenv("AUTH_MODE", raising=False)


def _stub_exchange(monkeypatch, email="new.dm@example.com"):
    monkeypatch.setattr(
        oauth,
        "exchange_code",
        lambda provider, code, **kw: oauth.OAuthProfile(
            provider=provider,
            provider_id="42",
            email=email,
            display_name="New DM",
            avatar_url=None,
            email_verified=True,
        ),
    )


def test_providers_reports_config(client):
    body = client.get("/api/auth/providers").json()
    assert body["providers"] == ["discord"] and body["mode"] == "header"
    assert "ai_gate" not in body


def test_start_redirects_to_provider(client):
    resp = client.get("/api/auth/discord/start", follow_redirects=False)
    assert resp.status_code == 302
    assert resp.headers["location"].startswith("https://discord.com/oauth2/authorize?")
    assert "state=" in resp.headers["location"]


def test_callback_issues_session_and_me_works(client, monkeypatch):
    _stub_exchange(monkeypatch)
    state = session_token.issue("anon", kind="state", extra={"provider": "discord"})
    resp = client.get(f"/api/auth/discord/callback?code=abc&state={state}", follow_redirects=False)
    assert resp.status_code == 302
    loc = resp.headers["location"]
    assert loc.startswith("http://front.test/welcome#token=")
    token = loc.split("#token=", 1)[1]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "new.dm@example.com" and me.json()["discord_linked"] is True
    # The same identity now owns campaigns it creates.
    created = client.post(
        "/api/campaigns",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Mine", "setting": "x", "tone": "y"},
    )
    assert created.status_code == 201 and created.json()["dm_email"] == "new.dm@example.com"


def test_callback_rejects_bad_state(client, monkeypatch):
    _stub_exchange(monkeypatch)
    resp = client.get("/api/auth/discord/callback?code=abc&state=garbage", follow_redirects=False)
    assert resp.status_code == 302 and "error=" in resp.headers["location"]


def test_oauth_mode_ignores_client_header(client, monkeypatch):
    monkeypatch.setenv("AUTH_MODE", "oauth")
    resp = client.get("/api/campaigns", headers={_AUTH_HEADER: "victim@example.com"})
    assert resp.status_code == 401
    token = session_token.issue("real@example.com")
    ok = client.get("/api/campaigns", headers={"Authorization": f"Bearer {token}"})
    assert ok.status_code == 200


def test_patreon_sign_in_stores_identity_only(client, monkeypatch):
    """Patreon still signs people in; no membership snapshot is written (Plan 124)."""
    monkeypatch.setenv("PATREON_CLIENT_ID", "pid")
    monkeypatch.setenv("PATREON_CLIENT_SECRET", "psecret")
    _stub_exchange(monkeypatch, email="patron.dm@example.com")
    state = session_token.issue("anon", kind="state", extra={"provider": "patreon"})
    resp = client.get(f"/api/auth/patreon/callback?code=abc&state={state}", follow_redirects=False)
    assert resp.status_code == 302
    token = resp.headers["location"].split("#token=", 1)[1]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["email"] == "patron.dm@example.com" and me["patreon_linked"] is True
    assert "patron_active" not in me and "tier" not in me
