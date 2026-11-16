"""Stage responsive copies of the public Park backgrounds in the Pages artifact."""
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageOps


def stage(site):
    assets = site / "note" / "assets"
    subprocess.run([sys.executable, Path(__file__).with_name("build-park-ink-washes.py"), site], check=True)
    widths = (480, 800, 1200)
    for width in widths:
        (assets / "cards" / str(width)).mkdir(parents=True, exist_ok=True)
    for key in range(10, 298):
        with Image.open(assets / f"{key}.jpg") as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            for width in widths:
                height = round(width * image.height / image.width)
                image.resize((width, height), Image.Resampling.LANCZOS).save(
                    assets / "cards" / str(width) / f"{key}.webp", "WEBP", quality=80, method=4
                )
    # Raw checkouts continue to use the originals until all variants are available.
    page = site / "park" / "index.html"
    html = page.read_text()
    tag = '<html lang="ko">'
    if tag not in html:
        raise ValueError("Park document tag missing")
    page.write_text(html.replace(tag, '<html lang="ko" data-park-webp>', 1))


if __name__ == "__main__":
    stage(Path(sys.argv[1]))
