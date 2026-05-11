"""add split hand feature

Revision ID: a0b1c2d3e4f5
Revises: z3a4b5c6d7e8
Create Date: 2026-05-10
"""
from alembic import op
import sqlalchemy as sa

revision = "a0b1c2d3e4f5"
down_revision = "z3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade():
    # SusuMember split fields
    op.add_column("susu_members", sa.Column("is_split", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("susu_members", sa.Column("split_partner_name", sa.String(255), nullable=True))
    op.add_column("susu_members", sa.Column("split_partner_phone", sa.String(50), nullable=True))
    op.add_column("susu_members", sa.Column("split_amount", sa.Numeric(12, 2), nullable=True))

    # SusuContribution split tracking fields
    op.add_column("susu_contributions", sa.Column("split_primary_paid", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("susu_contributions", sa.Column("split_partner_paid", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("susu_contributions", sa.Column("split_partner_paid_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "susu_contributions",
        sa.Column(
            "split_partner_paid_via",
            sa.Enum("card", "cash", "zelle", "cashapp", name="susupaidvia"),
            nullable=True,
        ),
    )
    op.add_column("susu_contributions", sa.Column("split_partner_pending_verification", sa.Boolean(), nullable=False, server_default="false"))


def downgrade():
    op.drop_column("susu_members", "is_split")
    op.drop_column("susu_members", "split_partner_name")
    op.drop_column("susu_members", "split_partner_phone")
    op.drop_column("susu_members", "split_amount")

    op.drop_column("susu_contributions", "split_primary_paid")
    op.drop_column("susu_contributions", "split_partner_paid")
    op.drop_column("susu_contributions", "split_partner_paid_at")
    op.drop_column("susu_contributions", "split_partner_paid_via")
    op.drop_column("susu_contributions", "split_partner_pending_verification")
