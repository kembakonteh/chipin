"""add payout_enabled to campaigns
Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2026-05-11
"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6g7h8i9j0'
down_revision = 'd4e5f6g7h8i9'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('campaigns', sa.Column('payout_enabled', sa.Boolean(), nullable=False, server_default='true'))

def downgrade():
    op.drop_column('campaigns', 'payout_enabled')
