"""add party_name and office_sought to beneficiary

Revision ID: k2l3m4n5o6p7
Revises: j1k2l3m4n5o6
Create Date: 2026-05-15

"""
from alembic import op
import sqlalchemy as sa

revision = 'k2l3m4n5o6p7'
down_revision = 'j1k2l3m4n5o6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('beneficiaries', sa.Column('party_name', sa.String(length=255), nullable=True))
    op.add_column('beneficiaries', sa.Column('office_sought', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('beneficiaries', 'office_sought')
    op.drop_column('beneficiaries', 'party_name')
