"""add message to contributors

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-05-06

"""
from alembic import op
import sqlalchemy as sa

revision = 'l2m3n4o5p6q7'
down_revision = 'k1l2m3n4o5p6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('contributors', sa.Column('message', sa.String(300), nullable=True))


def downgrade() -> None:
    op.drop_column('contributors', 'message')
