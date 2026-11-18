"""Verify immutable publication without credentials or live Storage requests."""

import hashlib
import importlib.util
from io import BytesIO
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('pajang_program',
    Path(__file__).resolve().parents[1] / 'ops/publish-pajang-program.py')
program = importlib.util.module_from_spec(spec)
spec.loader.exec_module(program)
BODY = b'export const station = "ready";\n'
DIGEST = hashlib.sha256(BODY).hexdigest()


class StorageError(Exception):
    def __init__(self, code):
        self.response = {'Error': {'Code': code, 'Message': 'private server response'}}


class Storage:
    def __init__(self, existing=None, read_error=None, race=None, corrupt_upload=False):
        self.existing = existing
        self.read_error = read_error
        self.race = race
        self.corrupt_upload = corrupt_upload
        self.calls = []
        self.streams = []

    def get_object(self, **kwargs):
        self.calls.append(('get', kwargs))
        if self.read_error:
            raise StorageError(self.read_error)
        if self.existing is None:
            raise StorageError('NoSuchKey')
        stream = BytesIO(self.existing)
        self.streams.append(stream)
        return {'Body': stream, 'ContentLength': len(self.existing)}

    def put_object(self, **kwargs):
        self.calls.append(('put', kwargs))
        if self.race is not None:
            self.existing = self.race
            raise StorageError('PreconditionFailed')
        self.existing = b'corrupt' if self.corrupt_upload else kwargs['Body']


class PublishTests(unittest.TestCase):
    def test_uploads_only_fixed_key_and_reads_back_all_bytes(self):
        storage = Storage()
        result = program.publish(storage, BODY, DIGEST)
        self.assertEqual(result, {'sha256': DIGEST, 'bytes': len(BODY),
            'key': DIGEST + '/station.js', 'status': 'uploaded_and_verified'})
        self.assertEqual([call[0] for call in storage.calls], ['get', 'put', 'get'])
        for _, args in storage.calls:
            self.assertEqual(args['Bucket'], 'pajang-member-assets')
            self.assertEqual(args['Key'], DIGEST + '/station.js')
        args = storage.calls[1][1]
        self.assertEqual(args['IfNoneMatch'], '*')
        self.assertEqual(args['Body'], BODY)
        self.assertEqual(args['ContentLength'], len(BODY))
        self.assertEqual(args['ContentType'], 'application/javascript')
        self.assertTrue(all(stream.closed for stream in storage.streams))

    def test_matching_existing_file_is_verified_without_upload(self):
        storage = Storage(existing=BODY)
        self.assertEqual(program.publish(storage, BODY, DIGEST)['status'], 'verified_existing')
        self.assertEqual([c[0] for c in storage.calls], ['get'])

    def test_digest_mismatch_never_contacts_storage(self):
        storage = Storage()
        with self.assertRaisesRegex(program.PublishError, '^program_digest_mismatch$'):
            program.publish(storage, BODY, '0' * 64)
        self.assertEqual(storage.calls, [])

    def test_different_existing_file_is_never_overwritten(self):
        storage = Storage(existing=b'previously stored content')
        with self.assertRaisesRegex(program.PublishError, '^existing_object_mismatch$'):
            program.publish(storage, BODY, DIGEST)
        self.assertEqual([c[0] for c in storage.calls], ['get'])

    def test_read_permission_failure_never_attempts_upload(self):
        storage = Storage(read_error='AccessDenied')
        with self.assertRaisesRegex(program.PublishError, '^object_read_failed$'):
            program.publish(storage, BODY, DIGEST)
        self.assertEqual([c[0] for c in storage.calls], ['get'])

    def test_concurrent_matching_upload_is_read_back_without_retry(self):
        storage = Storage(race=BODY)
        self.assertEqual(program.publish(storage, BODY, DIGEST)['status'], 'verified_concurrent_upload')
        self.assertEqual([c[0] for c in storage.calls], ['get', 'put', 'get'])

    def test_concurrent_different_upload_fails_without_retry(self):
        storage = Storage(race=b'other content')
        with self.assertRaisesRegex(program.PublishError, '^existing_object_mismatch$'):
            program.publish(storage, BODY, DIGEST)
        self.assertEqual([c[0] for c in storage.calls], ['get', 'put', 'get'])

    def test_upload_is_not_success_until_download_digest_matches(self):
        storage = Storage(corrupt_upload=True)
        with self.assertRaisesRegex(program.PublishError, '^existing_object_mismatch$'):
            program.publish(storage, BODY, DIGEST)

    def test_size_bounds_are_checked_before_storage(self):
        for body in (b'', b'x' * (program.MAX_BYTES + 1)):
            with self.subTest(size=len(body)):
                storage = Storage()
                with self.assertRaisesRegex(program.PublishError, '^invalid_program_size$'):
                    program.publish(storage, body, hashlib.sha256(body).hexdigest())
                self.assertEqual(storage.calls, [])

    def test_fixed_local_program_must_match_one_manifest_entry(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary, manifest = root / program.PROGRAM, root / program.MANIFEST
            binary.parent.mkdir(parents=True)
            manifest.parent.mkdir(parents=True)
            binary.write_bytes(BODY)
            entry = '  "station.js": "' + DIGEST + '",\n'
            manifest.write_text('const files = {\n' + entry + '};\n', encoding='utf-8')
            self.assertEqual(program.read_program(root), (BODY, DIGEST))
            for entries in (entry + entry, entry + '"station.js": "invalid",\n', ''):
                manifest.write_text('const files = {\n' + entries + '};\n', encoding='utf-8')
                with self.assertRaisesRegex(program.PublishError, '^invalid_program_manifest$'):
                    program.read_program(root)
            manifest.write_text('const files = {\n' + entry + '};\n', encoding='utf-8')
            binary.write_bytes(b'changed after manifest')
            with self.assertRaisesRegex(program.PublishError, '^program_digest_mismatch$'):
                program.read_program(root)


if __name__ == '__main__':
    unittest.main()
