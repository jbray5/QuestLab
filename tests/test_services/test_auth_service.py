"""Tests for services/auth_service.py — admin role enforcement."""

import pytest

import services.auth_service as auth_svc


class TestGetBootstrapAdmins:
    """Tests for auth_service.get_bootstrap_admins."""

    def test_returns_list_from_env(self, monkeypatch):
        """Comma-separated env var is parsed into a list."""
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "a@example.com, B@example.com")
        result = auth_svc.get_bootstrap_admins()
        assert result == ["a@example.com", "b@example.com"]

    def test_empty_env_returns_empty_list(self, monkeypatch):
        """Missing or empty env var returns empty list."""
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "")
        assert auth_svc.get_bootstrap_admins() == []

    def test_normalises_whitespace_and_case(self, monkeypatch):
        """Entries are stripped and lowercased."""
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "  Admin@Test.COM  ")
        assert auth_svc.get_bootstrap_admins() == ["admin@test.com"]

    def test_skips_blank_entries(self, monkeypatch):
        """Blank entries between commas are ignored."""
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "a@x.com,,b@x.com,")
        result = auth_svc.get_bootstrap_admins()
        assert result == ["a@x.com", "b@x.com"]


class TestIsAdmin:
    """Tests for auth_service.is_admin."""

    def test_known_admin_returns_true(self, monkeypatch):
        """Email matching an entry in BOOTSTRAP_ADMIN_EMAILS is admin."""
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "admin@questlab.com")
        assert auth_svc.is_admin("admin@questlab.com") is True

    def test_case_insensitive(self, monkeypatch):
        """Email matching is case-insensitive."""
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "admin@questlab.com")
        assert auth_svc.is_admin("ADMIN@QUESTLAB.COM") is True

    def test_unknown_email_returns_false(self, monkeypatch):
        """Email not in admin list returns False."""
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "admin@questlab.com")
        assert auth_svc.is_admin("dm@questlab.com") is False

    def test_empty_admin_list_returns_false(self, monkeypatch):
        """No admins configured — all emails return False."""
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "")
        assert auth_svc.is_admin("anyone@example.com") is False


class TestRequireAdmin:
    """Tests for auth_service.require_admin."""

    def test_admin_passes_silently(self, monkeypatch):
        """Admin email raises no exception."""
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "admin@questlab.com")
        auth_svc.require_admin("admin@questlab.com")  # should not raise

    def test_non_admin_raises_permission_error(self, monkeypatch):
        """Non-admin email raises PermissionError."""
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "admin@questlab.com")
        with pytest.raises(PermissionError, match="Admin access required"):
            auth_svc.require_admin("intruder@questlab.com")

    def test_empty_admin_list_raises(self, monkeypatch):
        """Any email raises PermissionError when no admins are configured."""
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "")
        with pytest.raises(PermissionError):
            auth_svc.require_admin("anyone@example.com")
