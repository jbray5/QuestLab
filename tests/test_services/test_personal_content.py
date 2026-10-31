"""The personal-licence gate (Plan 77): non-SRD text reaches only the deployment's admins.

Moved from the AI-tier tests when Plan 124 removed generative AI; the gate now
lives in ``services.auth_service``.
"""

from services import auth_service


class TestPersonalContent:
    """Non-SRD text only reaches the deployment's own admins."""

    def test_only_admins(self, monkeypatch):
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "Owner@Example.com")
        assert auth_service.personal_content_allowed("owner@example.com")
        assert not auth_service.personal_content_allowed("someone@example.com")

    def test_case_and_whitespace_insensitive(self, monkeypatch):
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", " owner@example.com , other@example.com")
        assert auth_service.personal_content_allowed("  OWNER@example.com ")
        assert auth_service.personal_content_allowed("other@example.com")

    def test_nobody_when_unset(self, monkeypatch):
        monkeypatch.delenv("BOOTSTRAP_ADMIN_EMAILS", raising=False)
        assert not auth_service.personal_content_allowed("owner@example.com")
