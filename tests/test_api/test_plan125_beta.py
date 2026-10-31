"""Plan 125 — the friends beta: invite-only sign-up, invite limits, feedback, admin views.

With ``BETA_INVITES=required`` a NEW DM account (password or a first OAuth
sign-in) needs a valid invite; existing accounts and admins never do. Each
invite has a use limit and can be revoked. Feedback lands in the admin inbox.
"""

from urllib.parse import parse_qs, urlparse

import pytest

from integrations import oauth, session_token

_ADMIN = "boss@example.com"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("APP_SECRET", "test-secret")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", _ADMIN)
    monkeypatch.setenv("BETA_INVITES", "required")
    monkeypatch.setenv("DISCORD_CLIENT_ID", "cid")
    monkeypatch.setenv("DISCORD_CLIENT_SECRET", "csecret")
    monkeypatch.setenv("OAUTH_REDIRECT_BASE", "http://testserver/api")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://front.test")
    monkeypatch.delenv("AUTH_MODE", raising=False)
    monkeypatch.delenv("FEEDBACK_WEBHOOK_URL", raising=False)


def _admin_token(client) -> str:
    resp = client.post(
        "/api/auth/signup",
        json={"name": "Justin", "email": _ADMIN, "password": "a-long-admin-password"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["token"]


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _invite(client, admin_token: str, label="Sam's table", max_uses=1) -> dict:
    resp = client.post(
        "/api/admin/invites",
        headers=_bearer(admin_token),
        json={"label": label, "max_uses": max_uses},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _signup(client, email: str, code=None):
    body = {"name": "Friend", "email": email, "password": "a-long-friend-password"}
    if code is not None:
        body["invite_code"] = code
    return client.post("/api/auth/signup", json=body)


def test_providers_say_invites_are_required(client):
    """The sign-up page learns it needs to ask for a code."""
    assert client.get("/api/auth/providers").json()["invites_required"] is True


def test_admins_sign_up_without_a_code(client):
    """Justin is never locked out of his own app."""
    _admin_token(client)


def test_a_stranger_needs_an_invite(client):
    """No code, no new account, in words a friend can act on."""
    resp = _signup(client, "stranger@example.com")
    assert resp.status_code == 422
    assert "friends-only beta" in resp.json()["detail"]


def test_an_invite_starts_an_account_and_is_remembered(client):
    """A valid code (any case, stray spaces) works and the admin sees who used it."""
    admin = _admin_token(client)
    invite = _invite(client, admin, max_uses=2)
    messy = f"  {invite['code'].lower()} "
    assert client.get(f"/api/auth/invites/{invite['code']}").json() == {
        "valid": True,
        "label": "Sam's table",
    }
    assert _signup(client, "sam@example.com", messy).status_code == 201
    rows = client.get("/api/admin/invites", headers=_bearer(admin)).json()
    row = next(r for r in rows if r["code"] == invite["code"])
    assert row["uses"] == 1
    assert row["joined"] == [{"email": "sam@example.com", "display_name": "Friend"}]
    overview = client.get("/api/admin/beta", headers=_bearer(admin)).json()
    assert overview["invites_required"] is True
    sam = next(d for d in overview["dms"] if d["email"] == "sam@example.com")
    assert sam["invite_code"] == invite["code"] and sam["campaigns"] == 0


def test_a_used_up_invite_is_refused(client):
    """One use means one account."""
    admin = _admin_token(client)
    code = _invite(client, admin, max_uses=1)["code"]
    assert _signup(client, "first@example.com", code).status_code == 201
    second = _signup(client, "second@example.com", code)
    assert second.status_code == 422
    assert "already been used" in second.json()["detail"]
    assert client.get(f"/api/auth/invites/{code}").json()["valid"] is False


def test_a_revoked_invite_is_refused(client):
    """Revoking stops new accounts; it doesn't touch ones already made."""
    admin = _admin_token(client)
    invite = _invite(client, admin, max_uses=5)
    revoked = client.post(f"/api/admin/invites/{invite['id']}/revoke", headers=_bearer(admin))
    assert revoked.status_code == 200 and revoked.json()["revoked"] is True
    resp = _signup(client, "late@example.com", invite["code"])
    assert resp.status_code == 422 and "doesn't work" in resp.json()["detail"]


def test_a_weak_password_does_not_spend_the_invite(client):
    """The use is only spent once the account really starts."""
    admin = _admin_token(client)
    code = _invite(client, admin, max_uses=1)["code"]
    bad = client.post(
        "/api/auth/signup",
        json={"name": "F", "email": "f@example.com", "password": "short", "invite_code": code},
    )
    assert bad.status_code == 422
    assert _signup(client, "f@example.com", code).status_code == 201


def test_existing_accounts_sign_in_without_a_code(client):
    """The gate is for new accounts only."""
    admin = _admin_token(client)
    code = _invite(client, admin)["code"]
    assert _signup(client, "old@example.com", code).status_code == 201
    login = client.post(
        "/api/auth/login", json={"email": "old@example.com", "password": "a-long-friend-password"}
    )
    assert login.status_code == 200


def test_open_signup_when_invites_are_off(client, monkeypatch):
    """BETA_INVITES=off restores open sign-up with no code."""
    monkeypatch.setenv("BETA_INVITES", "off")
    assert client.get("/api/auth/providers").json()["invites_required"] is False
    assert _signup(client, "open@example.com").status_code == 201


def _stub_discord(monkeypatch, email):
    monkeypatch.setattr(
        oauth,
        "exchange_code",
        lambda provider, code, **kw: oauth.OAuthProfile(
            provider=provider,
            provider_id=f"id-{email}",
            email=email,
            display_name="Discord Friend",
            avatar_url=None,
            email_verified=True,
        ),
    )


def test_discord_first_sign_in_needs_the_invite(client, monkeypatch):
    """The invite rides through OAuth in the signed state; without it a new user is told why."""
    admin = _admin_token(client)
    code = _invite(client, admin)["code"]
    start = client.get(f"/api/auth/discord/start?invite={code}", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    assert session_token.verify(state, kind="state")["invite"] == code

    _stub_discord(monkeypatch, "nocode@example.com")
    bare = session_token.issue("anon", kind="state", extra={"provider": "discord"})
    refused = client.get(f"/api/auth/discord/callback?code=x&state={bare}", follow_redirects=False)
    assert "error=" in refused.headers["location"] and "#token=" not in refused.headers["location"]

    _stub_discord(monkeypatch, "invited@example.com")
    ok = client.get(f"/api/auth/discord/callback?code=x&state={state}", follow_redirects=False)
    assert "#token=" in ok.headers["location"]


def test_feedback_reaches_the_admin_inbox(client):
    """A friend sends a note; the admin reads it and marks it seen; others can't read the inbox."""
    admin = _admin_token(client)
    code = _invite(client, admin)["code"]
    friend = _signup(client, "notes@example.com", code).json()["token"]
    sent = client.post(
        "/api/feedback",
        headers=_bearer(friend),
        json={
            "kind": "confusing",
            "text": "Where is End turn?",
            "page": "/sessions/x/hud",
            "viewport": "390×844",
        },
    )
    assert sent.status_code == 201
    assert client.get("/api/admin/feedback", headers=_bearer(friend)).status_code == 403
    inbox = client.get("/api/admin/feedback", headers=_bearer(admin)).json()
    note = next(n for n in inbox if n["email"] == "notes@example.com")
    assert note["kind"] == "confusing" and note["display_name"] == "Friend" and not note["seen"]
    seen = client.post(f"/api/admin/feedback/{note['id']}/seen", headers=_bearer(admin))
    assert seen.json()["seen"] is True


def test_feedback_needs_a_signed_in_dm(client):
    """Anonymous notes are refused."""
    resp = client.post("/api/feedback", json={"kind": "idea", "text": "hi"})
    assert resp.status_code in (401, 403)


def test_only_admins_manage_invites(client):
    """A friend can't mint more invites."""
    admin = _admin_token(client)
    code = _invite(client, admin)["code"]
    friend = _signup(client, "nope@example.com", code).json()["token"]
    assert (
        client.post("/api/admin/invites", headers=_bearer(friend), json={"label": "x"}).status_code
        == 403
    )
