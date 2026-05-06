"""add_recurring_schedules_and_instances

Revision ID: f6a7b8c9d0e1
Revises: d4e5f6a7b8c9
Create Date: 2026-05-05 02:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE frequency AS ENUM ('weekly','biweekly','monthly','quarterly','annual')")
    op.execute("CREATE TYPE instancestatus AS ENUM ('upcoming','active','completed','missed')")

    frequency = postgresql.ENUM("weekly", "biweekly", "monthly", "quarterly", "annual", name="frequency", create_type=False)
    instancestatus = postgresql.ENUM("upcoming", "active", "completed", "missed", name="instancestatus", create_type=False)

    op.create_table(
        "recurring_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("frequency", frequency, nullable=False),
        sa.Column("day_of_month", sa.Integer(), nullable=True),
        sa.Column("day_of_week", sa.Integer(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("auto_create_days_before", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("auto_remind_days_before", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_recurring_schedules_campaign_id", "recurring_schedules", ["campaign_id"])
    op.create_index("ix_recurring_schedules_next_run_at", "recurring_schedules", ["next_run_at"])

    op.create_table(
        "recurring_instances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recurring_schedules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("status", instancestatus, nullable=False, server_default="upcoming"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_recurring_instances_schedule_id", "recurring_instances", ["schedule_id"])
    op.create_index("ix_recurring_instances_due_date", "recurring_instances", ["due_date"])


def downgrade() -> None:
    op.drop_index("ix_recurring_instances_due_date", table_name="recurring_instances")
    op.drop_index("ix_recurring_instances_schedule_id", table_name="recurring_instances")
    op.drop_table("recurring_instances")

    op.drop_index("ix_recurring_schedules_next_run_at", table_name="recurring_schedules")
    op.drop_index("ix_recurring_schedules_campaign_id", table_name="recurring_schedules")
    op.drop_table("recurring_schedules")

    op.execute("DROP TYPE instancestatus")
    op.execute("DROP TYPE frequency")
