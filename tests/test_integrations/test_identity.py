"""Tests for integrations.identity — email resolution from request context."""

from unittest.mock import MagicMock, patch

import pytest


class TestGetCurrentUserEmail:
    """Tests for get_current_user_email."""

    def test_returns_email_from_header(self, monkeypatch):
        """Email is extracted from the configured header and lowercased."""
        monkeypatch.setenv("AUTH_EMAIL_HEADER", "X-MS-CLIENT-PRINCIPAL-NAME")
        monkeypatch.setenv("ENV", "production")

        mock_headers = MagicMock()
        mock_headers.get.return_value = "DM@Example.COM"

        with patch("streamlit.context") as mock_ctx:
            mock_ctx.headers = mock_headers
            from integrations.identity import get_current_user_email

            result = get_current_user_email()

        assert result == "dm@example.com"
        mock_headers.get.assert_called_once_with("X-MS-CLIENT-PRINCIPAL-NAME")

    def test_falls_back_to_env_in_development(self, monkeypatch):
        """Falls back to CURRENT_USER_EMAIL when header absent in dev mode."""
        monkeypatch.setenv("ENV", "development")
        monkeypatch.setenv("CURRENT_USER_EMAIL", "local@dev.test")
        monkeypatch.setenv("AUTH_EMAIL_HEADER", "X-MS-CLIENT-PRINCIPAL-NAME")

        mock_headers = MagicMock()
        mock_headers.get.return_value = None

        with patch("streamlit.context") as mock_ctx:
            mock_ctx.headers = mock_headers
            # Force re-import to pick up env changes
            import importlib

            import integrations.identity as identity_mod

            importlib.reload(identity_mod)
            result = identity_mod.get_current_user_email()

        assert result == "local@dev.test"

    def test_raises_in_production_without_header(self, monkeypatch):
        """Raises PermissionError in production when header is missing (fail-closed)."""
        monkeypatch.setenv("ENV", "production")
        monkeypatch.delenv("CURRENT_USER_EMAIL", raising=False)

        mock_headers = MagicMock()
        mock_headers.get.return_value = None

        with patch("streamlit.context") as mock_ctx:
            mock_ctx.headers = mock_headers
            import importlib

            import integrations.identity as identity_mod

            importlib.reload(identity_mod)

            with pytest.raises(PermissionError, match="Access denied"):
                identity_mod.get_current_user_email()

    def test_strips_whitespace_from_email(self, monkeypatch):
        """Whitespace is stripped from the extracted email."""
        monkeypatch.setenv("AUTH_EMAIL_HEADER", "X-MS-CLIENT-PRINCIPAL-NAME")
        monkeypatch.setenv("ENV", "production")

        mock_headers = MagicMock()
        mock_headers.get.return_value = "  dm@example.com  "

        with patch("streamlit.context") as mock_ctx:
            mock_ctx.headers = mock_headers
            import importlib

            import integrations.identity as identity_mod

            importlib.reload(identity_mod)
            result = identity_mod.get_current_user_email()

        assert result == "dm@example.com"
