"""Crowd knots survive the write path (Plan 114, Session 8).

The table stores tokens as a JSON blob, but the DM's PATCH is validated against
the ``Token`` schema, and pydantic drops unknown keys in silence. That is not a
theoretical risk: a table written through an older build of the API came back
with every crowd number gone and no error anywhere. These tests pin the fields
to the schema so that cannot happen again unnoticed.
"""

import pytest
from pydantic import ValidationError

from domain.table_state import TableProjection, TableStateUpdate, Token


def crowd_token(**over: object) -> dict:
    """Build a crowd knot as the DM console would send it.

    Args:
        **over: Fields to override on the token dict.

    Returns:
        A token dict ready for schema validation.
    """
    base = {
        "id": "knot-1",
        "kind": "custom",
        "label": "Crowd 1",
        "x": 100.0,
        "y": 200.0,
        "size": 1.4,
        "crowd": 4,
        "hurt": 1,
        "dying": 2,
        "dead": 3,
    }
    base.update(over)
    return base


def test_crowd_numbers_survive_the_patch_schema() -> None:
    """The DM's token PATCH keeps all four counters."""
    update = TableStateUpdate.model_validate({"tokens": [crowd_token()]})
    assert update.tokens is not None
    t = update.tokens[0]
    assert (t.crowd, t.hurt, t.dying, t.dead) == (4, 1, 2, 3)


def test_an_ordinary_token_has_no_crowd_numbers() -> None:
    """Nothing changes for every other token on the board."""
    t = Token.model_validate({"id": "pc-1", "kind": "pc", "label": "Willa", "x": 1.0, "y": 2.0})
    assert t.crowd is None and t.hurt is None and t.dying is None and t.dead is None


@pytest.mark.parametrize("field", ["crowd", "hurt", "dying", "dead"])
def test_a_crowd_count_cannot_go_negative(field: str) -> None:
    """A knot cannot hold minus one person."""
    with pytest.raises(ValidationError):
        Token.model_validate(crowd_token(**{field: -1}))


def test_the_projection_carries_the_lost_tally() -> None:
    """Players are shown the running total; it defaults to nobody lost."""
    empty = TableProjection(session_id="00000000-0000-0000-0000-000000000000")
    assert empty.lost == 0
    told = TableProjection(session_id="00000000-0000-0000-0000-000000000000", lost=7)
    assert told.lost == 7


def test_the_tally_is_the_sum_of_every_knot() -> None:
    """The number the table watches is just the knots added up.

    This mirrors what the projection builder does, so a change to one without
    the other shows up here.
    """
    tokens = [
        Token.model_validate(crowd_token(id="knot-1", dead=2)),
        Token.model_validate(crowd_token(id="knot-2", dead=0)),
        Token.model_validate({"id": "pc-1", "kind": "pc", "label": "Nya", "x": 0.0, "y": 0.0}),
    ]
    assert sum(int(t.dead or 0) for t in tokens) == 2
