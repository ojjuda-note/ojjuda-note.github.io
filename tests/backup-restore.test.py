"""Synthetic encrypted restore exercise. Never reads production data or keys."""
import datetime as dt
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

from psycopg.conninfo import conninfo_to_dict

ROOT = Path(__file__).resolve().parents[1]

def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

backup = module("backup", "ops/backup.py")
restore = module("restore", "ops/restore-storage.py")

def private_acl():
    return {"Owner": {"ID": "ncp-synthetic-0"}, "Grants": [
        {"Grantee": {"Type": "CanonicalUser", "ID": "ncp-synthetic-0"},
         "Permission": "FULL_CONTROL"}]}

class RecoveryTest(unittest.TestCase):
    def test_command_errors_identify_failures_without_revealing_secrets(self):
        secret = "synthetic-private-marker"
        cases = [
            ("FATAL: password authentication failed for user", "authentication rejected"),
            ("FATAL: Circuit breaker open: Too many authentication errors", "authentication rejected"),
            ("FATAL: Tenant or user not found", "tenant or user not found"),
            ('could not translate host name "private" to address', "hostname resolution failed"),
            ("connection to server failed: timeout expired", "connection timed out"),
            ("connection to server failed: Network is unreachable", "network connection unavailable"),
            ("SSL certificate verification failed", "TLS certificate verification failed"),
            ("ERROR: permission denied for table", "permission denied"),
            ("FATAL: remaining connection slots are reserved", "connection limit reached"),
            ("unknown private server response", "unclassified command error"),
        ]
        for diagnostic, expected in cases:
            with self.subTest(expected=expected):
                result = subprocess.CompletedProcess(
                    ["psql"], 2, stdout=secret.encode(),
                    stderr=f"{diagnostic}\npostgresql://postgres:{secret}@private.invalid/db".encode())
                with patch.object(backup.subprocess, "run", return_value=result):
                    with self.assertRaises(RuntimeError) as raised:
                        backup.safe_run("Database connection", ["psql", secret])
                message = str(raised.exception)
                self.assertIn(expected, message)
                self.assertNotIn(secret, message)
                self.assertNotIn("postgresql://", message)
                self.assertNotIn("private.invalid", message)

    def test_encrypted_roundtrip_and_tamper_rejection(self):
        with tempfile.TemporaryDirectory() as temp:
            temp = Path(temp)
            source = temp / "source"
            source.mkdir()
            identity = temp / "synthetic-key.txt"
            subprocess.run(["age-keygen", "-o", str(identity)], check=True, capture_output=True)
            recipient = subprocess.check_output(["age-keygen", "-y", str(identity)], text=True).strip()
            blob = "storage/blobs/" + hashlib.sha256(b"media\0test/photo.jpg").hexdigest()
            (source / blob).parent.mkdir(parents=True)
            (source / blob).write_bytes(b"synthetic-photo-bytes")
            mapping = [{"bucket":"media","key":"test/photo.jpg","blob":blob,
                        "bytes":(source / blob).stat().st_size,"sha256":restore.sha256(source / blob)}]
            for file in ["roles.sql","schema.sql","data.sql","source-git-mirror.tar.gz",
                         "auth_count.txt","vault_secret_count.txt","cron_jobs.jsonl","migration_history.jsonl",
                         "extensions.jsonl","managed_schema_triggers.jsonl","managed_schema_policies.jsonl"]:
                (source / file).write_text("0\n")
            (source / "storage-map.json").write_text(json.dumps(mapping))
            (source / "objects.jsonl").write_text(json.dumps({"bucket_id":"media","name":"test/photo.jpg","owner_id":"synthetic-user"})+"\n")
            (source / "buckets.jsonl").write_text('{"id":"media"}\n')
            ciphertext = temp / "snapshot.tar.gz.age"
            cfg = {"GITHUB_REPOSITORY":"test/test","SUPABASE_PROJECT_REF":"a"*20,"BACKUP_AGE_RECIPIENT":recipient}
            backup.archive_and_encrypt(source,cfg,ciphertext)
            self.assertFalse(ciphertext.with_suffix("").exists(),"plaintext archive must be removed after encryption")
            self.assertNotIn(b"synthetic-photo-bytes",ciphertext.read_bytes())
            archive = temp / "decrypted.tar.gz"
            subprocess.run(["age","-d","-i",str(identity),"-o",str(archive),str(ciphertext)],check=True,capture_output=True)
            target = temp / "restore"
            target.mkdir()
            with tarfile.open(archive) as value:
                value.extractall(target,filter="data")
            manifest, actual, objects = restore.verify_snapshot(target)
            self.assertEqual(actual,mapping)
            self.assertEqual(objects[("media","test/photo.jpg")]["owner_id"],"synthetic-user")
            (target / blob).write_bytes(b"tampered-photo-bytes!")
            with self.assertRaises(RuntimeError): restore.verify_snapshot(target)
            # A truncated blob map must fail even in the default no-upload check.
            (source / "storage-map.json").write_text("[]")
            ciphertext.unlink()
            backup.archive_and_encrypt(source,cfg,ciphertext)
            with self.assertRaisesRegex(RuntimeError,"metadata and blob map disagree"):
                restore.verify_snapshot(source)

    def test_offsite_download_must_match(self):
        class FakeS3:
            def get_bucket_acl(self, **kwargs): return private_acl()
            def get_object_acl(self, **kwargs): return private_acl()
            def upload_file(self,*args,**kwargs): pass
            def get_object(self,**kwargs):return {"Body":io.BytesIO(b"corrupt"),"ContentLength":7}
        with tempfile.NamedTemporaryFile() as file:
            file.write(b"encrypted-backup");file.flush()
            with self.assertRaisesRegex(RuntimeError,"upload verification failed"):
                backup.upload_and_verify(FakeS3(),{"BACKUP_S3_BUCKET":"test"},Path(file.name),"test.age")

    def test_public_or_shared_acl_is_rejected(self):
        backup.require_private_acl(private_acl(), "bucket")
        grants = [
            {"Type": "Group", "URI": "http://acs.amazonaws.com/groups/global/AllUsers"},
            {"Type": "Group", "URI": "http://acs.amazonaws.com/groups/global/AuthenticatedUsers"},
            {"Type": "CanonicalUser", "ID": "another-account"},
        ]
        for grantee in grants:
            acl = private_acl()
            acl["Grants"].append({"Grantee": grantee, "Permission": "READ"})
            with self.subTest(grantee=grantee), self.assertRaisesRegex(RuntimeError, "is shared"):
                backup.require_private_acl(acl, "bucket")
        for acl in [{}, {"Owner": {"ID": "owner"}, "Grants": []}]:
            with self.assertRaisesRegex(RuntimeError, "Cannot verify"):
                backup.require_private_acl(acl, "bucket")

    def test_upload_checks_bucket_before_and_object_after(self):
        events = []
        shared = private_acl()
        shared["Grants"].append({"Grantee": {"Type": "Group", "URI": "public"}, "Permission": "READ"})
        class FakeS3:
            bucket_acl = private_acl()
            object_acl = private_acl()
            def get_bucket_acl(self, **kwargs):
                events.append("bucket")
                return self.bucket_acl
            def get_object_acl(self, **kwargs):
                events.append("object")
                return self.object_acl
            def upload_file(self, filename, bucket, key, **kwargs):
                events.append("upload")
                self.upload_args = kwargs["ExtraArgs"]
                self.data = Path(filename).read_bytes()
            def get_object(self, **kwargs):
                events.append("download")
                return {"Body": io.BytesIO(self.data), "ContentLength": len(self.data)}
        with tempfile.NamedTemporaryFile() as file:
            file.write(b"synthetic-ciphertext"); file.flush()
            client = FakeS3()
            client.bucket_acl = shared
            with self.assertRaisesRegex(RuntimeError, "is shared"):
                backup.upload_and_verify(client, {"BACKUP_S3_BUCKET": "test"}, Path(file.name), "test.age")
            self.assertEqual(events, ["bucket"], "shared bucket must prevent any upload")
            events.clear()
            client.bucket_acl = private_acl()
            client.object_acl = shared
            with self.assertRaisesRegex(RuntimeError, "is shared"):
                backup.upload_and_verify(client, {"BACKUP_S3_BUCKET": "test"}, Path(file.name), "test.age")
            self.assertEqual(events, ["bucket", "upload", "bucket", "object"])
            events.clear()
            client.object_acl = private_acl()
            backup.upload_and_verify(client, {"BACKUP_S3_BUCKET": "test"}, Path(file.name), "test.age")
            self.assertEqual(events, ["bucket", "upload", "bucket", "object", "download"])
            self.assertEqual(client.upload_args["ACL"], "private")
            self.assertEqual(client.upload_args["Metadata"]["sha256"], hashlib.sha256(client.data).hexdigest())

    def test_naver_destination_cannot_drift(self):
        ref = "a" * 20
        env = {key: "synthetic" for key in backup.NEEDED}
        env.update(SUPABASE_PROJECT_REF=ref,
                   SUPABASE_DB_URL=f"postgresql://postgres:synthetic@db.{ref}.supabase.co/postgres",
                   BACKUP_AGE_RECIPIENT="age1" + "q" * 58,
                   BACKUP_S3_ENDPOINT=backup.NAVER_ENDPOINT,
                   BACKUP_S3_REGION=backup.NAVER_REGION,
                   BACKUP_S3_BUCKET="synthetic-backup", GITHUB_REPOSITORY="test/test")
        with patch.dict(os.environ, env, clear=True):
            self.assertEqual(backup.required_config()["BACKUP_S3_REGION"], "kr-standard")
            for endpoint in ["https://sg.object.ncloudstorage.com", "https://example.invalid",
                             backup.NAVER_ENDPOINT + "/other", backup.NAVER_ENDPOINT + "?redirect=other"]:
                with patch.dict(os.environ, {"BACKUP_S3_ENDPOINT": endpoint}):
                    with self.assertRaisesRegex(RuntimeError, "NAVER Cloud"):
                        backup.required_config()
            with patch.dict(os.environ, {"BACKUP_S3_REGION": "us-standard"}):
                with self.assertRaisesRegex(RuntimeError, "NAVER Cloud"):
                    backup.required_config()

    def test_database_password_survives_libpq_connection_parsing(self):
        ref = "a" * 20
        host = "aws-0-ap-northeast-2.pooler.supabase.com"
        env = {key: "synthetic" for key in backup.NEEDED}
        env.update(SUPABASE_PROJECT_REF=ref, SUPABASE_REGION="ap-northeast-2",
                   SUPABASE_DB_POOLER_HOST=host, BACKUP_AGE_RECIPIENT="age1" + "q" * 58,
                   BACKUP_S3_ENDPOINT=backup.NAVER_ENDPOINT, BACKUP_S3_REGION=backup.NAVER_REGION,
                   BACKUP_S3_BUCKET="synthetic-backup", GITHUB_REPOSITORY="test/test")
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(RuntimeError, "SUPABASE_DB_PASSWORD"):
                backup.required_config()
            for password in ["synthetic", " qa:@/?#%[]'\\ +한글\t\n ", "  "]:
                with patch.dict(os.environ, {"SUPABASE_DB_PASSWORD": password}):
                    parsed = conninfo_to_dict(backup.required_config()["SUPABASE_DB_URL"])
                    self.assertEqual(parsed["password"], password)
                    self.assertEqual(parsed["host"], host)
                    self.assertEqual(parsed["user"], "postgres." + ref)
                    self.assertEqual(parsed["port"], "5432")
                    self.assertEqual(parsed["dbname"], "postgres")
                    self.assertEqual(parsed["sslmode"], "require")
            for bad_host in ["", "example.invalid", host + ".example.invalid",
                             host + ":6543", "aws-0-us-east-1.pooler.supabase.com"]:
                with patch.dict(os.environ, {"SUPABASE_DB_PASSWORD": "synthetic",
                                             "SUPABASE_DB_POOLER_HOST": bad_host}):
                    with self.assertRaisesRegex(RuntimeError, "SUPABASE_DB_POOLER_HOST"):
                        backup.required_config()

    def test_sdk_uploads_do_not_require_aws_checksum_trailers(self):
        class CapturedRequest(Exception): pass
        requests = []
        def capture(request, **kwargs):
            requests.append(request)
            raise CapturedRequest()
        client = backup.s3_client(backup.NAVER_ENDPOINT, backup.NAVER_REGION,
                                  "synthetic-access", "synthetic-secret")
        client.meta.events.register("before-send.s3", capture)
        try:
            # Capture the real SDK's signed wire requests; no network request is sent.
            with self.assertRaises(CapturedRequest):
                client.put_object(Bucket="synthetic-backup", Key="snapshot.age",
                                  Body=io.BytesIO(b"ciphertext"), ACL="private")
            with self.assertRaises(CapturedRequest):
                client.upload_part(Bucket="synthetic-backup", Key="snapshot.age",
                                   UploadId="synthetic", PartNumber=1, Body=io.BytesIO(b"ciphertext"))
            for request in requests:
                headers = {key.lower(): value for key, value in request.headers.items()}
                self.assertTrue(request.url.startswith(backup.NAVER_ENDPOINT + "/synthetic-backup/"))
                self.assertEqual(headers["content-length"], "10")
                self.assertNotIn("x-amz-trailer", headers)
                self.assertNotIn("content-encoding", headers)
                self.assertNotIn("x-amz-sdk-checksum-algorithm", headers)
                self.assertIn(b"/kr-standard/s3/aws4_request", headers["authorization"])
            self.assertEqual(len(requests), 2)
            self.assertEqual(requests[0].headers["x-amz-acl"], b"private")
        finally:
            client.close()

    def test_restore_cannot_target_production_or_another_database(self):
        with self.assertRaises(RuntimeError):restore.target_db_url(restore.PRODUCTION_PROJECT_REF,"x"*20)
        with patch.dict(os.environ,{"RESTORE_SUPABASE_DB_URL":"postgresql://postgres:synthetic@db.wrong.supabase.co/postgres"}):
            with self.assertRaises(RuntimeError):restore.target_db_url("a"*20,"b"*20)

    def test_retention_only_deletes_expired_owned_backups(self):
        removed=[]
        prefix="ojjuda-disaster-recovery/v1/daily/"
        old=prefix+"2026-01-01/backup-20260101T000000Z.tar.gz.age"
        current=prefix+"2026-09-29/backup-20260929T000000Z.tar.gz.age"
        class FakeS3:
            def get_paginator(self,*args):return self
            def paginate(self,**kwargs):return [{"Contents":[{"Key":key} for key in [old,current,"unrelated/photos.jpg",prefix+"2026-01-01/do-not-delete.txt"]]}]
            def delete_object(self,**kwargs):removed.append(kwargs["Key"])
        backup.prune_expired(FakeS3(),{"prefix":"ojjuda-disaster-recovery/v1","retention":30,"BACKUP_S3_BUCKET":"test"},dt.datetime(2026,9,29,tzinfo=dt.timezone.utc))
        self.assertEqual(removed,[old])

if __name__ == "__main__": unittest.main()
