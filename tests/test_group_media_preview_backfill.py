"""No live private photos, credentials or network are used by these tests."""
from io import BytesIO
import importlib.util
from pathlib import Path
import unittest
from uuid import UUID

from PIL import Image


spec = importlib.util.spec_from_file_location(
    'group_media_preview_backfill', Path(__file__).resolve().parents[1] / 'ops' / 'group_media_preview_backfill.py')
backfill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backfill)

AUTHOR = UUID('00000000-0000-4000-8000-000000000001')
ENTRY = UUID('20000000-0000-4000-8000-000000000001')
PHOTO = f'{AUTHOR}/10000000-0000-4000-8000-000000000001/{ENTRY}/30000000-0000-4000-8000-000000000001.jpg'


def sample_jpeg():
    output = BytesIO()
    Image.effect_noise((1800, 1100), 70).convert('RGB').save(output, 'JPEG', quality=88)
    return output.getvalue()


class Query:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows[0] if self.rows else None


class FakeDB:
    def __init__(self, rows, attachment_ok=True):
        self.rows = rows
        self.attached = []
        self.attachment_ok = attachment_ok

    def execute(self, sql, params=()):
        if sql == backfill.CANDIDATES:
            return Query(self.rows)
        if 'pg_try_advisory_lock' in sql:
            return Query([(True,)])
        if sql == backfill.ATTACH:
            self.attached.append(params)
            return Query([(self.attachment_ok,)])
        raise AssertionError('Unexpected SQL')


class Missing(Exception):
    response = {'Error': {'Code': '404'}}


class FakeStorage:
    def __init__(self, files):
        self.files = dict(files)
        self.writes = []
        self.reads = []

    def head_object(self, *, Bucket, Key):
        assert Bucket == 'group-media'
        if Key not in self.files:
            raise Missing()
        return {}

    def get_object(self, *, Bucket, Key):
        assert Bucket == 'group-media'
        self.reads.append(Key)
        return {'Body': BytesIO(self.files[Key])}

    def put_object(self, **kwargs):
        assert kwargs['Bucket'] == 'group-media'
        assert kwargs['IfNoneMatch'] == '*'
        assert kwargs['ContentType'] == 'image/webp'
        assert kwargs['Key'] not in self.files
        self.files[kwargs['Key']] = kwargs['Body']
        self.writes.append(kwargs)

    def delete_object(self, *, Bucket, Key):
        assert Bucket == 'group-media'
        self.files.pop(Key, None)


class GroupPreviewTests(unittest.TestCase):
    def test_webp_keeps_original_untouched_and_stays_under_960(self):
        jpg = sample_jpeg()
        thumb = backfill.make_preview(jpg)
        self.assertLess(len(thumb), len(jpg))
        self.assertLessEqual(len(thumb), 1048576)
        with Image.open(BytesIO(thumb)) as image:
            self.assertEqual(image.format, 'WEBP')
            self.assertLessEqual(max(image.size), 960)
        with Image.open(BytesIO(jpg)) as original:
            self.assertEqual(original.format, 'JPEG')

    def test_mislabeled_jpeg_containing_png_pixels_can_still_make_preview(self):
        buffer = BytesIO()
        Image.effect_noise((1500, 1000), 60).convert('RGB').save(buffer, 'PNG')
        preview = backfill.make_preview(buffer.getvalue())
        with Image.open(BytesIO(preview)) as image:
            self.assertEqual(image.format, 'WEBP')
            self.assertLessEqual(max(image.size), 960)

    def test_rejects_paths_outside_author_exact_uuid_or_extension(self):
        self.assertTrue(backfill.preview_path(PHOTO, AUTHOR).endswith('.thumb.webp'))
        for path, author in ((PHOTO, UUID('00000000-0000-4000-8000-000000000002')),
                             (PHOTO + '/../../secret', AUTHOR),
                             (PHOTO.replace('.jpg', '.png'), AUTHOR)):
            with self.assertRaises(ValueError):
                backfill.preview_path(path, author)

    def test_dry_run_never_downloads_or_uploads_private_images(self):
        jpg = sample_jpeg()
        database = FakeDB([(ENTRY, AUTHOR, PHOTO, len(jpg))])
        storage = FakeStorage({PHOTO: jpg})
        self.assertEqual(backfill.backfill(database, storage, apply=False),
                         {'pending': 1, 'created': 0, 'linked': 0, 'dry_run': True})
        self.assertEqual(storage.reads, [])
        self.assertEqual(storage.writes, [])

    def test_apply_uploads_only_new_sidecar_then_links_it(self):
        jpg = sample_jpeg()
        database = FakeDB([(ENTRY, AUTHOR, PHOTO, len(jpg))])
        storage = FakeStorage({PHOTO: jpg})
        self.assertEqual(backfill.backfill(database, storage, apply=True)['linked'], 1)
        self.assertEqual(storage.reads, [PHOTO])
        self.assertEqual(len(storage.writes), 1)
        self.assertEqual(storage.files[PHOTO], jpg, 'the original must never be overwritten')
        thumb = PHOTO[:-4] + '.thumb.webp'
        self.assertEqual(database.attached, [(ENTRY, PHOTO, PHOTO, thumb)])
        self.assertIn(thumb, storage.files)

    def test_existing_sidecar_is_relinked_without_overwriting(self):
        jpg = sample_jpeg()
        thumb = PHOTO[:-4] + '.thumb.webp'
        database = FakeDB([(ENTRY, AUTHOR, PHOTO, len(jpg))])
        storage = FakeStorage({PHOTO: jpg, thumb: b'already stored'})
        self.assertEqual(backfill.backfill(database, storage, apply=True)['created'], 0)
        self.assertEqual(storage.reads, [])
        self.assertEqual(storage.writes, [])
        self.assertEqual(storage.files[thumb], b'already stored')
        self.assertEqual(len(database.attached), 1)

    def test_invalid_candidates_fail_before_touching_storage(self):
        jpg = sample_jpeg()
        database = FakeDB([(ENTRY, UUID('00000000-0000-4000-8000-000000000002'), PHOTO, len(jpg))])
        storage = FakeStorage({PHOTO: jpg})
        with self.assertRaises(ValueError):
            backfill.backfill(database, storage, apply=True)
        self.assertEqual(storage.reads, [])

    def test_bytes_must_match_storage_metadata_before_upload(self):
        jpg = sample_jpeg()
        database = FakeDB([(ENTRY, AUTHOR, PHOTO, len(jpg) + 1)])
        storage = FakeStorage({PHOTO: jpg})
        result = backfill.backfill(database, storage, apply=True)
        self.assertEqual(result['skipped'], 1)
        self.assertEqual(result['reasons']['size_mismatch'], 1)
        self.assertEqual(storage.writes, [])

    def test_unreadable_jpeg_is_skipped_without_blocking_other_photos(self):
        jpg = sample_jpeg()
        other = PHOTO.replace('30000000-0000-4000-8000-000000000001.jpg', '30000000-0000-4000-8000-000000000002.jpg')
        database = FakeDB([(ENTRY, AUTHOR, PHOTO, 15), (ENTRY, AUTHOR, other, len(jpg))])
        storage = FakeStorage({PHOTO: b'not a jpeg file', other: jpg})
        result = backfill.backfill(database, storage, apply=True)
        self.assertEqual(result['skipped'], 1)
        self.assertEqual(result['linked'], 1)
        self.assertEqual(result['reasons']['unidentified'], 1)

    def test_failed_database_link_removes_only_the_new_sidecar(self):
        jpg = sample_jpeg()
        database = FakeDB([(ENTRY, AUTHOR, PHOTO, len(jpg))], attachment_ok=False)
        storage = FakeStorage({PHOTO: jpg})
        with self.assertRaises(RuntimeError):
            backfill.backfill(database, storage, apply=True)
        self.assertEqual(storage.files, {PHOTO: jpg}, 'the original image is never removed')


if __name__ == '__main__':
    unittest.main()
