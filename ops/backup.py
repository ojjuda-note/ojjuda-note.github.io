#!/usr/bin/env python3
"""Nightly, encrypted, offsite recovery snapshot for Ojjuda.

Only ciphertext leaves the temporary GitHub runner. Requires independently
configured secrets; a missing or incomplete component fails the whole job.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path
from urllib.parse import quote, urlparse

import boto3
from botocore.client import Config
from psycopg.conninfo import conninfo_to_dict, make_conninfo


NAVER_ENDPOINT = "https://kr.object.ncloudstorage.com"
NAVER_REGION = "kr-standard"

NEEDED = (
    "SUPABASE_PROJECT_REF", "SUPABASE_REGION",
    "SUPABASE_S3_ACCESS_KEY", "SUPABASE_S3_SECRET_KEY",
    "BACKUP_S3_ENDPOINT", "BACKUP_S3_REGION", "BACKUP_S3_BUCKET",
    "BACKUP_S3_ACCESS_KEY", "BACKUP_S3_SECRET_KEY",
    "BACKUP_AGE_RECIPIENT", "GITHUB_REPOSITORY",
)


def required_config():
    missing = [key for key in NEEDED if not os.environ.get(key, "").strip()]
    if missing:
        raise RuntimeError("Missing backup configuration: " + ", ".join(missing))
    cfg = {key: os.environ[key].strip() for key in NEEDED}
    if not re.fullmatch(r"[a-z0-9]{20}", cfg["SUPABASE_PROJECT_REF"]):
        raise RuntimeError("Invalid Supabase project reference")
    ref = cfg["SUPABASE_PROJECT_REF"]
    cfg["SUPABASE_DB_URL"] = os.environ.get("SUPABASE_DB_URL", "").strip()
    if not cfg["SUPABASE_DB_URL"]:
        # Preserve the password exactly; reserved characters must be URL-encoded.
        password = os.environ.get("SUPABASE_DB_PASSWORD", "")
        if not password:
            raise RuntimeError("Missing backup configuration: SUPABASE_DB_PASSWORD or SUPABASE_DB_URL")
        host = os.environ.get("SUPABASE_DB_POOLER_HOST", "").strip()
        expected_host = r"aws-\d+-" + re.escape(cfg["SUPABASE_REGION"]) + r"\.pooler\.supabase\.com"
        if not re.fullmatch(expected_host, host):
            raise RuntimeError("SUPABASE_DB_POOLER_HOST must be the project's regional Supabase session pooler")
        # The host is copied from Dashboard > Connect, never inferred from region.
        cfg["SUPABASE_DB_URL"] = (
            f"postgresql://postgres.{ref}:{quote(password, safe='')}@{host}:5432/postgres?sslmode=require"
        )
    db = urlparse(cfg["SUPABASE_DB_URL"])
    if db.scheme not in ("postgres", "postgresql") or not db.hostname or not db.password:
        raise RuntimeError("SUPABASE_DB_URL must be a complete Postgres connection URL")
    direct = db.hostname == f"db.{ref}.supabase.co" and db.username == "postgres"
    pooler = db.hostname.endswith(".pooler.supabase.com") and db.username == f"postgres.{ref}"
    if not (direct or pooler):
        raise RuntimeError("Database connection does not match the configured Supabase project")
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", cfg["GITHUB_REPOSITORY"]):
        raise RuntimeError("Invalid GitHub repository")
    if not re.fullmatch(r"age1[023456789acdefghjklmnpqrstuvwxyz]{55,65}", cfg["BACKUP_AGE_RECIPIENT"]):
        raise RuntimeError("BACKUP_AGE_RECIPIENT must be an age public recipient")
    endpoint = urlparse(cfg["BACKUP_S3_ENDPOINT"])
    if endpoint.scheme != "https" or not endpoint.hostname:
        raise RuntimeError("Offsite S3 endpoint must use HTTPS")
    if (cfg["BACKUP_S3_ENDPOINT"].rstrip("/") != NAVER_ENDPOINT
            or cfg["BACKUP_S3_REGION"] != NAVER_REGION):
        raise RuntimeError("Offsite backup must use NAVER Cloud Object Storage in Korea")
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9.-]{1,61}[a-zA-Z0-9]", cfg["BACKUP_S3_BUCKET"]):
        raise RuntimeError("Invalid offsite bucket name")
    retention = int(os.environ.get("BACKUP_RETENTION_DAYS", "30"))
    if not 7 <= retention <= 90:
        raise RuntimeError("BACKUP_RETENTION_DAYS must be between 7 and 90")
    prefix = os.environ.get("BACKUP_KEY_PREFIX", "ojjuda-disaster-recovery/v1").strip("/")
    if not re.fullmatch(r"[A-Za-z0-9/_-]+", prefix) or "//" in prefix:
        raise RuntimeError("Invalid backup key prefix")
    cfg["retention"] = retention
    cfg["prefix"] = prefix
    return cfg


def command_failure_reason(stderr):
    # Return only fixed descriptions. Raw tool diagnostics can contain passwords,
    # connection URLs or database contents and must never enter public CI logs.
    message = stderr.decode("utf-8", errors="replace").lower()
    reasons = (
        (("password authentication failed", "too many authentication errors",
          "wrong password"), "database authentication rejected; verify the existing database password"),
        (("tenant or user not found",), "database pooler tenant or user not found; verify connection settings"),
        (("could not translate host name", "name or service not known",
          "temporary failure in name resolution"), "database hostname resolution failed"),
        (("timeout expired", "connection timed out"), "database connection timed out"),
        (("network is unreachable", "no route to host", "connection refused"),
         "database network connection unavailable"),
        (("certificate verify failed", "ssl certificate verification failed"),
         "database TLS certificate verification failed"),
        (("permission denied",), "database permission denied"),
        (("too many clients", "remaining connection slots", "max client connections"),
         "database connection limit reached"),
    )
    for patterns, reason in reasons:
        if any(pattern in message for pattern in patterns):
            return reason
    return "unclassified command error; check configuration or connectivity"


def safe_run(label, args, *, env=None, output=None):
    result = subprocess.run(args, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, check=False)
    if result.returncode:
        # The Supabase CLI can include the DB URL in diagnostic output.
        # Neither arguments nor command output are emitted into CI logs.
        reason = command_failure_reason(result.stderr)
        raise RuntimeError(f"{label} failed (exit {result.returncode}); {reason}")
    if output:
        output.write_bytes(result.stdout)
    return result.stdout


def pg_query(label, sql, dest, cfg):
    # libpq does not expand a connection URL supplied through PGDATABASE.
    # Pass explicit connection parameters to psql, with the password only in env.
    params = conninfo_to_dict(cfg["SUPABASE_DB_URL"])
    password = params.pop("password")
    env = dict(os.environ, PGPASSWORD=password, PGCONNECT_TIMEOUT="20", LC_ALL="C")
    env.pop("PGDATABASE", None)
    safe_run(label, ["psql", "--dbname", make_conninfo(**params),
                    "-X", "-w", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
             env=env, output=dest)


def json_lines(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def digest_file(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def s3_client(endpoint, region, access, secret):
    return boto3.client(
        "s3", endpoint_url=endpoint, region_name=region,
        aws_access_key_id=access, aws_secret_access_key=secret,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"},
                      # Avoid optional AWS streaming checksum trailers on
                      # S3-compatible endpoints. Full SHA-256 is checked below.
                      request_checksum_calculation="when_required",
                      response_checksum_validation="when_required",
                      retries={"max_attempts": 5, "mode": "standard"}),
    )


def source_s3(cfg):
    ref = cfg["SUPABASE_PROJECT_REF"]
    endpoint = f"https://{ref}.storage.supabase.co/storage/v1/s3"
    return s3_client(endpoint, cfg["SUPABASE_REGION"],
                     cfg["SUPABASE_S3_ACCESS_KEY"], cfg["SUPABASE_S3_SECRET_KEY"])


def destination_s3(cfg):
    return s3_client(cfg["BACKUP_S3_ENDPOINT"], cfg["BACKUP_S3_REGION"],
                     cfg["BACKUP_S3_ACCESS_KEY"], cfg["BACKUP_S3_SECRET_KEY"])


def require_private_acl(acl, label):
    owner = acl.get("Owner", {}).get("ID")
    grants = acl.get("Grants", [])
    if not owner or not grants:
        raise RuntimeError(f"Cannot verify private {label} ACL")
    for grant in grants:
        grantee = grant.get("Grantee", {})
        if (grantee.get("Type") != "CanonicalUser" or grantee.get("ID") != owner
                or grant.get("Permission") not in
                {"FULL_CONTROL", "READ", "WRITE", "READ_ACP", "WRITE_ACP"}):
            raise RuntimeError(f"Offsite {label} is shared; use an owner-only private backup bucket")
    if not any(grant.get("Permission") == "FULL_CONTROL" for grant in grants):
        raise RuntimeError(f"Cannot verify private {label} owner permissions")


def verify_private_destination(client, cfg, key=None):
    bucket = cfg["BACKUP_S3_BUCKET"]
    require_private_acl(client.get_bucket_acl(Bucket=bucket), "bucket")
    if key is not None:
        require_private_acl(client.get_object_acl(Bucket=bucket, Key=key), "object")


BUCKETS_SQL = "SELECT row_to_json(b)::text FROM storage.buckets b ORDER BY b.id"
OBJECTS_SQL = "SELECT row_to_json(o)::text FROM storage.objects o ORDER BY o.bucket_id,o.name"
CRON_SQL = "SELECT row_to_json(j)::text FROM cron.job j ORDER BY j.jobid"
MIGRATIONS_SQL = "SELECT row_to_json(m)::text FROM supabase_migrations.schema_migrations m ORDER BY m.version"
EXTENSIONS_SQL = "SELECT row_to_json(e)::text FROM (SELECT extname,extversion FROM pg_extension ORDER BY extname) e"
AUTH_COUNT_SQL = "SELECT count(*) FROM auth.users"
VAULT_COUNT_SQL = "SELECT count(*) FROM vault.secrets"
MANAGED_TRIGGERS_SQL = """SELECT row_to_json(x)::text FROM (
 SELECT n.nspname AS schema_name,c.relname AS table_name,t.tgname AS trigger_name,
        pg_get_triggerdef(t.oid) AS definition
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('auth','storage') AND NOT t.tgisinternal
 ORDER BY 1,2,3) x"""
MANAGED_POLICIES_SQL = """SELECT row_to_json(p)::text FROM pg_policies p
 WHERE p.schemaname IN ('auth','storage') ORDER BY p.schemaname,p.tablename,p.policyname"""


def collect_inventory(root, cfg, *, suffix=""):
    pg_query("Storage bucket inventory", BUCKETS_SQL, root / f"buckets{suffix}.jsonl", cfg)
    pg_query("Storage object inventory", OBJECTS_SQL, root / f"objects{suffix}.jsonl", cfg)


def check_db_dump(root, cfg):
    safe_run("Dump database roles", ["supabase", "db", "dump", "--db-url",
                                   cfg["SUPABASE_DB_URL"], "--role-only", "-f", str(root / "roles.sql")])
    safe_run("Dump database schema", ["supabase", "db", "dump", "--db-url",
                                    cfg["SUPABASE_DB_URL"], "-f", str(root / "schema.sql")])
    safe_run("Dump database data", ["supabase", "db", "dump", "--db-url",
                                  cfg["SUPABASE_DB_URL"], "--use-copy", "--data-only",
                                  "-x", "storage.buckets_vectors", "-x", "storage.vector_indexes",
                                  "-f", str(root / "data.sql")])
    for name in ("roles.sql", "schema.sql", "data.sql"):
        if not (root / name).is_file() or (root / name).stat().st_size < 10:
            raise RuntimeError(f"Database {name} is missing or empty")
    auth_count = int((root / "auth_count.txt").read_text().strip())
    objects_count = len(json_lines(root / "objects.jsonl"))
    expected = {"auth.users": auth_count, "storage.objects": objects_count}
    actual = {table: 0 for table in expected}
    seen = set()
    current = None
    in_copy = False
    # A literal table name elsewhere in the SQL (e.g. a function body) does not
    # prove that its rows were dumped. Stream the file: it can be many gigabytes.
    with (root / "data.sql").open(encoding="utf-8") as data:
        for line in data:
            if in_copy:
                if line.rstrip("\r\n") == r"\.":
                    in_copy = False
                    current = None
                elif current:
                    actual[current] += 1
                continue
            if not line.startswith("COPY "):
                continue
            in_copy = True
            match = re.match(r'^COPY ((?:"?auth"?\."?users"?)|(?:"?storage"?\."?objects"?)) '
                             r'\([^)]*\) FROM stdin;\s*$', line)
            if match:
                current = match.group(1).replace('"', '')
                if current in seen:
                    raise RuntimeError(f"Duplicate {current} data in database dump")
                seen.add(current)
    if in_copy:
        raise RuntimeError("Database dump ended in the middle of a COPY block")
    for table, count in expected.items():
        if table not in seen or actual[table] != count:
            raise RuntimeError(f"Database dump {table} row count differs from inventory "
                               f"(expected {count}, found {actual[table]})")


def copy_storage(root, cfg, client):
    buckets = json_lines(root / "buckets.jsonl")
    expected = json_lines(root / "objects.jsonl")
    names = {b["id"] for b in buckets}
    if len(names) != len(buckets):
        raise RuntimeError("Duplicate Storage bucket IDs")
    objects = {(o["bucket_id"], o["name"]): o for o in expected}
    if len(objects) != len(expected) or any(o["bucket_id"] not in names for o in expected):
        raise RuntimeError("Storage metadata has duplicate keys or an unknown bucket")

    observed = set()
    for bucket in sorted(names):
        for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket):
            for item in page.get("Contents", []):
                observed.add((bucket, item["Key"]))
    if observed != set(objects):
        raise RuntimeError(f"Storage object mismatch: DB={len(objects)}, S3={len(observed)}")

    mapping = []
    blobs = root / "storage" / "blobs"
    blobs.mkdir(parents=True)
    for bucket, key in sorted(observed):
        metadata = objects[(bucket, key)].get("metadata") or {}
        name_hash = hashlib.sha256((bucket + "\0" + key).encode("utf-8")).hexdigest()
        path = blobs / name_hash
        response = client.get_object(Bucket=bucket, Key=key)
        try:
            with path.open("wb") as out:
                for chunk in iter(lambda: response["Body"].read(4 * 1024 * 1024), b""):
                    out.write(chunk)
        finally:
            response["Body"].close()
        size = path.stat().st_size
        db_size = metadata.get("size")
        if db_size is not None and int(db_size) != size:
            raise RuntimeError("Storage size differs from database metadata")
        db_etag = str(metadata.get("eTag", "")).strip('"')
        if db_etag and response.get("ETag", "").strip('"') != db_etag:
            raise RuntimeError("Storage ETag differs from database metadata")
        mapping.append({"bucket": bucket, "key": key, "blob": f"storage/blobs/{name_hash}",
                        "bytes": size, "sha256": digest_file(path)})
    (root / "storage-map.json").write_text(json.dumps(mapping, ensure_ascii=False, indent=2),
                                             encoding="utf-8")
    return len(buckets), len(mapping)


def archive_and_encrypt(root, cfg, ciphertext):
    files = sorted(p for p in root.rglob("*") if p.is_file() and p.name != "manifest.json")
    if not files:
        raise RuntimeError("Refusing to upload an empty backup")
    manifest = {
        "format": 1, "created_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "repository": cfg["GITHUB_REPOSITORY"], "project_ref": cfg["SUPABASE_PROJECT_REF"],
        "files": [{"path": str(p.relative_to(root)), "bytes": p.stat().st_size,
                   "sha256": digest_file(p)} for p in files],
    }
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False),
                                           encoding="utf-8")
    plain = ciphertext.with_suffix("")
    with tarfile.open(plain, "w:gz") as archive:
        for file in files + [root / "manifest.json"]:
            archive.add(file, arcname=str(file.relative_to(root)), recursive=False)
    verify_archive(plain)
    safe_run("Encrypt backup", ["age", "-r", cfg["BACKUP_AGE_RECIPIENT"],
                                "-o", str(ciphertext), str(plain)])
    plain.unlink()
    return manifest


def verify_archive(path):
    with tarfile.open(path, "r:gz") as archive:
        manifest = json.load(archive.extractfile("manifest.json"))
        for item in manifest["files"]:
            stream = archive.extractfile(item["path"])
            if stream is None:
                raise RuntimeError("Archive is missing a manifest entry")
            hasher = hashlib.sha256()
            size = 0
            for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
                hasher.update(chunk)
                size += len(chunk)
            if hasher.hexdigest() != item["sha256"] or size != item["bytes"]:
                raise RuntimeError("Archive integrity verification failed")


def upload_and_verify(client, cfg, file, key):
    bucket = cfg["BACKUP_S3_BUCKET"]
    verify_private_destination(client, cfg)
    sha = digest_file(file)
    client.upload_file(str(file), bucket, key,
                       ExtraArgs={"ACL": "private", "Metadata": {"sha256": sha},
                                  "ContentType": "application/octet-stream"})
    verify_private_destination(client, cfg, key)
    response = client.get_object(Bucket=bucket, Key=key)
    hasher = hashlib.sha256()
    try:
        for chunk in iter(lambda: response["Body"].read(4 * 1024 * 1024), b""):
            hasher.update(chunk)
    finally:
        response["Body"].close()
    if hasher.hexdigest() != sha or int(response["ContentLength"]) != file.stat().st_size:
        raise RuntimeError("Offsite upload verification failed; backup not completed")


def prune_expired(client, cfg, now):
    prefix = cfg["prefix"] + "/daily/"
    cutoff = now.date() - dt.timedelta(days=cfg["retention"])
    for page in client.get_paginator("list_objects_v2").paginate(
            Bucket=cfg["BACKUP_S3_BUCKET"], Prefix=prefix):
        for item in page.get("Contents", []):
            key = item["Key"]
            # Never touch unexpected objects or unrelated paths in this bucket.
            match = re.fullmatch(re.escape(prefix) +
                                 r"(\d{4}-\d{2}-\d{2})/backup-\d{8}T\d{6}Z\.tar\.gz\.age", key)
            if not match:
                continue
            if dt.date.fromisoformat(match.group(1)) < cutoff:
                client.delete_object(Bucket=cfg["BACKUP_S3_BUCKET"], Key=key)


def main():
    cfg = required_config()
    if len(sys.argv) == 2 and sys.argv[1] == "--check-config":
        print("All required secret names are configured; live backup has not run")
        return
    if len(sys.argv) != 1:
        raise RuntimeError("Usage: backup.py [--check-config]")
    for command in ("git", "supabase", "psql", "age"):
        if shutil.which(command) is None:
            raise RuntimeError(f"Required executable unavailable: {command}")
    source, offsite = source_s3(cfg), destination_s3(cfg)
    offsite.head_bucket(Bucket=cfg["BACKUP_S3_BUCKET"])
    verify_private_destination(offsite, cfg)
    pg_query("Database connection", "SELECT 1", Path(os.devnull), cfg)
    started = dt.datetime.now(dt.timezone.utc)
    kst = started.astimezone(dt.timezone(dt.timedelta(hours=9)))
    label = started.strftime("%Y%m%dT%H%M%SZ")
    key = f"{cfg['prefix']}/daily/{kst:%Y-%m-%d}/backup-{label}.tar.gz.age"
    with tempfile.TemporaryDirectory(prefix="ojjuda-backup-") as temp:
        root = Path(temp) / "snapshot"
        root.mkdir(mode=0o700)
        mirror = Path(temp) / "repo.git"
        url = f"https://github.com/{cfg['GITHUB_REPOSITORY']}.git"
        safe_run("Mirror repository", ["git", "clone", "--quiet", "--mirror", url, str(mirror)])
        with tarfile.open(root / "source-git-mirror.tar.gz", "w:gz") as archive:
            archive.add(mirror, arcname="repo.git")
        collect_inventory(root, cfg)
        pg_query("Auth count", AUTH_COUNT_SQL, root / "auth_count.txt", cfg)
        pg_query("Vault secret count", VAULT_COUNT_SQL, root / "vault_secret_count.txt", cfg)
        if int((root / "vault_secret_count.txt").read_text().strip()):
            raise RuntimeError("Vault secrets need a separately escrowed encryption root key before this is a complete recovery backup")
        pg_query("Cron jobs", CRON_SQL, root / "cron_jobs.jsonl", cfg)
        pg_query("Migration history", MIGRATIONS_SQL, root / "migration_history.jsonl", cfg)
        pg_query("Extensions", EXTENSIONS_SQL, root / "extensions.jsonl", cfg)
        pg_query("Auth and Storage triggers", MANAGED_TRIGGERS_SQL,
                 root / "managed_schema_triggers.jsonl", cfg)
        pg_query("Auth and Storage policies", MANAGED_POLICIES_SQL,
                 root / "managed_schema_policies.jsonl", cfg)
        check_db_dump(root, cfg)
        bucket_count, object_count = copy_storage(root, cfg, source)
        collect_inventory(root, cfg, suffix="-after")
        for stem in ("buckets", "objects"):
            if (root / f"{stem}.jsonl").read_bytes() != (root / f"{stem}-after.jsonl").read_bytes():
                raise RuntimeError("Storage changed during backup; retry a new snapshot")
        ciphertext = Path(temp) / f"backup-{label}.tar.gz.age"
        manifest = archive_and_encrypt(root, cfg, ciphertext)
        upload_and_verify(offsite, cfg, ciphertext, key)
        prune_expired(offsite, cfg, kst)
    print(f"Encrypted offsite backup verified: {key}; {len(manifest['files'])} files, "
          f"{bucket_count} buckets, {object_count} Storage objects")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Avoid exception traceback that may contain secret-bearing URLs.
        if isinstance(exc, RuntimeError):
            print(f"Backup FAILED: {exc}", file=sys.stderr)
        else:
            print(f"Backup FAILED: {type(exc).__name__}; inspect configuration or endpoint", file=sys.stderr)
        raise SystemExit(1)
