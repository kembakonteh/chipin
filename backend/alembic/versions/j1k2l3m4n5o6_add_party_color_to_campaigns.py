"""add party_color to campaigns

Revision ID: j1k2l3m4n5o6
Revises: i0j1k2l3m4n5
Create Date: 2026-05-15

"""
from alembic import op
import sqlalchemy as sa

revision = 'j1k2l3m4n5o6'
down_revision = 'i0j1k2l3m4n5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('campaigns', sa.Column('party_color', sa.String(7), nullable=True))


def downgrade() -> None:
    op.drop_column('campaigns', 'party_color')
