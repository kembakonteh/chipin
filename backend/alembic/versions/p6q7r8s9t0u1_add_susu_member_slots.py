"""add susu member slots

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-05-06 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'p6q7r8s9t0u1'
down_revision = 'o5p6q7r8s9t0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('susu_members', sa.Column('slots', sa.Integer(), nullable=False, server_default='1'))


def downgrade() -> None:
    op.drop_column('susu_members', 'slots')
