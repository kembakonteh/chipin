"""add stripe_fee to payments

Revision ID: l3m4n5o6p7q8
Revises: k2l3m4n5o6p7
Create Date: 2026-05-17

"""
from alembic import op
import sqlalchemy as sa
from decimal import Decimal

revision = 'l3m4n5o6p7q8'
down_revision = 'k2l3m4n5o6p7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'payments',
        sa.Column('stripe_fee', sa.Numeric(12, 2), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_column('payments', 'stripe_fee')
