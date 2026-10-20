import uuid
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field, ConfigDict

class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: str = Field(pattern="^(detect|classify|segment|keypoint|obb)$", default="detect")
    is_public: bool = False
    keypoint_schema: dict = Field(default_factory=dict)

class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    type: Optional[str] = Field(default=None, pattern="^(detect|classify|segment|keypoint|obb)$")
    is_public: Optional[bool] = None
    keypoint_schema: Optional[dict] = None

class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    type: str
    is_public: bool
    keypoint_schema: dict
    images_count: int = 0
    annotated_count: int = 0
    classes_count: int = 0
    created_at: datetime
    updated_at: datetime

class ClassCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    color: str = Field(default="#6706ce", max_length=20)
    position: Optional[int] = 0

class ClassUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    color: Optional[str] = Field(default=None, max_length=20)
    position: Optional[int] = None

class ClassResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    color: str
    position: int
    created_at: datetime

class ImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    filename: str
    width: int
    height: int
    phash: str
    split_hint: Optional[str] = None
    annotations_count: int = 0
    created_at: datetime

class UploadImagesResponse(BaseModel):
    uploaded_count: int
    duplicate_warnings: List[dict]
    images: List[ImageResponse]

class AnnotationCreateRequest(BaseModel):
    class_id: uuid.UUID
    kind: str = Field(pattern="^(box|polygon|keypoints|obb|tag)$")
    geometry: dict | list
    source: str = "manual"

class AnnotationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    image_id: uuid.UUID
    class_id: uuid.UUID
    kind: str
    geometry: Any
    source: str
    created_at: datetime
    updated_at: datetime

class AnnotationBatchSaveRequest(BaseModel):
    annotations: List[AnnotationCreateRequest]
