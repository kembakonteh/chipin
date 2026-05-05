"""expand_org_and_org_member

Revision ID: d4e5f6a7b8c9
Revises: c2d3e4f5a6b7
Create Date: 2026-05-05 01:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New enums
    op.execute("CREATE TYPE orgtype AS ENUM ('sports','religious','community','professional','social')")
    op.execute("CREATE TYPE orgmemberrole AS ENUM ('admin','treasurer','member')")

    # Expand orgs table
    op.add_column("orgs", sa.Column("slug", sa.String(255), nullable=True))
    op.add_column("orgs", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("orgs", sa.Column("logo_url", sa.String(500), nullable=True))
    op.add_column(
        "orgs",
        sa.Column(
            "org_type",
            sa.Enum("sports", "religious", "community", "professional", "social", name="orgtype"),
            nullable=True,
        ),
    )
    op.add_column("orgs", sa.Column("whatsapp_group_name", sa.String(255), nullable=True))
    op.create_unique_constraint("uq_orgs_slug", "orgs", ["slug"])
    op.create_index("ix_orgs_slug", "orgs", ["slug"])

    # Expand org_members table
    op.add_column(
        "org_members",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "org_members",
        sa.Column(
            "role",
            sa.Enum("admin", "treasurer", "member", name="orgmemberrole"),
            nullable=False,
            server_default="member",
        ),
    )
    op.add_column(
        "org_members",
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_org_members_user_id",
        "org_members",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_org_members_user_id", "org_members", type_="foreignkey")
    op.drop_column("org_members", "joined_at")
    op.drop_column("org_members", "role")
    op.drop_column("org_members", "user_id")

    op.drop_index("ix_orgs_slug", table_name="orgs")
    op.drop_constraint("uq_orgs_slug", "orgs", type_="unique")
    op.drop_column("orgs", "whatsapp_group_name")
    op.drop_column("orgs", "org_type")
    op.drop_column("orgs", "logo_url")
    op.drop_column("orgs", "description")
    op.drop_column("orgs", "slug")

    op.execute("DROP TYPE orgmemberrole")
    op.execute("DROP TYPE orgtype")
