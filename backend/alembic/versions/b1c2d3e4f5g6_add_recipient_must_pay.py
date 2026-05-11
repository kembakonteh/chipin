"""Add recipient_must_pay to susu_groups and is_exempt to susu_contributions

Revision ID: b1c2d3e4f5g6
Revises: a0b1c2d3e4f5
Create Date: 2026-05-10

"""
from alembic import op
import sqlalchemy as sa

revision = "b1c2d3e4f5g6"
down_revision = "a0b1c2d3e4f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "susu_groups",
        sa.Column("recipient_must_pay", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "susu_contributions",
        sa.Column("is_exempt", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("susu_contributions", "is_exempt")
    op.drop_column("susu_groups", "recipient_must_pay")
