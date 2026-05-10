"""add_contributor_status

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
Create Date: 2026-05-10 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "w3x4y5z6a7b8"
down_revision: Union[str, None] = "v2w3x4y5z6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE contributorstatus AS ENUM ('pending','invited','paid','declined')")
    op.add_column(
        "contributors",
        sa.Column(
            "status",
            postgresql.ENUM("pending", "invited", "paid", "declined", name="contributorstatus", create_type=False),
            nullable=False,
            server_default="pending",
        ),
    )


def downgrade() -> None:
    op.drop_column("contributors", "status")
    op.execute("DROP TYPE contributorstatus")
