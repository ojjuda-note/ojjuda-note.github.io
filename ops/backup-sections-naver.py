#!/usr/bin/env python3
"""Encrypt and verify per-service source archives at private Naver Object Storage.

Restoration requires all four archives together, plus a separately verified
database/Storage snapshot. Never treat these as member-data backups.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import io
import json
import os
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

from backup import (
    required_config, destination_s3, verify_private_destination,
    upload_and_verify, safe_run,
)

GROUPS = ("agit", "park", "pajang", "common")


def section(path):
    if path.startswith(("park/", "note/")):
        return "park"
    if path.startswith(("features/pajang/", "pajang/")):
        return "pajang"
    if path in ("index.html", "world.html", "version.json", "game-release.json") or path.startswith(
        ("features/home/", "features/arcade/", "games/", "assets/", "brand/", "admin/")
    ):
        return "agit"
    return "common"


def tracked_groups():
    raw = subprocess.check_output(["git", "ls-files", "-z"])
    names = [part.decode("utf-8") for part in raw.split(b"\0") if part]
    if len(names) != len(set(names)):
        raise RuntimeError("Duplicate tracked paths")
    groups = {name: [] for name in GROUPS}
    for name in names:
        if name.startswith("/") or ".." in Path(name).parts:
            raise RuntimeError("Unsafe source path")
        groups[section(name)].append(name)
    for name in GROUPS:
        if not groups[name]:
            raise RuntimeError("Empty source archive: " + name)
    for name, path in (("agit", "world.html"), ("park", "park/index.html"),
                       ("pajang", "features/pajang/index.html")):
        if path not in groups[name]:
            raise RuntimeError("Missing service entry: " + name)
    return groups


def make_archive(folder, name, paths, commit):
    archive_path = folder / (name + ".tar.gz")
    manifest = {
        "format": 1, "section": name, "commit": commit,
        "repository": os.environ["GITHUB_REPOSITORY"],
        "created_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "scope": "source_only",
        "restore": "Combine agit, park, pajang and common. Restore user DB and uploads separately.",
        "files": [],
    }
    with tarfile.open(archive_path, "w:gz") as tar:
        for path in paths:
            src = Path(path)
            if not (src.is_file() or src.is_symlink()):
                raise RuntimeError("Missing tracked source file: " + path)
            info = tar.gettarinfo(path, arcname=path)
            if src.is_symlink():
                tar.addfile(info)
                manifest["files"].append({"path": path, "symlink": info.linkname})
            else:
                digest = hashlib.sha256()
                with src.open("rb") as file:
                    for chunk in iter(lambda: file.read(1048576), b""):
                        digest.update(chunk)
                with src.open("rb") as file:
                    tar.addfile(info, file)
                manifest["files"].append({"path": path, "size": info.size, "sha256": digest.hexdigest()})
        body = json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode("utf-8")
        item = tarfile.TarInfo("backup-manifest.json")
        item.size, item.mode = len(body), 0o600
        tar.addfile(item, io.BytesIO(body))
    with tarfile.open(archive_path, "r:gz") as tar:
        saved = json.load(tar.extractfile("backup-manifest.json"))
        if saved["section"] != name or saved["commit"] != commit or len(saved["files"]) != len(paths):
            raise RuntimeError("Source manifest mismatch")
        for entry in saved["files"]:
            member = tar.getmember(entry["path"])
            if "symlink" in entry:
                if not member.issym() or member.linkname != entry["symlink"]:
                    raise RuntimeError("Source symlink mismatch")
            else:
                if not member.isfile() or member.size != entry["size"]:
                    raise RuntimeError("Source archive file-size mismatch")
                digest = hashlib.sha256()
                with tar.extractfile(member) as stream:
                    for chunk in iter(lambda: stream.read(1048576), b""):
                        digest.update(chunk)
                if digest.hexdigest() != entry["sha256"]:
                    raise RuntimeError("Source archive hash mismatch")
    return archive_path


def main():
    config = required_config()
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if len(commit) != 40:
        raise RuntimeError("Source commit not pinned")
    client = destination_s3(config)
    client.head_bucket(Bucket=config["BACKUP_S3_BUCKET"])
    verify_private_destination(client, config)
    now = dt.datetime.now(dt.timezone.utc)
    prefix = f'{config["prefix"]}/individual/{now:%Y-%m-%d}/{now:%H%M%SZ}-{commit[:12]}'
    groups = tracked_groups()
    with tempfile.TemporaryDirectory(prefix="ojjuda-naver-separate-") as temp:
        for name in GROUPS:
            plain = make_archive(Path(temp), name, groups[name], commit)
            encrypted = Path(temp) / (name + ".tar.gz.age")
            safe_run("Encrypt section", ["age", "-r", config["BACKUP_AGE_RECIPIENT"],
                                          "-o", str(encrypted), str(plain)])
            plain.unlink()
            key = prefix + "/" + name + "/source.tar.gz.age"
            upload_and_verify(client, config, encrypted, key)
            print(f"NAVER_SOURCE_VERIFIED section={name} files={len(groups[name])} "
                  f"bytes={encrypted.stat().st_size} key={key}", flush=True)
            encrypted.unlink()
    print("NAVER_SECTIONS_SUCCESS source=agit,park,pajang,common; shared-data separate", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        if isinstance(exc, RuntimeError):
            print("NAVER_SECTIONS_FAILED: " + str(exc), file=sys.stderr)
        else:
            print("NAVER_SECTIONS_FAILED: internal archive or upload error", file=sys.stderr)
        raise SystemExit(1)
