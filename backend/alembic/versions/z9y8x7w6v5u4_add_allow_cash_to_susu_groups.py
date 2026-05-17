"""add allow_cash to susu_groups

Revision ID: z9y8x7w6v5u4
Revises: f6g7h8i9j0k1
Create Date: 2026-05-13

"""
from alembic import op
import sqlalchemy as sa

revision = 'z9y8x7w6v5u4'
down_revision = 'f6g7h8i9j0k1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('susu_groups', sa.Column('allow_cash', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('susu_groups', 'allow_cash')
