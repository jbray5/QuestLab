"""OAuth helpers (Plan 73): configuration detection and Patreon membership parsing."""

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


def test_patreon_parse_active_patron_of_our_campaign():
    doc = {
        "data": {"id": "u1", "attributes": {"email": "p@example.com", "full_name": "Pat Ron"}},
        "included": [
            {
                "type": "member",
                "attributes": {
                    "patron_status": "active_patron",
                    "currently_entitled_amount_cents": 500,
                },
                "relationships": {"campaign": {"data": {"id": "999"}}},
            }
        ],
    }
    prof = oauth.parse_patreon_identity(doc, "999")
    assert prof.patron_active and prof.patron_tier_cents == 500 and prof.email == "p@example.com"


def test_patreon_parse_ignores_other_campaigns_and_former_patrons():
    doc = {
        "data": {"id": "u1", "attributes": {"email": "p@example.com"}},
        "included": [
            {
                "type": "member",
                "attributes": {"patron_status": "active_patron"},
                "relationships": {"campaign": {"data": {"id": "111"}}},
            },
            {
                "type": "member",
                "attributes": {"patron_status": "former_patron"},
                "relationships": {"campaign": {"data": {"id": "999"}}},
            },
        ],
    }
    assert not oauth.parse_patreon_identity(doc, "999").patron_active
