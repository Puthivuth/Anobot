import io
from PIL import Image, ImageOps

SUPPORTED_FORMATS = {"JPEG", "PNG", "WEBP", "BMP"}

def compute_dhash(image: Image.Image) -> str:
    """Computes a 64-bit difference hash (dHash) as a 16-character hex string."""
    resized = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    pixels = list(resized.getdata())
    diff = []
    for row in range(8):
        for col in range(8):
            left = pixels[row * 9 + col]
            right = pixels[row * 9 + col + 1]
            diff.append(left > right)
    
    decimal_val = 0
    for idx, bit in enumerate(diff):
        if bit:
            decimal_val |= 1 << idx
    return f"{decimal_val:016x}"

def process_uploaded_image(file_bytes: bytes) -> dict:
    """
    Validates content, strips EXIF after orientation, generates 320px thumbnail
    and 1280px preview, and computes perceptual hash.
    """
    try:
        img = Image.open(io.BytesIO(file_bytes))
        fmt = img.format
        if fmt not in SUPPORTED_FORMATS:
            raise ValueError(f"Unsupported image format: {fmt}. Supported: JPEG, PNG, WebP, BMP.")
        img.load()
    except Exception as e:
        raise ValueError(f"Invalid or corrupted image: {str(e)}")

    # Apply EXIF orientation
    img = ImageOps.exif_transpose(img)

    # Convert to RGB if RGBA/P/etc. when converting to JPEG/WebP
    base_img = img
    if base_img.mode in ("RGBA", "LA") or (base_img.mode == "P" and "transparency" in base_img.info):
        # Keep transparency for PNG/WebP or convert to RGB on white background
        rgb_img = Image.new("RGB", base_img.size, (255, 255, 255))
        rgb_img.paste(base_img, mask=base_img.split()[-1] if len(base_img.split()) == 4 else None)
    else:
        rgb_img = base_img.convert("RGB")

    width, height = rgb_img.size
    phash = compute_dhash(rgb_img)

    # Normalized clean original bytes (EXIF stripped)
    orig_buffer = io.BytesIO()
    rgb_img.save(orig_buffer, format="JPEG", quality=95)
    clean_orig_bytes = orig_buffer.getvalue()

    # 1280px Preview
    preview_img = rgb_img.copy()
    preview_img.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
    prev_buffer = io.BytesIO()
    preview_img.save(prev_buffer, format="JPEG", quality=85)
    preview_bytes = prev_buffer.getvalue()

    # 320px Thumbnail
    thumb_img = rgb_img.copy()
    thumb_img.thumbnail((320, 320), Image.Resampling.LANCZOS)
    thumb_buffer = io.BytesIO()
    thumb_img.save(thumb_buffer, format="JPEG", quality=80)
    thumb_bytes = thumb_buffer.getvalue()

    return {
        "width": width,
        "height": height,
        "phash": phash,
        "original_bytes": clean_orig_bytes,
        "preview_bytes": preview_bytes,
        "thumb_bytes": thumb_bytes,
    }

