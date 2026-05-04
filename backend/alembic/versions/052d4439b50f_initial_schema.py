"""initial_schema

Revision ID: 052d4439b50f
Revises:
Create Date: 2026-05-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "052d4439b50f"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enums
    campaigntype = postgresql.ENUM(
        "general", "memorial", "charity", "celebration",
        name="campaigntype", create_type=False,
    )
    visibilitymode = postgresql.ENUM(
        "full_name", "first_name_only", "anonymous",
        name="visibilitymode", create_type=False,
    )
    campaignstatus = postgresql.ENUM(
        "active", "paused", "completed", "archived",
        name="campaignstatus", create_type=False,
    )
    paidvia = postgresql.ENUM(
        "card", "zelle", "cash", "cashapp", "manual",
        name="paidvia", create_type=False,
    )
    paymentstatus = postgresql.ENUM(
        "pending", "succeeded", "failed", "refunded",
        name="paymentstatus", create_type=False,
    )

    op.execute("CREATE TYPE campaigntype AS ENUM ('general','memorial','charity','celebration')")
    op.execute("CREATE TYPE visibilitymode AS ENUM ('full_name','first_name_only','anonymous')")
    op.execute("CREATE TYPE campaignstatus AS ENUM ('active','paused','completed','archived')")
    op.execute("CREATE TYPE paidvia AS ENUM ('card','zelle','cash','cashapp','manual')")
    op.execute("CREATE TYPE paymentstatus AS ENUM ('pending','succeeded','failed','refunded')")

    # users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("hashed_password", sa.String(255), nullable=True),
        sa.Column("stripe_account_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # campaigns
    op.create_table(
        "campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("emoji", sa.String(10), nullable=False, server_default="⚽"),
        sa.Column("campaign_type", sa.Enum("general", "memorial", "charity", "celebration", name="campaigntype"), nullable=False, server_default="general"),
        sa.Column("goal_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("amount_per_person", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("slug", sa.String(255), nullable=False),
        sa.Column("visibility_mode", sa.Enum("full_name", "first_name_only", "anonymous", name="visibilitymode"), nullable=False, server_default="full_name"),
        sa.Column("allow_anonymous_contributions", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("status", sa.Enum("active", "paused", "completed", "archived", name="campaignstatus"), nullable=False, server_default="active"),
        sa.Column("whatsapp_reminders_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("platform_fee_pct", sa.Numeric(5, 2), nullable=False, server_default="2.50"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_campaigns_slug", "campaigns", ["slug"], unique=True)

    # contributors
    op.create_table(
        "contributors",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("paid", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("paid_via", sa.Enum("card", "zelle", "cash", "cashapp", "manual", name="paidvia"), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("added_by_organizer", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_anonymous", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # payments
    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("contributor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("stripe_payment_intent_id", sa.String(255), nullable=False),
        sa.Column("stripe_checkout_session_id", sa.String(255), nullable=True),
        sa.Column("gross_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("platform_fee", sa.Numeric(12, 2), nullable=False),
        sa.Column("net_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("status", sa.Enum("pending", "succeeded", "failed", "refunded", name="paymentstatus"), nullable=False, server_default="pending"),
        sa.Column("payer_name", sa.String(255), nullable=True),
        sa.Column("payer_email", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contributor_id"], ["contributors.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stripe_payment_intent_id"),
    )


def downgrade() -> None:
    op.drop_table("payments")
    op.drop_table("contributors")
    op.drop_index("ix_campaigns_slug", table_name="campaigns")
    op.drop_table("campaigns")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    op.execute("DROP TYPE IF EXISTS paymentstatus")
    op.execute("DROP TYPE IF EXISTS paidvia")
    op.execute("DROP TYPE IF EXISTS campaignstatus")
    op.execute("DROP TYPE IF EXISTS visibilitymode")
    op.execute("DROP TYPE IF EXISTS campaigntype")
