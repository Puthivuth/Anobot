"""Create deploy_keys, workflows, universe_datasets tables and add onnx_key."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0005_deploy_workflows"
down_revision = "0004_versions_training_apikeys"
branch_labels = None
depends_on = None

def upgrade():
    # Add onnx_key to training_jobs
    op.add_column("training_jobs", sa.Column("onnx_key", sa.String(length=255), nullable=True))

    op.create_table(
        "deploy_keys",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("key_hash", sa.String(length=255), nullable=False),
        sa.Column("last4", sa.String(length=4), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_deploy_keys_project_id", "deploy_keys", ["project_id"])
    op.create_index("ix_deploy_keys_key_hash", "deploy_keys", ["key_hash"])

    op.create_table(
        "workflows",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("blocks", sa.JSON(), server_default=sa.text("'[]'::json"), nullable=False),
        sa.Column("is_api_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_workflows_project_id", "workflows", ["project_id"])

    op.create_table(
        "universe_datasets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("source_project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=1000), server_default="", nullable=False),
        sa.Column("license", sa.String(length=60), server_default="CC BY 4.0", nullable=False),
        sa.Column("tags", sa.JSON(), server_default=sa.text("'[]'::json"), nullable=False),
        sa.Column("image_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("project_type", sa.String(length=20), server_default="detect", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

def downgrade():
    op.drop_table("universe_datasets")
    op.drop_table("workflows")
    op.drop_table("deploy_keys")
    op.drop_column("training_jobs", "onnx_key")

