"""add_susu_tontine_tables

Revision ID: g7h8i9j0k1l2
Revises: f6a7b8c9d0e1
Create Date: 2026-05-05 03:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "g7h8i9j0k1l2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE susufrequency AS ENUM ('weekly','biweekly','monthly')")
    op.execute("CREATE TYPE susustatus AS ENUM ('forming','active','completed','paused')")
    op.execute("CREATE TYPE susupayoutorder AS ENUM ('fixed','random','bid')")
    op.execute("CREATE TYPE susucyclestatus AS ENUM ('collecting','collected','paid_out','missed')")
    op.execute("CREATE TYPE susupaidvia AS ENUM ('card','cash','zelle','cashapp')")

    op.create_table(
        "susu_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), unique=True, nullable=False),
        sa.Column("contribution_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("frequency", sa.Enum("weekly", "biweekly", "monthly", name="susufrequency"), nullable=False),
        sa.Column("total_members", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_cycle", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("total_cycles", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.Enum("forming", "active", "completed", "paused", name="susustatus"), nullable=False, server_default="forming"),
        sa.Column("payout_order", sa.Enum("fixed", "random", "bid", name="susupayoutorder"), nullable=False, server_default="fixed"),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("next_contribution_date", sa.Date(), nullable=True),
        sa.Column("next_payout_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_susu_groups_slug", "susu_groups", ["slug"], unique=True)
    op.create_index("ix_susu_groups_owner_id", "susu_groups", ["owner_id"])

    op.create_table(
        "susu_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("susu_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(50), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("payout_position", sa.Integer(), nullable=True),
        sa.Column("has_received_payout", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("total_contributed", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_susu_members_group_id", "susu_members", ["group_id"])

    op.create_table(
        "susu_cycles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("susu_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cycle_number", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("pot_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("collected_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("recipient_member_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("susu_members.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("payout_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.Enum("collecting", "collected", "paid_out", "missed", name="susucyclestatus"), nullable=False, server_default="collecting"),
    )
    op.create_index("ix_susu_cycles_group_id", "susu_cycles", ["group_id"])
    op.create_index("ix_susu_cycles_group_cycle", "susu_cycles", ["group_id", "cycle_number"], unique=True)

    op.create_table(
        "susu_contributions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("cycle_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("susu_cycles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("member_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("susu_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("paid", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("paid_via", sa.Enum("card", "cash", "zelle", "cashapp", name="susupaidvia"), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stripe_payment_intent_id", sa.String(255), nullable=True),
    )
    op.create_index("ix_susu_contributions_cycle_id", "susu_contributions", ["cycle_id"])
    op.create_index("ix_susu_contributions_member_id", "susu_contributions", ["member_id"])
    op.create_index("ix_susu_contributions_stripe_pi", "susu_contributions", ["stripe_payment_intent_id"])


def downgrade() -> None:
    op.drop_index("ix_susu_contributions_stripe_pi", table_name="susu_contributions")
    op.drop_index("ix_susu_contributions_member_id", table_name="susu_contributions")
    op.drop_index("ix_susu_contributions_cycle_id", table_name="susu_contributions")
    op.drop_table("susu_contributions")

    op.drop_index("ix_susu_cycles_group_cycle", table_name="susu_cycles")
    op.drop_index("ix_susu_cycles_group_id", table_name="susu_cycles")
    op.drop_table("susu_cycles")

    op.drop_index("ix_susu_members_group_id", table_name="susu_members")
    op.drop_table("susu_members")

    op.drop_index("ix_susu_groups_owner_id", table_name="susu_groups")
    op.drop_index("ix_susu_groups_slug", table_name="susu_groups")
    op.drop_table("susu_groups")

    op.execute("DROP TYPE susupaidvia")
    op.execute("DROP TYPE susucyclestatus")
    op.execute("DROP TYPE susupayoutorder")
    op.execute("DROP TYPE susustatus")
    op.execute("DROP TYPE susufrequency")
