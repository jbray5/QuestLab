"""Plan 128 — portrait uploads go to Vercel Blob when it's configured.

They used to land on Render's disk with a relative ``/uploads/`` URL, which the
Vercel frontend can't load and the next deploy deletes.
"""

from pathlib import Path

_DM = {"X-MS-CLIENT-PRINCIPAL-NAME": "dm_plan128_up@example.com"}
_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def test_portrait_upload_uses_blob_when_configured(client, monkeypatch):
    """With a blob token, the portrait is stored under portraits/ and its blob URL returned."""
    from integrations import blob_storage

    seen = {}

    def fake_upload(*, path, data, content_type="image/png"):
        seen.update(path=path, size=len(data), content_type=content_type)
        return f"https://blob.example/{path}"

    monkeypatch.setattr(blob_storage, "upload", fake_upload)
    resp = client.post("/api/uploads", headers=_DM, files={"file": ("me.png", _PNG, "image/png")})
    assert resp.status_code == 201, resp.text
    assert resp.json()["url"].startswith("https://blob.example/portraits/")
    assert seen["path"].startswith("portraits/") and seen["path"].endswith(".png")
    assert seen["content_type"] == "image/png" and seen["size"] == len(_PNG)


def test_portrait_upload_falls_back_to_local_disk(client, monkeypatch):
    """Without a blob token (dev), the file is written to uploads/ and served from there."""
    monkeypatch.delenv("BLOB_READ_WRITE_TOKEN", raising=False)
    resp = client.post("/api/uploads", headers=_DM, files={"file": ("me.png", _PNG, "image/png")})
    assert resp.status_code == 201, resp.text
    url = resp.json()["url"]
    assert url.startswith("/uploads/") and url.endswith(".png")
    (Path(__file__).resolve().parents[2] / url.lstrip("/")).unlink(missing_ok=True)
