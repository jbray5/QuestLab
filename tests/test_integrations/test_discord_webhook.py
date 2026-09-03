"""Town Crier payload tests (Plan 72 — pre-Session-7 checks).

Two things Justin needed confirmed before sending the harbor notice:
every send carries its OWN identity (username + avatar) so nothing
inherits the previous post, and the embed field accepts a pasted JSON
embed object without posting as literal braces.
"""

from integrations.discord_webhook import build_payload


class TestIdentityPerMessage:
    """Each payload carries the identity it was built with — no carry-over."""

    def test_username_and_avatar_present_every_call(self):
        a = build_payload(
            username="Harbormaster Grale",
            avatar_url="https://x/grale.png",
            content="Boats stay beached.",
        )
        b = build_payload(
            username="Reeve Damson",
            avatar_url="https://x/damson.png",
            content="Market opens at dawn.",
        )
        assert a["username"] == "Harbormaster Grale" and a["avatar_url"] == "https://x/grale.png"
        assert b["username"] == "Reeve Damson" and b["avatar_url"] == "https://x/damson.png"

    def test_no_avatar_omits_key_but_keeps_username(self):
        p = build_payload(username="Brimm", content="One glass, forever.")
        assert p["username"] == "Brimm" and "avatar_url" not in p


class TestEmbedField:
    """Prose stays prose; a JSON embed object becomes the embed."""

    def test_prose_becomes_description(self):
        p = build_payload(
            username="x", embed_description="The tide is wrong tonight.", embed_color=0x123456
        )
        assert p["embeds"] == [{"description": "The tide is wrong tonight.", "color": 0x123456}]

    def test_json_object_is_used_as_embed(self):
        raw = (
            '{"title": "HARBOR NOTICE", "description": "All hulls stay on the sand.", '
            '"fields": [{"name": "By order of", "value": "Harbormaster Grale"}]}'
        )
        p = build_payload(username="x", embed_description=raw, embed_color=0xABCDEF)
        e = p["embeds"][0]
        assert e["title"] == "HARBOR NOTICE" and e["fields"][0]["value"] == "Harbormaster Grale"
        assert e["color"] == 0xABCDEF  # identity color fills in when the JSON has none

    def test_json_color_wins_over_identity_color(self):
        p = build_payload(
            username="x", embed_description='{"description": "d", "color": 1}', embed_color=2
        )
        assert p["embeds"][0]["color"] == 1

    def test_broken_json_falls_back_to_prose(self):
        p = build_payload(username="x", embed_description="{not json")
        assert p["embeds"] == [{"description": "{not json"}]
