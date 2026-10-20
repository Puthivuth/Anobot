import os
import sys
import json
import time
import uuid
import shutil
import zipfile
import tempfile
import logging
from pathlib import Path
from datetime import datetime, timezone

import redis
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models.ml import DatasetVersion, TrainingJob
from app.services.storage import storage_service

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("anobot.train_worker")

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_redis_client():
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)

def run_training_job(job_dict: dict):
    job_id = job_dict["job_id"]
    project_id = job_dict["project_id"]
    version_id = job_dict.get("version_id")
    model_name = job_dict.get("model_name", "yolov8n")
    task = job_dict.get("task", "detect")
    epochs = int(job_dict.get("epochs", 50))
    batch_size = int(job_dict.get("batch_size", 16))
    img_size = int(job_dict.get("img_size", 640))
    device = job_dict.get("device", settings.training_device)

    logger.info(f"Starting training job {job_id} for project {project_id} (model={model_name}, epochs={epochs})")
    r = get_redis_client()
    db = SessionLocal()

    job = db.query(TrainingJob).filter(TrainingJob.id == uuid.UUID(job_id)).first()
    if not job:
        logger.error(f"Training job {job_id} not found in database")
        db.close()
        return

    if job.status == "cancelled":
        logger.info(f"Job {job_id} was already cancelled before start.")
        db.close()
        return

    job.status = "training"
    job.started_at = datetime.now(timezone.utc)
    job.progress = 0.0
    db.commit()

    # Create temporary directory for job
    work_dir = Path(tempfile.mkdtemp(prefix=f"anobot_job_{job_id}_"))
    data_dir = work_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Find and download dataset version archive
        version = None
        if version_id:
            version = db.query(DatasetVersion).filter(DatasetVersion.id == uuid.UUID(version_id)).first()
        else:
            version = (
                db.query(DatasetVersion)
                .filter(DatasetVersion.project_id == uuid.UUID(project_id))
                .order_by(DatasetVersion.version_number.desc())
                .first()
            )

        if not version or not version.export_key:
            raise ValueError(f"No exported dataset version found for project {project_id}")

        zip_path = work_dir / "dataset.zip"
        s3 = storage_service.get_s3_client()
        logger.info(f"Downloading dataset archive {version.export_key} from MinIO...")
        s3.download_file(settings.s3_bucket, version.export_key, str(zip_path))

        with zipfile.ZipFile(str(zip_path), "r") as zip_ref:
            zip_ref.extractall(str(data_dir))

        # Locate data.yaml
        yaml_candidates = list(data_dir.glob("**/data.yaml"))
        if not yaml_candidates:
            raise FileNotFoundError("data.yaml not found in extracted dataset archive")
        data_yaml = yaml_candidates[0]
        logger.info(f"Found dataset config at {data_yaml}")

        # Import ultralytics YOLO
        try:
            from ultralytics import YOLO
        except ImportError:
            raise RuntimeError("ultralytics is not installed in worker environment.")

        # Determine model file based on task
        # detect: yolov8n.pt, segment: yolov8n-seg.pt, classify: yolov8n-cls.pt, pose: yolov8n-pose.pt, obb: yolov8n-obb.pt
        suffix = ""
        if task == "segment":
            suffix = "-seg"
        elif task == "classify":
            suffix = "-cls"
        elif task == "keypoint":
            suffix = "-pose"
        elif task == "obb":
            suffix = "-obb"

        base_weights = f"{model_name}{suffix}.pt"
        logger.info(f"Loading YOLO model with base weights {base_weights}")
        model = YOLO(base_weights)

        # Cancel flag check helper
        cancel_channel = f"training:{job_id}:control"

        # Register epoch callback
        def on_fit_epoch_end(trainer):
            # Check for cancellation
            control_msg = r.get(f"training:{job_id}:cancel")
            if control_msg:
                logger.info(f"Job {job_id} cancellation requested! Stopping trainer.")
                trainer.stop = True
                return

            curr_epoch = trainer.epoch + 1
            total_eps = trainer.epochs
            prog = round((curr_epoch / total_eps) * 100.0, 1)

            # Collect metrics
            metrics_dict = {}
            if hasattr(trainer, "metrics") and isinstance(trainer.metrics, dict):
                for k, v in trainer.metrics.items():
                    if isinstance(v, (int, float)):
                        metrics_dict[k] = round(float(v), 4)

            # Add losses
            if hasattr(trainer, "loss_items") and trainer.loss_items is not None:
                try:
                    losses = [round(float(x), 4) for x in trainer.loss_items]
                    metrics_dict["train_losses"] = losses
                except Exception:
                    pass

            # Update database
            try:
                db_sub = SessionLocal()
                j = db_sub.query(TrainingJob).filter(TrainingJob.id == uuid.UUID(job_id)).first()
                if j:
                    j.current_epoch = curr_epoch
                    j.progress = prog
                    j.metrics = metrics_dict
                    db_sub.commit()
                db_sub.close()
            except Exception as e:
                logger.warning(f"Could not update intermediate metrics in DB: {e}")

            # Publish to Redis pubsub
            event_payload = {
                "job_id": job_id,
                "epoch": curr_epoch,
                "total_epochs": total_eps,
                "progress": prog,
                "metrics": metrics_dict,
                "status": "training"
            }
            try:
                r.publish(f"training:{job_id}:metrics", json.dumps(event_payload))
            except Exception:
                pass

        model.add_callback("on_fit_epoch_end", on_fit_epoch_end)

        # Run training
        output_dir = work_dir / "output"
        train_results = model.train(
            data=str(data_yaml),
            epochs=epochs,
            batch=batch_size,
            imgsz=img_size,
            device=device,
            project=str(output_dir),
            name="train_run",
            exist_ok=True,
            save=True,
            verbose=True,
        )

        # Check if cancelled during training
        if r.get(f"training:{job_id}:cancel"):
            job = db.query(TrainingJob).filter(TrainingJob.id == uuid.UUID(job_id)).first()
            if job:
                job.status = "cancelled"
                job.finished_at = datetime.now(timezone.utc)
                db.commit()
            logger.info(f"Job {job_id} successfully cancelled.")
            return

        # Upload weights to MinIO
        run_dir = output_dir / "train_run"
        best_pt = run_dir / "weights" / "best.pt"
        last_pt = run_dir / "weights" / "last.pt"
        target_pt = best_pt if best_pt.exists() else last_pt

        weights_key = f"projects/{project_id}/models/{job_id}/best.pt"
        if target_pt.exists():
            logger.info(f"Uploading trained weights to MinIO: {weights_key}")
            s3.upload_file(str(target_pt), settings.s3_bucket, weights_key)
            job.weights_key = weights_key
        else:
            logger.warning("No best.pt or last.pt found in weights directory")

        # Automatically export to ONNX
        onnx_key = None
        try:
            logger.info(f"Exporting model to ONNX format...")
            onnx_path = model.export(format="onnx")
            if onnx_path and Path(onnx_path).exists():
                onnx_key = f"projects/{project_id}/models/{job_id}/best.onnx"
                s3.upload_file(str(onnx_path), settings.s3_bucket, onnx_key)
                job.onnx_key = onnx_key
                logger.info(f"Uploaded ONNX model to {onnx_key}")
        except Exception as onnx_err:
            logger.warning(f"ONNX export warning: {onnx_err}")

        # Mark completed
        job.status = "completed"
        job.progress = 100.0
        job.current_epoch = epochs
        job.finished_at = datetime.now(timezone.utc)
        db.commit()

        # Publish final completion event
        r.publish(f"training:{job_id}:metrics", json.dumps({
            "job_id": job_id,
            "status": "completed",
            "progress": 100.0,
            "weights_key": weights_key,
            "onnx_key": onnx_key,
        }))
        logger.info(f"Training job {job_id} successfully completed!")

    except Exception as exc:
        logger.exception(f"Training job {job_id} failed with error: {exc}")
        job = db.query(TrainingJob).filter(TrainingJob.id == uuid.UUID(job_id)).first()
        if job:
            job.status = "failed"
            job.error_message = str(exc)[:480]
            job.finished_at = datetime.now(timezone.utc)
            db.commit()

        try:
            r.publish(f"training:{job_id}:metrics", json.dumps({
                "job_id": job_id,
                "status": "failed",
                "error": str(exc),
            }))
        except Exception:
            pass

    finally:
        db.close()
        try:
            shutil.rmtree(work_dir, ignore_errors=True)
        except Exception:
            pass


def start_worker_loop():
    logger.info("AnoBot Training Worker initialized and listening on 'training_queue'...")
    r = get_redis_client()

    while True:
        try:
            # Blocking pop with 2 second timeout
            task_tuple = r.brpop("training_queue", timeout=2)
            if task_tuple:
                _, payload_raw = task_tuple
                payload = json.loads(payload_raw)
                run_training_job(payload)
        except KeyboardInterrupt:
            logger.info("Worker stopped by user.")
            break
        except Exception as e:
            logger.error(f"Worker queue polling error: {e}")
            time.sleep(2)


if __name__ == "__main__":
    start_worker_loop()

