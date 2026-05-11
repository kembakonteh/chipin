"""Add accepting_members to susu_groups

Revision ID: c2d3e4f5g6h7
Revises: b1c2d3e4f5g6
Create Date: 2026-05-10

"""
from alembic import op
import sqlalchemy as sa

revision = "c2d3e4f5g6h7"
down_revision = "b1c2d3e4f5g6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "susu_groups",
        sa.Column("accepting_members", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("susu_groups", "accepting_members")
