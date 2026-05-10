"""add contribution pending_verification

Revision ID: z3a4b5c6d7e8
Revises: y2z3a4b5c6d7
Create Date: 2026-05-10
"""
from alembic import op
import sqlalchemy as sa

revision = "z3a4b5c6d7e8"
down_revision = "y2z3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "susu_contributions",
        sa.Column("pending_verification", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade():
    op.drop_column("susu_contributions", "pending_verification")
