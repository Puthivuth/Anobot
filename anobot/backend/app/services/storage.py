import io
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from app.config import settings

class StorageService:
    def __init__(self):
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
            region_name="us-east-1",
        )
        self.bucket = settings.s3_bucket
        self._ensure_bucket()

    def _ensure_bucket(self):
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError:
            try:
                self.client.create_bucket(Bucket=self.bucket)
            except Exception as e:
                print(f"[Warning] Could not auto-create bucket {self.bucket}: {e}")

    def upload_bytes(self, key: str, data: bytes, content_type: str = "image/jpeg"):
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    def get_object(self, key: str):
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            return response["Body"].read(), response.get("ContentType", "application/octet-stream")
        except ClientError:
            return None, None

    def delete_object(self, key: str):
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except ClientError:
            pass

    def get_s3_client(self):
        return self.client

_storage: StorageService | None = None

def get_storage() -> StorageService:
    global _storage
    if _storage is None:
        _storage = StorageService()
    return _storage

storage_service = get_storage()


