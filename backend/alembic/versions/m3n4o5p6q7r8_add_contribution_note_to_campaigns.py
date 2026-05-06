"""add contribution_note to campaigns

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-05-06

"""
from alembic import op
import sqlalchemy as sa

revision = 'm3n4o5p6q7r8'
down_revision = 'l2m3n4o5p6q7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('campaigns', sa.Column('contribution_note', sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column('campaigns', 'contribution_note')
