"""Plan 120 — real accounts can't be taken over (review 10/30, item 4).

Campaigns key on the DM's email. Before accounts, typing an email was being
that DM, so an email that already owns campaigns has no proof of ownership:
signing up on it needs the server's claim code, an unverified OAuth email
never attaches to it, and nothing mints tokens from a header in production.
"""

import uuid

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
    monkeypatch.delenv("ACCOUNT_CLAIM_CODE", raising=False)


def _owner_with_a_campaign(client) -> str:
    """A header-era DM: campaigns under an email, no password anywhere."""
    email = f"owner-{uuid.uuid4().hex[:6]}@example.com"
    made = client.post(
        "/api/campaigns", headers={_AUTH_HEADER: email}, json={"name": "The Severance"}
    )
    assert made.status_code == 201, made.text
    return email


def _signup(client, email, claim_code=None):
    body = {"name": "Someone", "email": email, "password": "rollforinit"}
    if claim_code is not None:
        body["claim_code"] = claim_code
    return client.post("/api/auth/signup", json=body)


class TestClaimingAnEmailThatOwnsCampaigns:
    """The hole: the first stranger to sign up with your email got your campaigns."""

    def test_a_stranger_without_the_code_is_refused(self, client, monkeypatch):
        monkeypatch.setenv("ACCOUNT_CLAIM_CODE", "the-real-code")
        email = _owner_with_a_campaign(client)
        assert _signup(client, email).status_code == 422
        wrong = _signup(client, email, "guess")
        assert wrong.status_code == 422 and "claim code" in wrong.json()["detail"]

    def test_no_code_configured_means_nobody_can_claim(self, client):
        email = _owner_with_a_campaign(client)
        assert _signup(client, email, "anything").status_code == 422

    def test_the_owner_with_the_code_gets_their_campaigns(self, client, monkeypatch):
        monkeypatch.setenv("ACCOUNT_CLAIM_CODE", "the-real-code")
        email = _owner_with_a_campaign(client)
        ok = _signup(client, email, "the-real-code")
        assert ok.status_code == 201, ok.text
        token = ok.json()["token"]
        mine = client.get("/api/campaigns", headers={"Authorization": f"Bearer {token}"})
        assert [c["name"] for c in mine.json()] == ["The Severance"]
        # Claimed once: the same email now just signs in.
        again = _signup(client, email, "the-real-code")
        assert again.status_code == 422 and "sign in" in again.json()["detail"]

    def test_a_fresh_email_needs_no_code(self, client):
        assert _signup(client, f"new-{uuid.uuid4().hex[:6]}@example.com").status_code == 201


class TestOAuthEmailMustBeVerified:
    """A provider address nobody proved can't open someone else's account."""

    def _stub(self, monkeypatch, email, verified):
        monkeypatch.setattr(
            oauth,
            "exchange_code",
            lambda provider, code, **kw: oauth.OAuthProfile(
                provider=provider,
                provider_id=uuid.uuid4().hex,
                email=email,
                display_name="Whoever",
                avatar_url=None,
                email_verified=verified,
            ),
        )

    def _callback(self, client):
        state = session_token.issue(
            "anon", kind="state", extra={"provider": "discord", "link": False}
        )
        return client.get(
            f"/api/auth/discord/callback?code=abc&state={state}", follow_redirects=False
        )

    def test_unverified_email_does_not_sign_in_as_the_owner(self, client, monkeypatch):
        email = _owner_with_a_campaign(client)
        self._stub(monkeypatch, email, verified=False)
        resp = self._callback(client)
        assert resp.status_code == 302
        assert "#token=" not in resp.headers["location"]
        assert "error=" in resp.headers["location"]

    def test_verified_email_reaches_the_owners_campaigns(self, client, monkeypatch):
        email = _owner_with_a_campaign(client)
        self._stub(monkeypatch, email, verified=True)
        loc = self._callback(client).headers["location"]
        token = loc.split("#token=", 1)[1]
        mine = client.get("/api/campaigns", headers={"Authorization": f"Bearer {token}"})
        assert [c["name"] for c in mine.json()] == ["The Severance"]


class TestNothingMintsTokensFromAHeaderInProduction:
    """dev-token turned a spoofable header into a 30-day token that outlived the switch."""

    def test_dev_token_is_gone_in_production(self, client, monkeypatch):
        monkeypatch.setenv("ENV", "production")
        resp = client.get("/api/auth/dev-token", headers={_AUTH_HEADER: "victim@example.com"})
        assert resp.status_code == 404

    def test_dev_token_still_works_locally(self, client, monkeypatch):
        monkeypatch.setenv("ENV", "development")
        resp = client.get("/api/auth/dev-token", headers={_AUTH_HEADER: "me@example.com"})
        assert resp.status_code == 200 and resp.json()["token"]

    def test_no_env_fallback_identity_in_production(self, client, monkeypatch):
        monkeypatch.setenv("ENV", "production")
        monkeypatch.setenv("CURRENT_USER_EMAIL", "someone@example.com")
        assert client.get("/api/campaigns").status_code == 401
