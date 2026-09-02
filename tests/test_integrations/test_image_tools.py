"""Chroma-key pipeline tests (Plan 62 + shadow-despill residue fix)."""

from integrations.image_tools import decode_png, encode_rgb_png, key_chroma

MAG = (250, 20, 245)  # what models actually paint for "#FF00FF"
GRAY = (100, 100, 100)
PINK_SHADOW = (140, 90, 110)  # pinkish drop-shadow, outside key tolerance


def _synthetic() -> bytes:
    """60x60: magenta field, gray subject, THICK pink shadow pool below it.

    The pool is 12px tall so its interior sits far from any keyed pixel —
    the case a fixed-width despill band missed on real renders.
    """
    w = h = 60
    px = bytearray()
    for y in range(h):
        for x in range(w):
            if 15 <= x < 45 and 10 <= y < 40:
                px += bytes(GRAY)
            elif 10 <= x < 50 and 40 <= y < 52:
                px += bytes(PINK_SHADOW)
            else:
                px += bytes(MAG)
    return encode_rgb_png(w, h, bytes(px))


class TestKeyChroma:
    """key_chroma keys the backdrop and neutralizes pink shadow residue."""

    def test_backdrop_keyed_subject_kept(self):
        w, h, bpp, out = decode_png(key_chroma(_synthetic()))
        assert bpp == 4
        corner = (2 * w + 2) * 4
        assert out[corner + 3] == 0  # backdrop transparent
        mid = (25 * w + 30) * 4
        assert out[mid + 3] == 255 and out[mid] == 100  # subject untouched

    def test_pink_shadow_neutralized(self):
        w, _h, _bpp, out = decode_png(key_chroma(_synthetic()))
        # Dead center of the thick pool — far from every keyed pixel.
        d = (46 * w + 30) * 4
        r, g, b = out[d], out[d + 1], out[d + 2]
        assert r == g == b, f"pool interior still tinted: {(r, g, b)}"

    def test_fail_open_on_garbage(self):
        assert key_chroma(b"not a png") == b"not a png"

    def test_no_backdrop_untouched(self):
        w = h = 20
        px = bytes(GRAY) * (w * h)
        png = encode_rgb_png(w, h, px)
        assert key_chroma(png) == png
