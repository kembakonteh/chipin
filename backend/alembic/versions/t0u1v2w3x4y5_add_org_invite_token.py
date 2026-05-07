"""add_org_invite_token

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-05-07 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "t0u1v2w3x4y5"
down_revision: Union[str, None] = "s9t0u1v2w3x4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add nullable first so existing rows don't violate NOT NULL
    op.add_column(
        "orgs",
        sa.Column(
            "invite_token",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    # Backfill existing orgs with a random token each
    op.execute("UPDATE orgs SET invite_token = gen_random_uuid() WHERE invite_token IS NULL")
    # Now enforce NOT NULL and UNIQUE
    op.alter_column("orgs", "invite_token", nullable=False)
    op.create_unique_constraint("uq_orgs_invite_token", "orgs", ["invite_token"])


def downgrade() -> None:
    op.drop_constraint("uq_orgs_invite_token", "orgs", type_="unique")
    op.drop_column("orgs", "invite_token")
