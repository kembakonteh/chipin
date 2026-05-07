"""add_campaign_payment_handles

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-05-06 01:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "i9j0k1l2m3n4"
down_revision: Union[str, None] = "h8i9j0k1l2m3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("campaigns", sa.Column("zelle_info", sa.String(255), nullable=True))
    op.add_column("campaigns", sa.Column("cashapp_handle", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("campaigns", "cashapp_handle")
    op.drop_column("campaigns", "zelle_info")
