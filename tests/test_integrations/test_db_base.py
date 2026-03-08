"""Tests for db.base — connection string construction and session factory."""

import pytest


class TestBuildConnectionString:
    """Tests for _build_connection_string."""

    def test_postgres_url_structure(self, monkeypatch):
        """Postgres URL includes all required components."""
        monkeypatch.setenv("DB_BACKEND", "postgres")
        monkeypatch.setenv("PGHOST", "db.example.com")
        monkeypatch.setenv("PGPORT", "5432")
        monkeypatch.setenv("PGDATABASE", "questlab")
        monkeypatch.setenv("PGUSER", "qluser")
        monkeypatch.setenv("PGPASSWORD", "s3cr3t")
        monkeypatch.setenv("PGSSLMODE", "require")

        import importlib

        import db.base as db_mod

        importlib.reload(db_mod)
        url = db_mod._build_connection_string()

        assert "postgresql+psycopg2" in url
        assert "db.example.com" in url
        assert "questlab" in url
        assert "sslmode=require" in url

    def test_duckdb_url_structure(self, monkeypatch):
        """DuckDB URL points to configured path."""
        monkeypatch.setenv("DB_BACKEND", "duckdb")
        monkeypatch.setenv("DUCKDB_PATH", "/tmp/test.duckdb")

        import importlib

        import db.base as db_mod

        importlib.reload(db_mod)
        url = db_mod._build_connection_string()

        assert "duckdb" in url
        assert "/tmp/test.duckdb" in url

    def test_unknown_backend_raises(self, monkeypatch):
        """Unknown DB_BACKEND raises ValueError."""
        monkeypatch.setenv("DB_BACKEND", "mysql")

        import importlib

        import db.base as db_mod

        importlib.reload(db_mod)

        with pytest.raises(ValueError, match="Unknown DB_BACKEND"):
            db_mod._build_connection_string()
