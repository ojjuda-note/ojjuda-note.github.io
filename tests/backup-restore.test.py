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

ROOT = Path(__file__).resolve().parents[1]

def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

backup = module("backup", "ops/backup.py")
restore = module("restore", "ops/restore-storage.py")

class RecoveryTest(unittest.TestCase):
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
            def upload_file(self,*args,**kwargs): pass
            def get_object(self,**kwargs):return {"Body":io.BytesIO(b"corrupt"),"ContentLength":7}
        with tempfile.NamedTemporaryFile() as file:
            file.write(b"encrypted-backup");file.flush()
            with self.assertRaisesRegex(RuntimeError,"upload verification failed"):
                backup.upload_and_verify(FakeS3(),{"BACKUP_S3_BUCKET":"test"},Path(file.name),"test.age")

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
