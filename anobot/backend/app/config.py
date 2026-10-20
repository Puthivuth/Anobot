from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_name: str = "AnoBot API"
    database_url: str = "postgresql+psycopg://anobot:anobot_dev_password@localhost:5432/anobot"
    redis_url: str = "redis://localhost:6379/0"
    web_origin: str = "http://localhost:5173"
    secret_key: str = "local-development-secret-change-me"
    master_encryption_key: str = ""
    s3_endpoint: str = "http://localhost:9000"
    s3_bucket: str = "anobot"
    s3_access_key: str = "anobot"
    s3_secret_key: str = "anobot_minio_dev_secret"
    default_gemini_model: str = "gemini-2.0-flash"
    training_device: str = "cpu"
    max_upload_mb: int = 25

settings = Settings()
