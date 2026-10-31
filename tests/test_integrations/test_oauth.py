"""OAuth helpers (Plan 73): configuration detection and Patreon identity parsing.

Plan 124 dropped the Patreon membership scope (it only fed the AI quotas);
Patreon sign-in keeps working on identity alone.
"""

from integrations import oauth


def test_unconfigured_by_default(monkeypatch):
    for k in (
        "DISCORD_CLIENT_ID",
        "DISCORD_CLIENT_SECRET",
        "PATREON_CLIENT_ID",
        "PATREON_CLIENT_SECRET",
    ):
        monkeypatch.delenv(k, raising=False)
    assert oauth.configured_providers() == []


def test_patreon_parse_identity():
    doc = {
        "data": {
            "id": "u1",
            "attributes": {
                "email": "p@example.com",
                "full_name": "Pat Ron",
                "image_url": "https://img.example/p.png",
                "is_email_verified": True,
            },
        },
    }
    prof = oauth.parse_patreon_identity(doc)
    assert prof.provider == "patreon" and prof.provider_id == "u1"
    assert prof.email == "p@example.com" and prof.display_name == "Pat Ron"
    assert prof.avatar_url == "https://img.example/p.png"
    assert prof.email_verified is True


def test_patreon_parse_ignores_membership_and_defaults_unverified():
    doc = {
        "data": {"id": "u1", "attributes": {"email": "p@example.com"}},
        "included": [
            {
                "type": "member",
                "attributes": {"patron_status": "active_patron"},
                "relationships": {"campaign": {"data": {"id": "999"}}},
            }
        ],
    }
    prof = oauth.parse_patreon_identity(doc)
    assert prof.email == "p@example.com"
    assert prof.email_verified is False
    assert not hasattr(prof, "patron_active")


def test_patreon_login_asks_for_identity_only(monkeypatch):
    monkeypatch.setenv("PATREON_CLIENT_ID", "pid")
    monkeypatch.setenv("PATREON_CLIENT_SECRET", "psecret")
    monkeypatch.setenv("OAUTH_REDIRECT_BASE", "http://testserver/api")
    url = oauth.authorize_url("patreon", "state123")
    assert url.startswith("https://www.patreon.com/oauth2/authorize?")
    assert "memberships" not in url
    assert "identity" in url
