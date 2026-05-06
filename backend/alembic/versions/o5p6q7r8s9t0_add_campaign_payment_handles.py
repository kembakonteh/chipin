"""add_campaign_payment_handles

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-05-06 02:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "o5p6q7r8s9t0"
down_revision: Union[str, None] = "n4o5p6q7r8s9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("campaigns", sa.Column("zelle_info", sa.String(255), nullable=True))
    op.add_column("campaigns", sa.Column("cashapp_handle", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("campaigns", "cashapp_handle")
    op.drop_column("campaigns", "zelle_info")
