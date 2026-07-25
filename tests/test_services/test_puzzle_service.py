"""Plan 55 tests — the Puzzle Workbench.

The two things that must not be wrong: the player projection never leaks
an answer, and the Vigenère alignment matches the method the DM reads
aloud at the table ("each letter steps BACKWARD by the key's letter").
"""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.puzzle_service as pz
from domain.puzzle import PuzzleCreate

# Saturday's refrain: COMEHOMECHILD with E/H pre-known.
GLYPH_CONFIG = {
    "tokens": ["g1", "g2", "g3", "g4", "g5", "g2", "g3", "g4", "g1", "g5", "g6", "g7", "g8"],
    "mapping": {
        "g1": "C",
        "g2": "O",
        "g3": "M",
        "g4": "E",
        "g5": "H",
        "g6": "I",
        "g7": "L",
        "g8": "D",
    },
    "preknown": {"g4": "E", "g5": "H"},
    "answer": "COMEHOMECHILD",
    "hide_spaces": True,
}

CIPHER_CONFIG = {
    "key": "AELIM",
    # "TO WHOEVER" enciphered with AELIM (spaces don't consume key letters).
    "ciphertext": "TS HPAEZPZ",
    "intro": "The marks swim on the page.",
}


def _dm() -> str:
    return f"dm-{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db: Session, dm: str):
    return camp_svc.create_campaign(db, name="C", setting="S", tone="T", dm_email=dm)


def _glyph(db: Session, cid, dm, **over):
    cfg = {**GLYPH_CONFIG, **over}
    return pz.create_puzzle(
        db, cid, dm, PuzzleCreate(kind="glyph", title="The Refrain", config=cfg)
    )


def _cipher(db: Session, cid, dm):
    return pz.create_puzzle(
        db, cid, dm, PuzzleCreate(kind="cipher", title="The Page", config=CIPHER_CONFIG)
    )


class TestProjectionLeaks:
    """The player payload must never carry answers (players open dev tools)."""

    def test_glyph_projection_hides_mapping_and_answer(self, duckdb_session: Session):
        """Only pre-known letters are visible at the start."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        p = _glyph(duckdb_session, c.id, dm)

        proj = pz.get_projection(duckdb_session, p.id)
        blob = proj.model_dump_json()

        assert proj.assignments == {"g4": "E", "g5": "H"}
        assert "COMEHOMECHILD" not in blob
        assert '"mapping"' not in blob
        # The unknown glyphs' letters must not appear anywhere in the payload.
        assert '"g1":"C"' not in blob.replace(" ", "")

    def test_cipher_projection_hides_key_and_plaintext(self, duckdb_session: Session):
        """Warded pages expose no key, and no decoded letters."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        p = _cipher(duckdb_session, c.id, dm)

        proj = pz.get_projection(duckdb_session, p.id)
        blob = proj.model_dump_json()

        assert proj.phase == "warded"
        assert proj.locked == {}
        assert "AELIM" not in blob
        assert "WHOEVER" not in blob.upper()


class TestGlyphBoard:
    """Assignment propagation, reading attempts, the hum counter."""

    def test_assign_propagates_and_clears(self, duckdb_session: Session):
        """One assignment covers every instance of that glyph; "" clears it."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        p = _glyph(duckdb_session, c.id, dm)

        proj = pz.assign_glyph(duckdb_session, p.id, "g2", "o", is_dm=True)
        assert proj.assignments["g2"] == "O"  # normalized, and g2 appears twice
        assert proj.tokens.count("g2") == 2

        proj = pz.assign_glyph(duckdb_session, p.id, "g2", "", is_dm=True)
        assert "g2" not in proj.assignments

    def test_player_input_gated_by_toggle(self, duckdb_session: Session):
        """The shared link can't touch the board unless the DM allows it."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        p = _glyph(duckdb_session, c.id, dm)

        with pytest.raises(PermissionError):
            pz.assign_glyph(duckdb_session, p.id, "g1", "C")

        pz.update_puzzle(
            duckdb_session,
            p.id,
            dm,
            __import__("domain.puzzle", fromlist=["PuzzleUpdate"]).PuzzleUpdate(
                allow_player_input=True
            ),
        )
        proj = pz.assign_glyph(duckdb_session, p.id, "g1", "C")
        assert proj.assignments["g1"] == "C"

    def test_bad_letter_and_unknown_glyph_rejected(self, duckdb_session: Session):
        """Guard rails on the assign endpoint."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        p = _glyph(duckdb_session, c.id, dm)

        with pytest.raises(ValueError):
            pz.assign_glyph(duckdb_session, p.id, "nope", "C", is_dm=True)
        with pytest.raises(ValueError):
            pz.assign_glyph(duckdb_session, p.id, "g1", "CC", is_dm=True)

    def test_wrong_reading_hums_and_right_reading_solves(self, duckdb_session: Session):
        """Wrong readings accumulate hum; the right one fills the board."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        p = _glyph(duckdb_session, c.id, dm)

        wrong = pz.submit_reading(duckdb_session, p.id, "COME HOME CHILL")
        assert wrong["correct"] is False and wrong["hum"] == 1

        right = pz.submit_reading(duckdb_session, p.id, "come home, child")
        assert right["correct"] is True and right["solved"] is True

        proj = pz.get_projection(duckdb_session, p.id)
        assert proj.solved is True
        assert proj.assignments["g8"] == "D"  # answer key revealed on solve

    def test_reset_returns_to_preknown(self, duckdb_session: Session):
        """Reset wipes progress back to Maren's two letters."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        p = _glyph(duckdb_session, c.id, dm)
        pz.submit_reading(duckdb_session, p.id, "COMEHOMECHILD")

        pz.reset_puzzle(duckdb_session, p.id, dm)

        proj = pz.get_projection(duckdb_session, p.id)
        assert proj.solved is False
        assert proj.assignments == {"g4": "E", "g5": "H"}
        assert proj.hum == 0


class TestCipherPage:
    """Ward, key alignment, hand decoding, reveals."""

    def test_key_alignment_skips_non_letters(self, duckdb_session: Session):
        """The key advances only on letters — spaces don't consume it."""
        ct = CIPHER_CONFIG["ciphertext"]  # "TS HPAEZPZ"
        assert pz.vigenere_key_letter(ct, 0, "AELIM") == "A"  # T
        assert pz.vigenere_key_letter(ct, 1, "AELIM") == "E"  # S
        assert pz.vigenere_key_letter(ct, 2, "AELIM") == ""  # space
        assert pz.vigenere_key_letter(ct, 3, "AELIM") == "L"  # H

    def test_wrong_key_leaves_it_warded(self, duckdb_session: Session):
        """Only the real word stills the page."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        p = _cipher(duckdb_session, c.id, dm)

        result = pz.submit_key(duckdb_session, p.id, "HALVE")

        assert result["correct"] is False
        assert pz.get_projection(duckdb_session, p.id).phase == "warded"

    def test_right_key_stills_the_page(self, duckdb_session: Session):
        """AELIM (any case) transitions warded -> stilled."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        p = _cipher(duckdb_session, c.id, dm)

        result = pz.submit_key(duckdb_session, p.id, " aelim ")

        assert result["correct"] is True
        assert pz.get_projection(duckdb_session, p.id).phase == "stilled"

    def test_decode_refused_while_warded(self, duckdb_session: Session):
        """No hand-decoding until the ward breaks."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        p = _cipher(duckdb_session, c.id, dm)

        with pytest.raises(ValueError, match="warded"):
            pz.decode_letter(duckdb_session, p.id, 0, "T")

    def test_hand_decode_locks_correct_letters(self, duckdb_session: Session):
        """T-O of 'TO WHOEVER' decodes and locks; wrong letters don't."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        p = _cipher(duckdb_session, c.id, dm)
        pz.submit_key(duckdb_session, p.id, "AELIM")

        first = pz.decode_letter(duckdb_session, p.id, 0, "t")
        second = pz.decode_letter(duckdb_session, p.id, 1, "O")
        bad = pz.decode_letter(duckdb_session, p.id, 3, "Z")

        assert first["correct"] is True and first["key_letter"] == "A"
        assert second["correct"] is True and second["key_letter"] == "E"
        assert bad["correct"] is False
        proj = pz.get_projection(duckdb_session, p.id)
        assert proj.locked == {"0": "T", "1": "O"}

    def test_reveal_all_solves_and_decodes(self, duckdb_session: Session):
        """Reveal-all locks every letter and flips the puzzle to solved."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        p = _cipher(duckdb_session, c.id, dm)

        read = pz.reveal(duckdb_session, p.id, dm, "all")

        assert read.solved is True
        proj = pz.get_projection(duckdb_session, p.id)
        decoded = "".join(
            proj.locked.get(str(i), " ") for i in range(len(CIPHER_CONFIG["ciphertext"]))
        )
        assert decoded == "TO WHOEVER"

    def test_plaintext_is_dm_only_and_correct(self, duckdb_session: Session):
        """The DM read-aloud endpoint decodes the whole page."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        p = _cipher(duckdb_session, c.id, dm)

        assert pz.plaintext_so_far(duckdb_session, p.id, dm)["plaintext"] == "TO WHOEVER"
        with pytest.raises(PermissionError):
            pz.plaintext_so_far(duckdb_session, p.id, _dm())


class TestAuthz:
    """Campaign ownership on every DM route."""

    def test_other_dm_cannot_list_or_mutate(self, duckdb_session: Session):
        """A different DM is denied."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        p = _glyph(duckdb_session, c.id, dm)
        other = _dm()

        with pytest.raises(PermissionError):
            pz.list_puzzles(duckdb_session, c.id, other)
        with pytest.raises(PermissionError):
            pz.solve_glyphs(duckdb_session, p.id, other)
        with pytest.raises(PermissionError):
            pz.reset_puzzle(duckdb_session, p.id, other)

    def test_wrong_kind_actions_rejected(self, duckdb_session: Session):
        """Glyph actions on a cipher (and vice versa) fail loudly."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        g = _glyph(duckdb_session, c.id, dm)
        ci = _cipher(duckdb_session, c.id, dm)

        with pytest.raises(ValueError):
            pz.submit_key(duckdb_session, g.id, "AELIM")
        with pytest.raises(ValueError):
            pz.submit_reading(duckdb_session, ci.id, "COMEHOMECHILD")
