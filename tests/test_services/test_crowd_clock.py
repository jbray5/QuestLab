"""The festival crowd's trampled clock (Plan 114, Session 8).

A bystander knocked down by the herd survives exactly one full round. These
tests pin that window down, because the number of dead is recorded and carried
into the rest of the arc — an off-by-one round here changes the story.
"""

from services.table_service import crowd_resolve, crowd_save, crowd_trample


def knot(crowd: int = 4, hurt: int = 0, dying: int = 0, dead: int = 0) -> dict:
    """Build a crowd knot dict.

    Args:
        crowd: Bystanders on their feet.
        hurt: Knocked down this round.
        dying: Knocked down last round.
        dead: Already lost.

    Returns:
        A crowd token as the table stores it.
    """
    return {"id": "knot-1", "crowd": crowd, "hurt": hurt, "dying": dying, "dead": dead}


def test_trample_moves_people_off_their_feet() -> None:
    """Trampling takes from the standing and adds to the freshly hurt."""
    assert crowd_trample(knot(), 2) == knot(crowd=2, hurt=2)


def test_trample_cannot_take_more_than_are_standing() -> None:
    """A knot of one cannot lose two people."""
    assert crowd_trample(knot(crowd=1), 3) == knot(crowd=0, hurt=1)


def test_trample_of_an_empty_knot_does_nothing() -> None:
    """Nobody left standing means nobody left to trample."""
    assert crowd_trample(knot(crowd=0, dead=4), 2) == knot(crowd=0, dead=4)


def test_unsaved_bystander_dies_after_one_full_round() -> None:
    """Down on round one, still down at the end of round two: dead."""
    k = crowd_resolve(crowd_trample(knot(), 1))
    assert k["dying"] == 1 and k["dead"] == 0, "still savable after one resolve"
    k = crowd_resolve(k)
    assert k["dead"] == 1 and k["dying"] == 0


def test_a_save_inside_the_window_costs_nobody() -> None:
    """Reached in time, a trampled bystander stands back up and lives."""
    k = crowd_resolve(crowd_trample(knot(), 1))
    k = crowd_resolve(crowd_save(k))
    assert k == knot(crowd=4)


def test_save_takes_the_most_urgent_first() -> None:
    """With both dying and hurt down, the save pulls the one about to die."""
    k = crowd_save(knot(crowd=1, hurt=1, dying=1))
    assert k["dying"] == 0 and k["hurt"] == 1 and k["crowd"] == 2


def test_save_falls_back_to_the_freshly_hurt() -> None:
    """Nobody dying: the save still helps someone."""
    k = crowd_save(knot(crowd=1, hurt=2))
    assert k["hurt"] == 1 and k["crowd"] == 2


def test_save_with_nobody_down_changes_nothing() -> None:
    """A save is not a way to conjure bystanders."""
    assert crowd_save(knot()) == knot()


def test_the_dead_stay_dead() -> None:
    """Resolving an untouched knot never resurrects or kills anyone."""
    assert crowd_resolve(knot(crowd=2, dead=2)) == knot(crowd=2, dead=2)


def test_six_rounds_of_the_stampede() -> None:
    """A full scene: two knots, one attended and one not.

    Each round the herd puts one person down in each knot; the party only ever
    reaches the first knot. After six rounds the attended knot has lost nobody
    and the abandoned one has lost the people it could not reach.
    """
    saved, abandoned = knot(), knot()
    for _ in range(6):
        saved = crowd_save(crowd_trample(saved, 1))
        abandoned = crowd_trample(abandoned, 1)
        saved, abandoned = crowd_resolve(saved), crowd_resolve(abandoned)
    assert saved["dead"] == 0, "the party reached everyone in this knot"
    assert saved["crowd"] == 4
    # Four people, one knocked down per round, none reached. The knot empties
    # on round four and the last of them resolves on round five, so by the time
    # the knights arrive on round six the whole knot is gone.
    assert abandoned["dead"] == 4
    assert abandoned["crowd"] == 0 and abandoned["dying"] == 0
