"""add susu missed policy, late fee, rules, and contribution missed flag

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-05-06 10:01:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'q7r8s9t0u1v2'
down_revision = 'p6q7r8s9t0u1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Feature 4: missed payment policy on SusuGroup
    op.add_column('susu_groups', sa.Column('missed_policy', sa.String(50), nullable=False, server_default="'none'"))
    op.add_column('susu_groups', sa.Column('late_fee_pct', sa.Numeric(5, 2), nullable=True))
    # Feature 8: group rules on SusuGroup
    op.add_column('susu_groups', sa.Column('rules', sa.Text(), nullable=True))
    # Feature 4: missed flag on SusuContribution
    op.add_column('susu_contributions', sa.Column('missed', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('susu_contributions', 'missed')
    op.drop_column('susu_groups', 'rules')
    op.drop_column('susu_groups', 'late_fee_pct')
    op.drop_column('susu_groups', 'missed_policy')
