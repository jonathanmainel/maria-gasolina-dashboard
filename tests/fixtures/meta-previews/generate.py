"""Controlled raster files; no client media or network. Requires Pillow for regeneration."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).parent
for name, size in {"tiny": (64, 64), "small": (160, 284), "large": (1080, 1920), "image": (1080, 1350), "wide": (1920, 1080)}.items():
    image = Image.new("RGB", size, "#21333d")
    draw = ImageDraw.Draw(image)
    draw.rectangle((1, 1, size[0]-2, size[1]-2), outline="#d7982b", width=max(1, size[0]//100))
    draw.rectangle((size[0]//4, size[1]//4, size[0]*3//4, size[1]*3//4), fill="#9d2a1e")
    draw.text((size[0]//8, size[1]//8), f"FIXTURE {size[0]}x{size[1]}", fill="white")
    for extension in (["png", "jpg", "webp", "gif"] if name == "large" else ["png", "jpg"] if name == "small" else ["png"]):
        image.save(root / f"{name}.{extension}")
    if name == "large":
        image.save(root / f"{name}-lossless.webp", lossless=True)
