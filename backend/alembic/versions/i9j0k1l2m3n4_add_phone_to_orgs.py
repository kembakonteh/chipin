"""add phone to orgs

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-05-06

"""
from alembic import op
import sqlalchemy as sa

revision = 'i9j0k1l2m3n4'
down_revision = 'h8i9j0k1l2m3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('orgs', sa.Column('phone', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('orgs', 'phone')
