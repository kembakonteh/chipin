"""add payment_note to contributors

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-05-06

"""
from alembic import op
import sqlalchemy as sa

revision = 'k1l2m3n4o5p6'
down_revision = 'j0k1l2m3n4o5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('contributors', sa.Column('payment_note', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('contributors', 'payment_note')
