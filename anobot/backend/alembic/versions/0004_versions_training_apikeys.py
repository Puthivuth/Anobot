"""Create dataset_versions, training_jobs, and api_keys tables."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0004_versions_training_apikeys"
down_revision = "0003_projects_images_classes"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "dataset_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=True),
        sa.Column("splits", sa.JSON(), server_default=sa.text("'{\"train\": 70, \"val\": 20, \"test\": 10}'::json"), nullable=False),
        sa.Column("preprocessing", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False),
        sa.Column("augmentations", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False),
        sa.Column("image_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("export_key", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_dataset_versions_project_id", "dataset_versions", ["project_id"])

    op.create_table(
        "training_jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", UUID(as_uuid=True), sa.ForeignKey("dataset_versions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("model_name", sa.String(length=40), server_default="yolov8n", nullable=False),
        sa.Column("task", sa.String(length=20), server_default="detect", nullable=False),
        sa.Column("epochs", sa.Integer(), server_default=sa.text("50"), nullable=False),
        sa.Column("batch_size", sa.Integer(), server_default=sa.text("16"), nullable=False),
        sa.Column("img_size", sa.Integer(), server_default=sa.text("640"), nullable=False),
        sa.Column("device", sa.String(length=20), server_default="cpu", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="queued", nullable=False),
        sa.Column("progress", sa.Float(), server_default=sa.text("0.0"), nullable=False),
        sa.Column("current_epoch", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("metrics", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False),
        sa.Column("weights_key", sa.String(length=255), nullable=True),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_training_jobs_project_id", "training_jobs", ["project_id"])
    op.create_index("ix_training_jobs_version_id", "training_jobs", ["version_id"])

    op.create_table(
        "api_keys",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("service", sa.String(length=40), server_default="gemini", nullable=False),
        sa.Column("encrypted_value", sa.String(length=500), nullable=False),
        sa.Column("masked_value", sa.String(length=60), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

def downgrade():
    op.drop_table("api_keys")
    op.drop_table("training_jobs")
    op.drop_table("dataset_versions")

