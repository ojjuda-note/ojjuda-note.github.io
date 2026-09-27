#!/usr/bin/env python3
"""Verify Storage blobs from a decrypted snapshot; optionally upload to NEW project."""

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import uuid
from pathlib import Path
from urllib.parse import urlparse

import boto3
import psycopg
from botocore.client import Config
from psycopg.types.json import Jsonb


PRODUCTION_PROJECT_REF = "ziezbdjofcugznowiuda"


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def target_db_url(ref, source_ref):
    if not re.fullmatch(r"[a-z0-9]{20}", ref):
        raise RuntimeError("Invalid isolated target project reference")
    if ref in (source_ref, PRODUCTION_PROJECT_REF):
        raise RuntimeError("Refusing to restore the original production project")
    url = os.environ.get("RESTORE_SUPABASE_DB_URL", "")
    parsed = urlparse(url)
    direct = parsed.hostname == f"db.{ref}.supabase.co" and parsed.username == "postgres"
    pooler = bool(parsed.hostname and parsed.hostname.endswith(".pooler.supabase.com")
                  and parsed.username == f"postgres.{ref}")
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.password or not (direct or pooler):
        raise RuntimeError("Restore DB URL must match the isolated target Supabase project")
    return url


def preserve_object_metadata(db_url, objects, mapping):
    """Reapply original owner and user fields after the S3 API rewrites the DB rows.

    Keep the *new* backend version and ETag: restoring old storage.objects.metadata
    would make the new object's bytes unreachable or unverifiable.
    """
    with psycopg.connect(db_url, connect_timeout=20, sslmode="require") as connection:
        with connection.cursor() as cursor:
            cursor.execute("""SELECT column_name FROM information_schema.columns
                           WHERE table_schema = 'storage' AND table_name = 'objects'""")
            columns = {row[0] for row in cursor.fetchall()}
            fields = [field for field in
                      ("owner", "owner_id", "user_metadata", "created_at", "updated_at")
                      if field in columns and any(field in row for row in objects.values())]
            if "owner" not in fields and "owner_id" not in fields:
                raise RuntimeError("Target Storage owner columns are unavailable")
            setters = ", ".join(f"{field} = %s" for field in fields)
            returning = ", ".join(("bucket_id", "name", *fields))
            for item in mapping:
                bucket, key = item["bucket"], item["key"]
                original = objects[(bucket, key)]
                values = []
                for field in fields:
                    value = original.get(field)
                    if value is not None and field == "user_metadata":
                        value = Jsonb(value)
                    elif value is not None and field == "owner":
                        value = uuid.UUID(value)
                    elif value is not None and field in ("created_at", "updated_at"):
                        value = dt.datetime.fromisoformat(value)
                    values.append(value)
                cursor.execute(f"""UPDATE storage.objects SET {setters}
                                WHERE bucket_id = %s AND name = %s
                                RETURNING {returning}""",
                               (*values, bucket, key))
                result = cursor.fetchone()
                if result is None or result[:2] != (bucket, key):
                    raise RuntimeError("Restored Storage object metadata row missing")
                actual = dict(zip(fields, result[2:]))
                if ("owner" in fields and actual["owner"] !=
                    (uuid.UUID(original["owner"]) if original.get("owner") else None)) or (
                    "owner_id" in fields and actual["owner_id"] != original.get("owner_id")
                ) or ("user_metadata" in fields and
                      actual["user_metadata"] != original.get("user_metadata")):
                    raise RuntimeError("Restored Storage owner or user metadata differs")
            cursor.execute("SELECT count(*) FROM storage.objects")
            if cursor.fetchone()[0] != len(objects):
                raise RuntimeError("Target Storage object count differs from backup")
            # The transaction commits only after every row is present and checked.


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot", type=Path, help="Directory extracted from the decrypted tar.gz")
    parser.add_argument("--apply", action="store_true", help="Upload only after isolated DB restore")
    args = parser.parse_args()
    root = args.snapshot.resolve()
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    for item in manifest["files"]:
        file = (root / item["path"]).resolve()
        if root not in file.parents or file.stat().st_size != item["bytes"]:
            raise RuntimeError("Manifest path or file size mismatch")
        if sha256(file) != item["sha256"]:
            raise RuntimeError("Manifest SHA-256 mismatch")
    mapping = json.loads((root / "storage-map.json").read_text(encoding="utf-8"))
    for item in mapping:
        # The blob path is a digest, never an untrusted user filename.
        digest = hashlib.sha256((item["bucket"] + "\0" + item["key"]).encode()).hexdigest()
        if item["blob"] != f"storage/blobs/{digest}":
            raise RuntimeError("Unexpected Storage blob path")
        blob = root / item["blob"]
        if blob.stat().st_size != item["bytes"] or sha256(blob) != item["sha256"]:
            raise RuntimeError("Storage blob integrity failure")
    print(f"Verified {len(manifest['files'])} snapshot files and {len(mapping)} Storage blobs locally")
    if not args.apply:
        return
    keys = ("RESTORE_SUPABASE_PROJECT_REF", "RESTORE_SUPABASE_REGION",
            "RESTORE_SUPABASE_S3_ACCESS_KEY", "RESTORE_SUPABASE_S3_SECRET_KEY",
            "RESTORE_SUPABASE_DB_URL")
    if any(not os.environ.get(key) for key in keys):
        raise RuntimeError("Missing target project Storage credentials")
    ref = os.environ["RESTORE_SUPABASE_PROJECT_REF"]
    source_ref = manifest["project_ref"]
    db_url = target_db_url(ref, source_ref)
    objects = {(o["bucket_id"], o["name"]): o for o in
               [json.loads(line) for line in (root / "objects.jsonl").read_text(encoding="utf-8").splitlines()
                if line]}
    if len(objects) != len(mapping) or {(item["bucket"], item["key"]) for item in mapping} != set(objects):
        raise RuntimeError("Snapshot Storage metadata and blob map disagree")
    client = boto3.client(
        "s3", endpoint_url=f"https://{ref}.storage.supabase.co/storage/v1/s3",
        region_name=os.environ["RESTORE_SUPABASE_REGION"],
        aws_access_key_id=os.environ["RESTORE_SUPABASE_S3_ACCESS_KEY"],
        aws_secret_access_key=os.environ["RESTORE_SUPABASE_S3_SECRET_KEY"],
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )
    for bucket in {item["bucket"] for item in mapping}:
        client.head_bucket(Bucket=bucket)
    for item in mapping:
        blob = root / item["blob"]
        original = objects[(item["bucket"], item["key"])]
        metadata = original.get("metadata") or {}
        extra = {}
        mime = metadata.get("mimetype") or metadata.get("contentType")
        cache = metadata.get("cacheControl")
        if isinstance(mime, str) and mime and "\r" not in mime and "\n" not in mime:
            extra["ContentType"] = mime
        if isinstance(cache, str) and cache and "\r" not in cache and "\n" not in cache:
            extra["CacheControl"] = cache
        client.upload_file(str(blob), item["bucket"], item["key"], ExtraArgs=extra)
        obj = client.get_object(Bucket=item["bucket"], Key=item["key"])
        h = hashlib.sha256()
        try:
            for chunk in iter(lambda: obj["Body"].read(4 * 1024 * 1024), b""):
                h.update(chunk)
        finally:
            obj["Body"].close()
        if h.hexdigest() != item["sha256"]:
            raise RuntimeError("Uploaded Storage object did not verify")
        if "ContentType" in extra and obj.get("ContentType") != extra["ContentType"]:
            raise RuntimeError("Restored Storage content type differs from backup")
    preserve_object_metadata(db_url, objects, mapping)
    print(f"Uploaded and verified {len(mapping)} objects in the isolated target project")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Restore FAILED: {type(exc).__name__}; inspect local archive and target setup")
        raise SystemExit(1)
