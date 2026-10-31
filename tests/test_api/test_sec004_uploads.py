"""SEC-004 — uploads are typed by their bytes and served inert.

A file named ``evil.html`` (or an SVG) sent with an image content-type used to be
stored under its own extension and served from the API origin. Now the stored
extension comes from the magic bytes, active content is refused, only media
extensions are served from ``/uploads/``, and every response says ``nosniff``.
"""

from pathlib import Path

import pytest

from services.upload_service import IMAGE_TYPES, accept_upload, is_servable, sniff_media

_AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
_DM = {_AUTH_HEADER: "dm_sec004@example.com"}

_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
_GIF = b"GIF89a" + b"\x00" * 32
_WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 32
_MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 16
_WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 32
_HTML = b"<html><script>alert(document.cookie)</script></html>"
_SVG = b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'


@pytest.mark.parametrize(
    "data,ext",
    [(_PNG, "png"), (_JPEG, "jpg"), (_GIF, "gif"), (_WEBP, "webp"), (_MP4, "mp4"), (_WEBM, "webm")],
)
def test_sniff_recognises_media(data, ext):
    """Each supported format is identified from its leading bytes."""
    kind = sniff_media(data)
    assert kind is not None and kind.ext == ext


@pytest.mark.parametrize("data", [_HTML, _SVG, b"", b"hello", b"%PDF-1.7"])
def test_sniff_refuses_active_and_unknown(data):
    """HTML, SVG, empty and unknown bytes are not media."""
    assert sniff_media(data) is None


def test_accept_upload_checks_the_allowed_set():
    """A video is not accepted where only images are allowed."""
    assert accept_upload(_PNG, IMAGE_TYPES) is not None
    assert accept_upload(_MP4, IMAGE_TYPES) is None


@pytest.mark.parametrize(
    "path,ok",
    [
        ("/uploads/a.png", True),
        ("/uploads/a.JPG", True),
        ("/uploads/a.glb", True),
        ("/uploads/a.html", False),
        ("/uploads/a.svg", False),
        ("/uploads/a", False),
        ("/uploads/a.png.html", False),
    ],
)
def test_is_servable(path, ok):
    """Only extensions we would have stored are served."""
    assert is_servable(path) is ok


def test_html_named_png_is_refused(client):
    """An HTML file dressed as a PNG is refused (the old code stored it as .html)."""
    resp = client.post(
        "/api/uploads", headers=_DM, files={"file": ("evil.html", _HTML, "image/png")}
    )
    assert resp.status_code == 415


def test_svg_is_refused_everywhere(client):
    """SVG can carry script; neither the portrait nor the map upload takes it."""
    for route in ("/api/uploads", "/api/uploads/map"):
        resp = client.post(route, headers=_DM, files={"file": ("x.svg", _SVG, "image/svg+xml")})
        assert resp.status_code == 415, route


def test_extension_comes_from_bytes_not_name(client):
    """A real PNG named .html is stored as .png, and served with nosniff and a sandbox CSP."""
    resp = client.post(
        "/api/uploads", headers=_DM, files={"file": ("photo.html", _PNG, "text/html")}
    )
    assert resp.status_code == 201, resp.text
    url = resp.json()["url"]
    assert url.startswith("/uploads/") and url.endswith(".png")
    try:
        got = client.get(url)
        assert got.status_code == 200
        assert got.headers["x-content-type-options"] == "nosniff"
        assert "sandbox" in got.headers["content-security-policy"]
    finally:
        stored = Path(__file__).resolve().parents[2] / url.lstrip("/")
        stored.unlink(missing_ok=True)


def test_non_media_files_are_not_served(client):
    """Anything already sitting in uploads/ with an active extension is not served."""
    uploads = Path(__file__).resolve().parents[2] / "uploads"
    uploads.mkdir(exist_ok=True)
    planted = uploads / "sec004-planted.html"
    planted.write_bytes(_HTML)
    try:
        assert client.get("/uploads/sec004-planted.html").status_code == 404
    finally:
        planted.unlink(missing_ok=True)


def test_api_responses_say_nosniff(client):
    """Every response carries X-Content-Type-Options: nosniff."""
    assert client.get("/api/health").headers["x-content-type-options"] == "nosniff"
