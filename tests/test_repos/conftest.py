"""Repo test fixtures — imports all domain models before DuckDB engine is created.

All SQLModel table models must be imported before SQLModel.metadata.create_all() is
called, otherwise their tables are absent from the in-memory database.
"""

import domain.adventure  # noqa: F401
import domain.campaign  # noqa: F401
import domain.character  # noqa: F401
import domain.encounter  # noqa: F401
import domain.item  # noqa: F401
import domain.map  # noqa: F401
import domain.monster  # noqa: F401
import domain.session  # noqa: F401
