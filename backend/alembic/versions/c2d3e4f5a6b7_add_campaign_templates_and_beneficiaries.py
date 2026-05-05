"""add_campaign_templates_and_beneficiaries

Revision ID: c2d3e4f5a6b7
Revises: a3f1c8d92e47
Create Date: 2026-05-05 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "a3f1c8d92e47"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "campaign_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column(
            "campaign_type",
            sa.Enum("general", "memorial", "charity", "celebration", name="campaigntype"),
            nullable=False,
        ),
        sa.Column("emoji", sa.String(10), nullable=False, server_default="⚽"),
        sa.Column("description_template", sa.Text(), nullable=False, server_default=""),
        sa.Column("default_amount_per_person", sa.Numeric(12, 2), nullable=True),
        sa.Column(
            "default_visibility_mode",
            sa.Enum("full_name", "first_name_only", "anonymous", name="visibilitymode"),
            nullable=False,
            server_default="full_name",
        ),
        sa.Column(
            "default_anonymous", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "whatsapp_share_text_template", sa.Text(), nullable=False, server_default=""
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "beneficiaries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("photo_url", sa.String(500), nullable=True),
        sa.Column("story", sa.Text(), nullable=True),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("campaign_id"),
    )


def downgrade() -> None:
    op.drop_table("beneficiaries")
    op.drop_table("campaign_templates")
