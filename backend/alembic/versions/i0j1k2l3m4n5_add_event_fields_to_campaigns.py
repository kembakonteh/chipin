"""add event fields to campaigns

Revision ID: i0j1k2l3m4n5
Revises: z9y8x7w6v5u4
Create Date: 2026-05-13

"""
from alembic import op
import sqlalchemy as sa

revision = 'i0j1k2l3m4n5'
down_revision = 'z9y8x7w6v5u4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('campaigns', sa.Column('event_date', sa.Date(), nullable=True))
    op.add_column('campaigns', sa.Column('event_time', sa.String(50), nullable=True))
    op.add_column('campaigns', sa.Column('event_location', sa.String(500), nullable=True))
    op.add_column('campaigns', sa.Column('event_rsvp', sa.String(255), nullable=True))


def downgrade():
    op.drop_column('campaigns', 'event_rsvp')
    op.drop_column('campaigns', 'event_location')
    op.drop_column('campaigns', 'event_time')
    op.drop_column('campaigns', 'event_date')
