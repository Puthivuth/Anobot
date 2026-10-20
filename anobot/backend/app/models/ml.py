import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, Integer, Float, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.db import Base

class DatasetVersion(Base):
    __tablename__ = "dataset_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    name = Column(String(60), nullable=True)
    splits = Column(JSON, nullable=False, default=lambda: {"train": 70, "val": 20, "test": 10})
    preprocessing = Column(JSON, nullable=False, default=dict)
    augmentations = Column(JSON, nullable=False, default=dict)
    image_count = Column(Integer, default=0, nullable=False)
    export_key = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    project = relationship("Project")


class TrainingJob(Base):
    __tablename__ = "training_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    version_id = Column(UUID(as_uuid=True), ForeignKey("dataset_versions.id", ondelete="SET NULL"), nullable=True, index=True)
    model_name = Column(String(40), nullable=False, default="yolov8n")
    task = Column(String(20), nullable=False, default="detect")
    epochs = Column(Integer, nullable=False, default=50)
    batch_size = Column(Integer, nullable=False, default=16)
    img_size = Column(Integer, nullable=False, default=640)
    device = Column(String(20), nullable=False, default="cpu")
    status = Column(String(20), nullable=False, default="queued")  # queued, training, completed, failed, cancelled
    progress = Column(Float, nullable=False, default=0.0)
    current_epoch = Column(Integer, nullable=False, default=0)
    metrics = Column(JSON, nullable=False, default=dict)
    weights_key = Column(String(255), nullable=True)
    onnx_key = Column(String(255), nullable=True)
    error_message = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    project = relationship("Project")
    version = relationship("DatasetVersion")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(60), nullable=False)
    service = Column(String(40), nullable=False, default="gemini")
    encrypted_value = Column(String(500), nullable=False)
    masked_value = Column(String(60), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)


class DeployKey(Base):
    __tablename__ = "deploy_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(60), nullable=False)
    key_hash = Column(String(255), nullable=False, index=True)
    last4 = Column(String(4), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    project = relationship("Project")


class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    blocks = Column(JSON, nullable=False, default=list)
    is_api_enabled = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    project = relationship("Project")


class UniverseDataset(Base):
    __tablename__ = "universe_datasets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(120), nullable=False)
    description = Column(String(1000), nullable=False, default="")
    license = Column(String(60), nullable=False, default="CC BY 4.0")
    tags = Column(JSON, nullable=False, default=list)
    image_count = Column(Integer, default=0, nullable=False)
    project_type = Column(String(20), nullable=False, default="detect")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String(60), primary_key=True)
    value = Column(JSON, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

