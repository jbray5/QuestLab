"""Plan 130 — pricing over HTTP: the plan page, 402s, the uploads ledger,
linking a Patreon account, and the admin's Patron comp.

Players never pay. ``PRICING=off`` (the default) caps nothing; ``PRICING=on``
gives a Free DM 2 campaigns and 250 MB. A Patreon link attaches only to the
signed-in DM who started it, and never to a Patreon account already linked to
someone else.
"""

from urllib.parse import parse_qs, unquote, urlparse

import pytest

from integrations import oauth, session_token
from services import plan_service

_ADMIN = "plan130.boss@example.com"
_CAMPAIGN = "7654321"
_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
_GLB = b"glTF" + (2).to_bytes(4, "little") + (20).to_bytes(4, "little") + b"\x00" * 8


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("APP_SECRET", "test-secret")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", _ADMIN)
    monkeypatch.setenv("OAUTH_REDIRECT_BASE", "http://testserver/api")
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://front.test")
    monkeypatch.setenv("PATREON_CLIENT_ID", "pid")
    monkeypatch.setenv("PATREON_CLIENT_SECRET", "psecret")
    monkeypatch.setenv("PATREON_CAMPAIGN_ID", _CAMPAIGN)
    monkeypatch.setenv("PATREON_URL", "https://www.patreon.com/questlab")
    monkeypatch.delenv("PRICING", raising=False)
    monkeypatch.delenv("AUTH_MODE", raising=False)


@pytest.fixture()
def blob(monkeypatch):
    """Uploads land in a fake Blob store (nothing written to disk)."""
    from integrations import blob_storage

    stored = []

    def fake_upload(*, path, data, content_type="image/png"):
        stored.append(path)
        return f"https://blob.example/{path}"

    monkeypatch.setattr(blob_storage, "upload", fake_upload)
    return stored


def _dm(email: str) -> dict:
    return {"X-MS-CLIENT-PRINCIPAL-NAME": email}


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _signup(client, email: str) -> str:
    resp = client.post(
        "/api/auth/signup",
        json={"name": "DM", "email": email, "password": "a-long-password-1"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["token"]


def _new_campaign(client, headers, name="C"):
    return client.post("/api/campaigns", headers=headers, json={"name": name})


# ── The plan page ─────────────────────────────────────────────────────────────


def test_plan_during_the_beta(client):
    body = client.get("/api/me/plan", headers=_dm("beta.dm@example.com")).json()
    assert body["plan"] == "free" and body["why"] is None and body["pricing_on"] is False
    assert body["campaigns_used"] == 0 and body["campaigns_limit"] == 2
    assert body["upload_bytes_used"] == 0
    assert body["upload_bytes_limit"] == plan_service.FREE_UPLOAD_BYTES
    assert body["support_url"] == "https://www.patreon.com/questlab"
    assert body["price_monthly"] == "$4/month" and body["price_yearly"] == "$40/year"
    assert body["patreon_available"] is True and body["patreon_linked"] is False


def test_admin_plan_has_no_limits(client):
    body = client.get("/api/me/plan", headers=_dm(_ADMIN)).json()
    assert body["plan"] == "patron" and body["why"] == "admin"
    assert body["campaigns_limit"] is None and body["upload_bytes_limit"] is None


def test_plan_needs_a_signed_in_dm(client):
    assert client.get("/api/me/plan").status_code == 401


# ── 402s ──────────────────────────────────────────────────────────────────────


def test_third_campaign_is_free_during_the_beta(client):
    dm = _dm("beta.camps@example.com")
    for name in ("One", "Two", "Three"):
        assert _new_campaign(client, dm, name).status_code == 201


def test_third_campaign_is_a_402_with_pricing_on(client, monkeypatch):
    monkeypatch.setenv("PRICING", "on")
    dm = _dm("free.camps@example.com")
    assert _new_campaign(client, dm, "One").status_code == 201
    assert _new_campaign(client, dm, "Two").status_code == 201
    resp = _new_campaign(client, dm, "Three")
    assert resp.status_code == 402
    detail = resp.json()["detail"]
    assert detail["code"] == "plan_limit" and detail["limit"] == "campaigns"
    assert detail["message"] == (
        "Free DMs run two campaigns. Become a Patron for unlimited campaigns, "
        "or delete one you've finished."
    )
    # Nothing was hidden or deleted: both campaigns are still listed.
    assert len(client.get("/api/campaigns", headers=dm).json()) == 2


def test_admin_has_no_campaign_cap(client, monkeypatch):
    monkeypatch.setenv("PRICING", "on")
    for name in ("One", "Two", "Three"):
        assert _new_campaign(client, _dm(_ADMIN), name).status_code == 201


def test_uploads_are_recorded_in_the_ledger(client, blob):
    dm = _dm("ledger.dm@example.com")
    assert (
        client.post("/api/uploads", headers=dm, files={"file": ("a.png", _PNG)}).status_code == 201
    )
    assert (
        client.post("/api/uploads/map", headers=dm, files={"file": ("m.png", _PNG)}).status_code
        == 201
    )
    assert (
        client.post("/api/uploads/model", headers=dm, files={"file": ("f.glb", _GLB)}).status_code
        == 201
    )
    body = client.get("/api/me/plan", headers=dm).json()
    assert body["upload_bytes_used"] == 2 * len(_PNG) + len(_GLB)
    assert [p.split("/")[0] for p in blob] == ["portraits", "maps", "models"]


def test_upload_past_the_free_storage_is_a_402(client, blob, monkeypatch):
    monkeypatch.setenv("PRICING", "on")
    monkeypatch.setattr(plan_service, "FREE_UPLOAD_BYTES", len(_PNG) + 10)
    dm = _dm("free.bytes@example.com")
    assert (
        client.post("/api/uploads", headers=dm, files={"file": ("a.png", _PNG)}).status_code == 201
    )
    for route in ("/api/uploads", "/api/uploads/map"):
        resp = client.post(route, headers=dm, files={"file": ("b.png", _PNG)})
        assert resp.status_code == 402, route
        detail = resp.json()["detail"]
        assert detail["code"] == "plan_limit" and detail["limit"] == "storage"
        assert "Become a Patron" in detail["message"]
    resp = client.post("/api/uploads/model", headers=dm, files={"file": ("f.glb", _GLB)})
    assert resp.status_code == 402
    # A refused file is neither stored nor counted.
    assert len(blob) == 1
    assert client.get("/api/me/plan", headers=dm).json()["upload_bytes_used"] == len(_PNG)


def test_a_bad_file_is_still_a_415_not_a_402(client, blob, monkeypatch):
    monkeypatch.setenv("PRICING", "on")
    monkeypatch.setattr(plan_service, "FREE_UPLOAD_BYTES", 1)
    resp = client.post(
        "/api/uploads", headers=_dm("bad.file@example.com"), files={"file": ("x.html", b"<html>")}
    )
    assert resp.status_code == 415


def test_admin_uploads_past_the_cap(client, blob, monkeypatch):
    monkeypatch.setenv("PRICING", "on")
    monkeypatch.setattr(plan_service, "FREE_UPLOAD_BYTES", 1)
    monkeypatch.setattr(plan_service, "PATRON_UPLOAD_BYTES", 1)
    resp = client.post("/api/uploads", headers=_dm(_ADMIN), files={"file": ("a.png", _PNG)})
    assert resp.status_code == 201


# ── Linking a Patreon account ─────────────────────────────────────────────────


def _stub_patreon(monkeypatch, patreon_id="pat-9", status="active_patron", cents=400, email=None):
    membership = oauth.PatreonMembership(
        found=status is not None, patron_status=status, entitled_cents=cents
    )
    monkeypatch.setattr(
        oauth,
        "exchange_code",
        lambda provider, code, **kw: oauth.OAuthProfile(
            provider="patreon",
            provider_id=patreon_id,
            email=email,
            display_name="Pat",
            avatar_url=None,
            email_verified=bool(email),
            membership=membership,
        ),
    )


def _link_state(client, headers) -> str:
    resp = client.post("/api/me/patreon/link", headers=headers)
    assert resp.status_code == 200, resp.text
    url = urlparse(resp.json()["url"])
    q = parse_qs(url.query)
    assert url.netloc == "www.patreon.com"
    assert q["scope"] == ["identity identity.memberships"]
    return q["state"][0]


def _callback(client, state: str):
    resp = client.get(f"/api/auth/patreon/callback?code=abc&state={state}", follow_redirects=False)
    assert resp.status_code == 302
    return resp.headers["location"]


def _link_result(location: str) -> str:
    assert location.startswith("http://front.test/plan#patreon=")
    return unquote(location.split("#patreon=", 1)[1])


def test_link_state_is_bound_to_the_signed_in_dm(client):
    state = _link_state(client, _dm("linker@example.com"))
    claims = session_token.verify(state, kind="state")
    assert claims["sub"] == "linker@example.com" and claims["intent"] == "link"


def test_link_then_confirm_makes_a_patron(client, monkeypatch):
    dm = _dm("linked.dm@example.com")
    _stub_patreon(monkeypatch)
    location = _callback(client, _link_state(client, dm))
    assert "#token=" not in location  # a link never mints a session
    resp = client.post(
        "/api/me/patreon/confirm", headers=dm, json={"token": _link_result(location)}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["message"] == "Your Patreon is linked. Thank you for being a Patron."
    assert body["status"]["plan"] == "patron" and body["status"]["why"] == "patreon"
    assert body["status"]["patreon_linked"] is True and body["status"]["patreon_counts"] is True


def test_low_tier_link_says_so_and_stays_free(client, monkeypatch):
    dm = _dm("low.dm@example.com")
    _stub_patreon(monkeypatch, patreon_id="pat-low", cents=100)
    location = _callback(client, _link_state(client, dm))
    body = client.post(
        "/api/me/patreon/confirm", headers=dm, json={"token": _link_result(location)}
    ).json()
    assert body["status"]["plan"] == "free" and "below the Patron tier" in body["message"]


def test_a_link_cannot_be_finished_by_another_dm(client, monkeypatch):
    _stub_patreon(monkeypatch, patreon_id="pat-csrf")
    location = _callback(client, _link_state(client, _dm("attacker@example.com")))
    resp = client.post(
        "/api/me/patreon/confirm",
        headers=_dm("victim@example.com"),
        json={"token": _link_result(location)},
    )
    assert resp.status_code == 403
    assert (
        client.get("/api/me/plan", headers=_dm("victim@example.com")).json()["patreon_linked"]
        is False
    )


def test_a_patreon_already_linked_elsewhere_is_refused(client, monkeypatch):
    # Someone signs in with Patreon first: that Patreon id is theirs.
    _stub_patreon(monkeypatch, patreon_id="pat-taken", email="owner@example.com")
    state = session_token.issue("anon", kind="state", extra={"provider": "patreon"})
    assert "#token=" in _callback(client, state)
    location = _callback(client, _link_state(client, _dm("other@example.com")))
    assert location.startswith("http://front.test/plan?")
    error = parse_qs(urlparse(location).query)["patreon_error"][0]
    assert "already linked to another QuestLab account" in error


def test_confirm_refuses_if_linked_elsewhere_meanwhile(client, monkeypatch):
    _stub_patreon(monkeypatch, patreon_id="pat-race")
    location = _callback(client, _link_state(client, _dm("slow@example.com")))
    # Before confirming, the same Patreon account signs in as someone else.
    _stub_patreon(monkeypatch, patreon_id="pat-race", email="fast@example.com")
    state = session_token.issue("anon", kind="state", extra={"provider": "patreon"})
    _callback(client, state)
    resp = client.post(
        "/api/me/patreon/confirm",
        headers=_dm("slow@example.com"),
        json={"token": _link_result(location)},
    )
    assert resp.status_code == 409


def test_a_tampered_link_result_is_refused(client):
    resp = client.post(
        "/api/me/patreon/confirm", headers=_dm("x@example.com"), json={"token": "not-a-real-token"}
    )
    assert resp.status_code == 409


def test_cancelled_link_lands_on_the_plan_page(client):
    state = _link_state(client, _dm("cancel@example.com"))
    resp = client.get(f"/api/auth/patreon/callback?state={state}", follow_redirects=False)
    assert resp.headers["location"].startswith("http://front.test/plan?patreon_error=")


def test_link_without_patreon_configured(client, monkeypatch):
    monkeypatch.delenv("PATREON_CLIENT_ID", raising=False)
    resp = client.post("/api/me/patreon/link", headers=_dm("nolink@example.com"))
    assert resp.status_code == 409
    assert (
        client.get("/api/me/plan", headers=_dm("nolink@example.com")).json()["patreon_available"]
        is False
    )


def test_patreon_sign_in_refreshes_the_membership(client, monkeypatch):
    _stub_patreon(monkeypatch, patreon_id="pat-signin", email="signin.patron@example.com")
    state = session_token.issue("anon", kind="state", extra={"provider": "patreon"})
    token = _callback(client, state).split("#token=", 1)[1]
    body = client.get("/api/me/plan", headers=_bearer(token)).json()
    assert body["plan"] == "patron" and body["why"] == "patreon"
    assert body["patron_checked_at"] is not None


# ── Admin comp ────────────────────────────────────────────────────────────────


def test_comp_is_admin_only(client):
    _signup(client, "friend.comp@example.com")
    resp = client.post(
        "/api/admin/users/friend.comp@example.com/comp",
        headers=_dm("friend.comp@example.com"),
        json={"comped": True},
    )
    assert resp.status_code == 403


def test_admin_gives_and_removes_patron(client, monkeypatch):
    monkeypatch.setenv("PRICING", "on")
    friend = "friend.patron@example.com"
    _signup(client, friend)
    admin = _bearer(_signup(client, _ADMIN))
    resp = client.post(f"/api/admin/users/{friend}/comp", headers=admin, json={"comped": True})
    assert resp.status_code == 200 and resp.json() == {
        "email": friend,
        "comped": True,
        "plan": "patron",
    }
    row = next(
        d
        for d in client.get("/api/admin/beta", headers=admin).json()["dms"]
        if d["email"] == friend
    )
    assert row["plan"] == "patron" and row["comped"] is True
    plan = client.get("/api/me/plan", headers=_dm(friend)).json()
    assert plan["plan"] == "patron" and plan["why"] == "comped"
    for name in ("One", "Two", "Three"):
        assert _new_campaign(client, _dm(friend), name).status_code == 201
    resp = client.post(f"/api/admin/users/{friend}/comp", headers=admin, json={"comped": False})
    assert resp.json()["plan"] == "free"
    # Over the cap now, but nothing is hidden; only a new campaign is refused.
    assert len(client.get("/api/campaigns", headers=_dm(friend)).json()) == 3
    assert _new_campaign(client, _dm(friend), "Four").status_code == 402


def test_comp_for_an_unknown_account_is_a_404(client):
    admin = _bearer(_signup(client, _ADMIN))
    resp = client.post(
        "/api/admin/users/ghost@example.com/comp", headers=admin, json={"comped": True}
    )
    assert resp.status_code == 404
