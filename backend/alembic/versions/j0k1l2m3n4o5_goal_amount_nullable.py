"""make goal_amount nullable

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-05-06

"""
from alembic import op
import sqlalchemy as sa

revision = 'j0k1l2m3n4o5'
down_revision = 'i9j0k1l2m3n4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('campaigns', 'goal_amount', existing_type=sa.Numeric(12, 2), nullable=True)


def downgrade() -> None:
    op.execute("UPDATE campaigns SET goal_amount = 0 WHERE goal_amount IS NULL")
    op.alter_column('campaigns', 'goal_amount', existing_type=sa.Numeric(12, 2), nullable=False)
