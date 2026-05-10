"""add susu payment settings

Revision ID: y2z3a4b5c6d7
Revises: x1y2z3a4b5c6
Create Date: 2026-05-10
"""
from alembic import op
import sqlalchemy as sa

revision = "y2z3a4b5c6d7"
down_revision = "x1y2z3a4b5c6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("susu_groups", sa.Column("allow_card", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("susu_groups", sa.Column("allow_cashapp", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("susu_groups", sa.Column("allow_zelle", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("susu_groups", sa.Column("cashapp_handle", sa.String(100), nullable=True))
    op.add_column("susu_groups", sa.Column("zelle_handle", sa.String(100), nullable=True))


def downgrade():
    op.drop_column("susu_groups", "zelle_handle")
    op.drop_column("susu_groups", "cashapp_handle")
    op.drop_column("susu_groups", "allow_zelle")
    op.drop_column("susu_groups", "allow_cashapp")
    op.drop_column("susu_groups", "allow_card")
