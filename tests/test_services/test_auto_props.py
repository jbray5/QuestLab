"""Plan 46 tests — the pure-python PNG codec that outlived the auto-props pipeline.

The AI ground-layer repaint and footprint diff went with generative AI in
Plan 124; ``encode_rgb_png`` / ``decode_png`` stay (the Town Crier roster
script paints its procedural avatars with them), so their round trip is pinned
here.
"""

from integrations import image_tools


def _scene_png(with_features: bool) -> bytes:
    """A 192x128 'map': green field; optionally a tree blob + gray stone."""
    w, h = 192, 128
    px = bytearray()
    for y in range(h):
        for x in range(w):
            r, g, b = 90, 150, 60  # grass
            if with_features:
                if (x - 48) ** 2 + (y - 40) ** 2 < 22**2:
                    r, g, b = 30, 110, 30  # dark green canopy
                elif (x - 140) ** 2 + (y - 90) ** 2 < 11**2:
                    r, g, b = 120, 120, 125  # gray stone
            px += bytes((r, g, b))
    return image_tools.encode_rgb_png(w, h, bytes(px))


class TestImageTools:
    """PNG codec on synthetic scenes."""

    def test_roundtrip_decode(self):
        """encode_rgb_png output decodes back to the same dimensions."""
        png = _scene_png(True)
        w, h, bpp, data = image_tools.decode_png(png)
        assert (w, h, bpp) == (192, 128, 3)
        assert len(data) == 192 * 128 * 3

    def test_roundtrip_preserves_pixels(self):
        """The decoded bytes are the pixels that went in."""
        w, h, bpp, data = image_tools.decode_png(_scene_png(True))
        stride = w * bpp
        tree = data[40 * stride + 48 * bpp : 40 * stride + 48 * bpp + 3]
        grass = data[0:3]
        assert tuple(tree) == (30, 110, 30)
        assert tuple(grass) == (90, 150, 60)
