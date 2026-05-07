"""add payout_method and payout_reference to susu_cycles

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-05-06 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'r8s9t0u1v2w3'
down_revision = 'q7r8s9t0u1v2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('susu_cycles', sa.Column('payout_method', sa.String(50), nullable=True))
    op.add_column('susu_cycles', sa.Column('payout_reference', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('susu_cycles', 'payout_reference')
    op.drop_column('susu_cycles', 'payout_method')
