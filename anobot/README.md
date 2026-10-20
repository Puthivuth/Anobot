# AnoBot — Computer Vision Workspace

AnoBot is a Roboflow-style computer-vision platform scaffold with a responsive React/TypeScript workspace, FastAPI backend foundation, PostgreSQL, Redis, and MinIO services.

## Current implementation status

This source package includes the full navigation and initial UI screens for Overview, Upload Data, annotation workspace, Versions, Health Check, Train, Visualize, Video, Deployments, Workflows, Export Dataset, Universe, Users, API Keys, Activity Log, Settings, and My account. The upload screen can preview selected local images; the class manager, project type selector, and training/configuration forms are interactive UI components.

**Important:** This is not yet a production-ready end-to-end computer vision service. The visible screens are not all connected to persistent APIs; authentication, database-backed project/image/annotation CRUD, real dataset generation/export, Ultralytics worker training, inference, and encrypted Gemini-key management still need implementation and tests. The UI intentionally does not fabricate model predictions or claim that training has completed.

## Requirements

- Docker Desktop (Windows/macOS) or Docker Engine + Compose (Linux)
- For GPU training later: NVIDIA driver and NVIDIA Container Toolkit, plus a CUDA-compatible PyTorch/Ultralytics environment

## Run locally

1. Copy `.env.example` to `.env`.
2. Replace development secrets in `.env` with long random values.
3. From this directory, run:

   ```bash
   docker compose up --build
   ```

4. Open:
   - Frontend: http://localhost:5173
   - API: http://localhost:8000
   - API docs: http://localhost:8000/docs
   - MinIO console: http://localhost:9001

## Services

- `web`: React 18 + TypeScript + Vite
- `api`: Python 3.11 + FastAPI
- `postgres`: PostgreSQL 16
- `redis`: Redis 7
- `minio`: S3-compatible local object storage

## API smoke tests

```bash
cd backend
python -m pip install -e '.[test]'
pytest
```

## Planned implementation order

1. Persistent first-run admin setup, session security, admin-created users and audit log.
2. PostgreSQL-backed projects, classes, image upload, thumbnails and access permissions.
3. Persistent annotations for detection, classification, polygon segmentation, semantic masks, keypoints and OBB.
4. Reproducible dataset versioning, augmentation, health checks and exporters.
5. Real Ultralytics training workers, metrics streaming, model storage and cancellation.
6. Real inference API, deploy keys, visualization, video inference and downloads.
7. Encrypted Gemini key slots, validated AI results, workflows, Universe, settings and backup/restore.
8. End-to-end tests, hardening, GPU deployment and release documentation.

## Security note

Do not expose this development configuration to the public internet. Configure strong secrets, HTTPS, secure cookies, rate limits, backup/restore testing, and server-side authorization before production use.
