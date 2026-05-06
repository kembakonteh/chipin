"""add_multicurrency_payout

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-05-05 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "h8i9j0k1l2m3"
down_revision: Union[str, None] = "g7h8i9j0k1l2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Enums ------------------------------------------------------------------
    op.execute(
        "CREATE TYPE collectioncurrency AS ENUM ('USD','GBP','EUR','CAD')"
    )
    op.execute(
        "CREATE TYPE payoutcurrency AS ENUM ('USD','GBP','EUR','GMD','NGN','GHS','XOF')"
    )
    op.execute(
        "CREATE TYPE methodtype AS ENUM ('mobile_money','bank_transfer','stripe_connect')"
    )
    op.execute(
        "CREATE TYPE payoutstatus AS ENUM ('pending','processing','completed','failed')"
    )

    methodtype = postgresql.ENUM("mobile_money", "bank_transfer", "stripe_connect", name="methodtype", create_type=False)
    payoutstatus = postgresql.ENUM("pending", "processing", "completed", "failed", name="payoutstatus", create_type=False)

    # --- campaigns: new currency columns ----------------------------------------
    op.add_column(
        "campaigns",
        sa.Column(
            "collection_currency",
            sa.Enum("USD", "GBP", "EUR", "CAD", name="collectioncurrency"),
            nullable=True,
        ),
    )
    op.add_column(
        "campaigns",
        sa.Column(
            "payout_currency",
            sa.Enum("USD", "GBP", "EUR", "GMD", "NGN", "GHS", "XOF", name="payoutcurrency"),
            nullable=True,
        ),
    )

    # Back-fill collection_currency from the existing currency column (upper-cased).
    # Only values already in the enum will match; others get USD as safe default.
    op.execute(
        """
        UPDATE campaigns
        SET collection_currency = CASE
            WHEN UPPER(currency) IN ('USD','GBP','EUR','CAD')
                THEN UPPER(currency)::collectioncurrency
            ELSE 'USD'::collectioncurrency
        END
        """
    )

    op.alter_column("campaigns", "collection_currency", nullable=False)

    # --- payout_methods table ----------------------------------------------------
    op.create_table(
        "payout_methods",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("method_type", methodtype, nullable=False),
        sa.Column("country_code", sa.String(2), nullable=False),
        sa.Column("network_name", sa.String(100), nullable=False),
        sa.Column("account_number", sa.String(50), nullable=False),
        sa.Column("account_name", sa.String(255), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_payout_methods_user_id", "payout_methods", ["user_id"])

    # --- payouts table -----------------------------------------------------------
    op.create_table(
        "payouts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "campaign_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "payout_method_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payout_methods.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("gross_amount_usd", sa.Numeric(14, 4), nullable=False),
        sa.Column("exchange_rate", sa.Numeric(18, 6), nullable=False),
        sa.Column("payout_amount_local", sa.Numeric(14, 2), nullable=False),
        sa.Column("payout_currency", sa.String(3), nullable=False),
        sa.Column("transfer_fee", sa.Numeric(14, 4), nullable=False, server_default="0"),
        sa.Column("status", payoutstatus, nullable=False, server_default="pending"),
        sa.Column("provider_reference", sa.String(255), nullable=True),
        sa.Column(
            "initiated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_payouts_campaign_id", "payouts", ["campaign_id"])
    op.create_index("ix_payouts_payout_method_id", "payouts", ["payout_method_id"])


def downgrade() -> None:
    op.drop_table("payouts")
    op.drop_table("payout_methods")

    op.drop_column("campaigns", "payout_currency")
    op.drop_column("campaigns", "collection_currency")

    op.execute("DROP TYPE IF EXISTS payoutstatus")
    op.execute("DROP TYPE IF EXISTS methodtype")
    op.execute("DROP TYPE IF EXISTS payoutcurrency")
    op.execute("DROP TYPE IF EXISTS collectioncurrency")
