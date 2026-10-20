import io
import zipfile
import json
import random
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.project import Project, ProjectClass, Image, Annotation
from app.services.storage import get_storage

def generate_dataset_zip(
    project: Project,
    classes: List[ProjectClass],
    images: List[Image],
    splits: Dict[str, int],
    export_format: str = "yolov8"
) -> bytes:
    """
    Generates a ZIP archive containing images, labels, and metadata in the specified format.
    export_format: 'yolov8' | 'coco' | 'voc'
    splits: {'train': 70, 'val': 20, 'test': 10}
    """
    storage = get_storage()
    zip_buf = io.BytesIO()

    # Map class id to class index and name
    class_map = {cls.id: idx for idx, cls in enumerate(classes)}
    class_names = [cls.name for cls in classes]

    # Calculate splits deterministically
    total = len(images)
    train_ratio = splits.get("train", 70) / 100.0
    val_ratio = splits.get("val", 20) / 100.0

    # Shuffle deterministically using project ID seed
    rng = random.Random(str(project.id))
    shuffled_images = list(images)
    rng.shuffle(shuffled_images)

    train_end = int(total * train_ratio)
    val_end = train_end + int(total * val_ratio)

    split_assignments = {}
    for idx, img in enumerate(shuffled_images):
        if idx < train_end:
            split_assignments[img.id] = "train"
        elif idx < val_end:
            split_assignments[img.id] = "val"
        else:
            split_assignments[img.id] = "test"

    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if export_format == "yolov8":
            # 1. data.yaml
            yaml_content = f"names:\n"
            for idx, cname in enumerate(class_names):
                yaml_content += f"  {idx}: {cname}\n"
            yaml_content += f"nc: {len(class_names)}\n"
            yaml_content += "train: images/train\nval: images/val\ntest: images/test\n"
            zf.writestr("data.yaml", yaml_content)

            # 2. Add images and labels
            for img in images:
                split = split_assignments.get(img.id, "train")
                img_bytes, _ = storage.get_object(img.storage_key)
                if not img_bytes:
                    continue

                # Write image
                ext = img.filename.split(".")[-1] if "." in img.filename else "jpg"
                base_name = f"{img.id}.{ext}"
                zf.writestr(f"images/{split}/{base_name}", img_bytes)

                # Write label text file
                lines = []
                w = float(img.width) or 1.0
                h = float(img.height) or 1.0

                for ann in img.annotations:
                    if ann.class_id not in class_map:
                        continue
                    c_idx = class_map[ann.class_id]
                    geom = ann.geometry or {}

                    if project.type == "detect" or ann.kind == "box":
                        # Support x_min, y_min, x_max, y_max or x, y, w, h
                        x_min = geom.get("x_min", geom.get("x", 0))
                        y_min = geom.get("y_min", geom.get("y", 0))
                        x_max = geom.get("x_max", x_min + geom.get("width", 0))
                        y_max = geom.get("y_max", y_min + geom.get("height", 0))

                        # Normalize to 0-1
                        x_center = ((x_min + x_max) / 2.0) / w
                        y_center = ((y_min + y_max) / 2.0) / h
                        box_w = abs(x_max - x_min) / w
                        box_h = abs(y_max - y_min) / h
                        lines.append(f"{c_idx} {x_center:.6f} {y_center:.6f} {box_w:.6f} {box_h:.6f}")

                    elif project.type == "segment" or ann.kind == "polygon":
                        points = geom.get("points", [])
                        if points:
                            coord_str = " ".join(f"{pt[0]/w:.6f} {pt[1]/h:.6f}" for pt in points)
                            lines.append(f"{c_idx} {coord_str}")

                    elif project.type == "obb" or ann.kind == "obb":
                        # 4 corners normalized
                        corners = geom.get("corners", [])
                        if len(corners) == 4:
                            coord_str = " ".join(f"{pt[0]/w:.6f} {pt[1]/h:.6f}" for pt in corners)
                            lines.append(f"{c_idx} {coord_str}")

                label_filename = f"{img.id}.txt"
                zf.writestr(f"labels/{split}/{label_filename}", "\n".join(lines))

        elif export_format == "coco":
            # COCO format JSON
            coco_data = {
                "images": [],
                "annotations": [],
                "categories": [
                    {"id": idx + 1, "name": cname, "supercategory": "none"}
                    for idx, cname in enumerate(class_names)
                ]
            }
            ann_id_counter = 1
            for img_idx, img in enumerate(images):
                coco_data["images"].append({
                    "id": img_idx + 1,
                    "file_name": img.filename,
                    "width": img.width,
                    "height": img.height
                })
                img_bytes, _ = storage.get_object(img.storage_key)
                if img_bytes:
                    zf.writestr(f"images/{img.filename}", img_bytes)

                for ann in img.annotations:
                    if ann.class_id not in class_map:
                        continue
                    cat_id = class_map[ann.class_id] + 1
                    geom = ann.geometry or {}
                    x_min = geom.get("x_min", 0)
                    y_min = geom.get("y_min", 0)
                    x_max = geom.get("x_max", 0)
                    y_max = geom.get("y_max", 0)
                    bw = max(0, x_max - x_min)
                    bh = max(0, y_max - y_min)
                    coco_data["annotations"].append({
                        "id": ann_id_counter,
                        "image_id": img_idx + 1,
                        "category_id": cat_id,
                        "bbox": [x_min, y_min, bw, bh],
                        "area": bw * bh,
                        "iscrowd": 0
                    })
                    ann_id_counter += 1

            zf.writestr("_annotations.coco.json", json.dumps(coco_data, indent=2))

    return zip_buf.getvalue()

