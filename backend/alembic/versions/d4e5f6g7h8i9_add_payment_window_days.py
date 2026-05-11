"""add payment_window_days to susu_groups

Revision ID: d4e5f6g7h8i9
Revises: c2d3e4f5g6h7
Create Date: 2026-05-10

"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6g7h8i9'
down_revision = 'c2d3e4f5g6h7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'susu_groups',
        sa.Column('payment_window_days', sa.Integer(), nullable=False, server_default='5'),
    )


def downgrade() -> None:
    op.drop_column('susu_groups', 'payment_window_days')
