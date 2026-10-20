"""Create initial settings table."""
from alembic import op
import sqlalchemy as sa
revision = "0001_foundation"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "settings",
        sa.Column("key", sa.String(length=120), primary_key=True),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.bulk_insert(sa.table("settings", sa.column("key", sa.String), sa.column("value", sa.JSON)), [
        {"key": "workspace_name", "value": "AnoBot Workspace"},
        {"key": "min_password_length", "value": 8},
        {"key": "session_hours", "value": 24},
        {"key": "max_upload_mb", "value": 25},
        {"key": "gemini_model", "value": "gemini-2.0-flash"},
    ])

def downgrade():
    op.drop_table("settings")
