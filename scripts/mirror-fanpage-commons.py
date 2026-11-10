#!/usr/bin/env python3
"""Package freely licensed Wikimedia Commons fan photos as local WebP assets.

Only Commons files with a confirmed free license are mirrored. Official X,
publisher, and store images are intentionally not downloaded or republished.
An unavailable image is omitted from the manifest so the site falls back to
its existing external Commons URL instead of displaying a broken local file.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from PIL import Image, ImageOps, UnidentifiedImageError

Image.MAX_IMAGE_PIXELS = 45_000_000
AGENT = "OjjudaFanGallery/1.0 (https://ojjuda.kr/features/fanpages/)"
MAX_DOWNLOAD = 26 * 1024 * 1024
VALID_LICENSE = re.compile(r"^CC BY(?:-SA)? (?:[1-4](?:\.\d)?)$|^CC0 1\.0$", re.I)
FILE_PATTERN = re.compile(r"commonsPhoto\('([^']+)'\s*,")
CACHE_LIFETIME = 30 * 24 * 3600


def request_bytes(url: str, *, limit: int) -> bytes:
    request = Request(url, headers={"User-Agent": AGENT, "Accept": "application/json,image/*"})
    with urlopen(request, timeout=40) as response:
        host = urlparse(response.geturl()).hostname or ""
        if host not in {"commons.wikimedia.org", "upload.wikimedia.org"}:
            raise ValueError(f"Unexpected Wikimedia redirect destination: {host}")
        content = response.read(limit + 1)
    if len(content) > limit:
        raise ValueError("Image or response exceeds download limit")
    return content


def commons_info(filename: str) -> tuple[str, str, str]:
    params = urlencode({
        "action": "query",
        "format": "json",
        "formatversion": 2,
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": 1800,
        "titles": f"File:{filename}",
    })
    raw = request_bytes(f"https://commons.wikimedia.org/w/api.php?{params}", limit=512_000)
    payload = json.loads(raw)
    pages = payload.get("query", {}).get("pages", [])
    info = (pages[0].get("imageinfo") or [{}])[0] if pages else {}
    metadata = info.get("extmetadata") or {}
    license_name = re.sub(r"\s+", " ", metadata.get("LicenseShortName", {}).get("value", "")).strip()
    if not VALID_LICENSE.fullmatch(license_name):
        raise ValueError(f"File license is not verified as reusable: {license_name or 'missing'}")
    license_url = metadata.get("LicenseUrl", {}).get("value", "")
    if license_url.startswith("//"):
        license_url = "https:" + license_url
    if not license_url.startswith("https://creativecommons.org/"):
        raise ValueError("No verified Creative Commons license link")
    image_url = info.get("thumburl") or info.get("url") or ""
    if urlparse(image_url).hostname != "upload.wikimedia.org":
        raise ValueError("Invalid Commons image URL")
    return image_url, license_name, license_url


def variant_paths(cache: Path, filename: str) -> tuple[Path, Path, Path]:
    stem = hashlib.sha256(filename.encode("utf-8")).hexdigest()[:18]
    return cache / f"{stem}-960.webp", cache / f"{stem}-1600.webp", cache / f"{stem}.json"


def make_webp_variants(original: bytes, small: Path, large: Path) -> None:
    # Conversion and downscaling avoid shipping the original multi-megabyte PNG.
    with Image.open(io.BytesIO(original)) as decoded:
        image = ImageOps.exif_transpose(decoded)
        image.load()
        if image.width < 10 or image.height < 10:
            raise ValueError("Image is too small")
        if "A" in image.getbands():
            image = image.convert("RGBA")
        else:
            image = image.convert("RGB")
        for size, path in ((960, small), (1600, large)):
            output = image.copy()
            output.thumbnail((size, size), Image.Resampling.LANCZOS)
            pending = path.with_suffix(".tmp")
            output.save(pending, format="WEBP", quality=80, method=5)
            pending.replace(path)


def photo_record(filename: str, cache: Path, *, offline: bool) -> tuple[str, dict]:
    small, large, metadata_path = variant_paths(cache, filename)
    metadata = None
    if all(path.is_file() for path in (small, large, metadata_path)):
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            if metadata.get("filename") != filename:
                metadata = None
            if not offline and time.time() - float(metadata.get("checked", 0)) > CACHE_LIFETIME:
                metadata = None
        except (ValueError, OSError, TypeError):
            metadata = None

    if metadata is None:
        if offline:
            raise ValueError("No cached permission-checked image")
        image_url, license_name, license_url = commons_info(filename)
        original = request_bytes(image_url, limit=MAX_DOWNLOAD)
        try:
            make_webp_variants(original, small, large)
        except (UnidentifiedImageError, OSError) as error:
            raise ValueError("Cannot decode Commons image") from error
        metadata = {
            "filename": filename,
            "checked": time.time(),
            "license": license_name,
            "licenseUrl": license_url,
        }
        metadata_path.write_text(json.dumps(metadata), encoding="utf-8")

    if not VALID_LICENSE.fullmatch(metadata.get("license", "")):
        raise ValueError("Cached image license is unsupported")
    return filename, {
        "thumb": f"./media/{small.name}",
        "full": f"./media/{large.name}",
        "license": metadata["license"],
        "licenseUrl": metadata["licenseUrl"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--offline", action="store_true", help="Use already-licensed cache without network")
    args = parser.parse_args()

    source = args.source.read_text(encoding="utf-8")
    filenames = list(dict.fromkeys(FILE_PATTERN.findall(source)))
    if not filenames:
        raise RuntimeError("No Commons photos found; check the source parser")
    args.cache.mkdir(parents=True, exist_ok=True)
    media = args.output / "media"
    media.mkdir(parents=True, exist_ok=True)

    results: dict[str, dict] = {}
    failed: list[str] = []
    with ThreadPoolExecutor(max_workers=3) as executor:
        tasks = {executor.submit(photo_record, filename, args.cache, offline=args.offline): filename for filename in filenames}
        for task in as_completed(tasks):
            name = tasks[task]
            try:
                file_name, record = task.result()
                for key in ("thumb", "full"):
                    local_name = Path(record[key]).name
                    shutil.copy2(args.cache / local_name, media / local_name)
                results[file_name] = record
            except Exception as error:
                failed.append(name)
                print(f"Not mirrored: {name} ({type(error).__name__}: {error})", file=sys.stderr)

    serialized = json.dumps(dict(sorted(results.items())), ensure_ascii=False, separators=(",", ":"))
    # JSON stays JavaScript-safe even if future file names contain markup.
    serialized = serialized.replace("<", "\\u003c").replace(">", "\\u003e")
    (args.output / "photo-manifest.js").write_text(
        f"/* Wikimedia Commons CC images served locally; originals linked in gallery. */\nwindow.OJJUDA_FAN_LOCAL_PHOTOS = {serialized};\n",
        encoding="utf-8",
    )
    total_bytes = sum(path.stat().st_size for path in media.glob("*.webp"))
    print(f"Fan photo mirror: {len(results)}/{len(filenames)} licensed photos, {total_bytes / 1024 / 1024:.1f} MiB WebP; {len(failed)} external fallbacks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
