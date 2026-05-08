"""make_stripe_payment_intent_id_nullable

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
Create Date: 2026-05-07 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "u1v2w3x4y5z6"
down_revision: Union[str, None] = "t0u1v2w3x4y5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The PI ID is not available at Checkout Session creation time —
    # it arrives in the checkout.session.completed webhook. Allow NULL
    # so the pending Payment row can be inserted before Stripe confirms.
    op.alter_column(
        "payments",
        "stripe_payment_intent_id",
        existing_type=sa.String(255),
        nullable=True,
    )


def downgrade() -> None:
    # NULL rows must be cleaned up or backfilled before reverting.
    op.alter_column(
        "payments",
        "stripe_payment_intent_id",
        existing_type=sa.String(255),
        nullable=False,
    )
