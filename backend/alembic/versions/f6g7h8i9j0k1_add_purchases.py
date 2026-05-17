"""add purchases table
Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'f6g7h8i9j0k1'
down_revision = 'e5f6g7h8i9j0'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'purchases',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('campaign_id', UUID(as_uuid=True), sa.ForeignKey('campaigns.id', ondelete='CASCADE'), nullable=False),
        sa.Column('description', sa.String(255), nullable=False),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('note', sa.String(500), nullable=True),
        sa.Column('purchased_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_purchases_campaign_id', 'purchases', ['campaign_id'])

def downgrade():
    op.drop_index('ix_purchases_campaign_id', 'purchases')
    op.drop_table('purchases')
