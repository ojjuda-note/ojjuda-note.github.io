"""One-time, in-memory preview backfill for private group JPEGs.

Only run with the existing server-side GitHub Actions Storage/DB credentials.
No photo bytes, paths, member IDs or credentials are written to disk or logs.
"""

from io import BytesIO
import os
import re
import sys
from urllib.parse import quote, urlparse

from PIL import Image, ImageOps, UnidentifiedImageError, features


PROJECT = 'ziezbdjofcugznowiuda'
REGION = 'ap-northeast-2'
BUCKET = 'group-media'
MAX_PHOTOS = 25
MAX_ORIGINAL_BYTES = 52_428_800
MAX_PREVIEW_BYTES = 1_048_576
PATH = re.compile(
    r'^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/'
    r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    r'[0-9a-f-]{36}[.]jpg$'
)

# Each row has already been published by its author; no orphan or foreign images.
CANDIDATES = """
select e.id,e.author_id,f.value->>'path', (o.metadata->>'size')::bigint
from ojjuda_groups_internal.entries e
cross join lateral jsonb_array_elements(e.media) f(value)
join storage.objects o on o.bucket_id='group-media' and o.name=f.value->>'path'
where f.value->>'mime'='image/jpeg' and f.value->>'preview_path' is null
  and o.owner_id=e.author_id::text and (o.owner is null or o.owner=e.author_id)
  and o.metadata->>'mimetype'='image/jpeg'
  and coalesce((o.metadata->>'size')::bigint,0) between 1 and 52428800
order by e.id,f.value->>'path'
limit 26
"""

# A BEFORE UPDATE OF media trigger validates and links an existing WebP sidecar.
ATTACH = """
update ojjuda_groups_internal.entries e set media=e.media
where e.id=%s and exists(
  select 1 from jsonb_array_elements(e.media) f
  where f->>'path'=%s and f->>'preview_path' is null
)
returning exists(
  select 1 from jsonb_array_elements(e.media) f
  where f->>'path'=%s and f->>'preview_path'=%s
)
"""


def configuration(env):
    if env.get('SUPABASE_PROJECT_REF') != PROJECT or env.get('SUPABASE_REGION') != REGION:
        raise ValueError('Unexpected project or region')
    url = env.get('SUPABASE_DB_URL', '').strip()
    if not url:
        host = env.get('SUPABASE_DB_POOLER_HOST', '')
        if host != 'aws-0-ap-northeast-2.pooler.supabase.com' or not env.get('SUPABASE_DB_PASSWORD'):
            raise ValueError('Missing database configuration')
        url = f"postgresql://postgres.{PROJECT}:{quote(env['SUPABASE_DB_PASSWORD'],safe='')}@{host}:5432/postgres"
    parsed = urlparse(url)
    direct = parsed.hostname == f'db.{PROJECT}.supabase.co' and parsed.username == 'postgres'
    pooler = (parsed.hostname == 'aws-0-ap-northeast-2.pooler.supabase.com'
              and parsed.username == f'postgres.{PROJECT}')
    if parsed.scheme not in ('postgresql', 'postgres') or not parsed.password or not (direct or pooler):
        raise ValueError('Database connection does not match the project')
    if not env.get('SUPABASE_S3_ACCESS_KEY') or not env.get('SUPABASE_S3_SECRET_KEY'):
        raise ValueError('Missing private Storage credentials')
    if not features.check('webp'):
        raise ValueError('WebP encoder not available')
    return url


def preview_path(original, author):
    match = PATH.fullmatch(original or '')
    if not match or match.group(1) != str(author):
        raise ValueError('Unexpected private JPEG path')
    return original[:-4] + '.thumb.webp'


def make_preview(raw):
    if not 1 <= len(raw) <= MAX_ORIGINAL_BYTES:
        raise ValueError('Original size outside private bucket limits')
    # Decoding huge or malformed images can exhaust the runner; fail safely.
    Image.MAX_IMAGE_PIXELS = 100_000_000
    with Image.open(BytesIO(raw)) as source:
        if source.format != 'JPEG':
            raise ValueError('An original is not a JPEG')
        # JPEG draft shrinks the decode before allocating full-resolution pixels.
        # Large phone and panorama photos often exceed 35 million source pixels.
        if source.width * source.height > 150_000_000:
            raise ValueError('Original pixel count exceeds the safe header limit')
        source.draft('RGB', (960, 960))
        if source.width * source.height > 35_000_000:
            raise ValueError('Decoded image would exceed the safe pixel limit')
        image = ImageOps.exif_transpose(source).convert('RGB')
    try:
        for bound, quality in ((960, 76), (960, 60), (768, 60), (640, 50), (480, 45)):
            reduced = image.copy()
            try:
                reduced.thumbnail((bound, bound), Image.Resampling.LANCZOS)
                output = BytesIO()
                reduced.save(output, 'WEBP', quality=quality, method=4)
                data = output.getvalue()
                if 0 < len(data) <= MAX_PREVIEW_BYTES and len(data) < len(raw):
                    return data
            finally:
                reduced.close()
    finally:
        image.close()
    raise ValueError('Cannot create a small enough WebP preview')


def exists(storage, key):
    try:
        storage.head_object(Bucket=BUCKET, Key=key)
        return True
    except Exception as exc:
        code = str(getattr(exc, 'response', {}).get('Error', {}).get('Code', ''))
        if code in ('404', 'NoSuchKey', 'NotFound'):
            return False
        raise


def backfill(conn, storage, apply=False):
    rows = conn.execute(CANDIDATES).fetchall()
    if len(rows) > MAX_PHOTOS:
        raise ValueError('More legacy images than the approved backfill limit')
    # Fail before any external operation if even one path is unexpected.
    for _entry, author, original, size in rows:
        preview_path(original, author)
        if not 1 <= size <= MAX_ORIGINAL_BYTES:
            raise ValueError('Unexpected original size')
    if not apply:
        return {'pending': len(rows), 'created': 0, 'linked': 0, 'dry_run': True}
    if not conn.execute("select pg_try_advisory_lock(hashtext('ojjuda_group_preview_backfill'))").fetchone()[0]:
        raise RuntimeError('A backfill is already running')
    created = linked = skipped = 0
    reasons = {'size_mismatch': 0, 'image_unsupported': 0}
    for entry, author, original, size in rows:
        thumb = preview_path(original, author)
        made = False
        if not exists(storage, thumb):
            response = storage.get_object(Bucket=BUCKET, Key=original)
            body = response['Body']
            try:
                raw = body.read(MAX_ORIGINAL_BYTES + 1)
            finally:
                body.close()
            if len(raw) != size:
                skipped += 1
                reasons['size_mismatch'] += 1
                continue
            try:
                preview = make_preview(raw)
            except (ValueError, UnidentifiedImageError, OSError, Image.DecompressionBombError):
                skipped += 1
                reasons['image_unsupported'] += 1
                continue
            # This never modifies originals. A race with another upload fails closed.
            storage.put_object(Bucket=BUCKET, Key=thumb, Body=preview,
                               ContentType='image/webp', CacheControl='0', IfNoneMatch='*')
            made = True
            created += 1
        try:
            result = conn.execute(ATTACH, (entry, original, original, thumb)).fetchone()
            if not result or not result[0]:
                raise RuntimeError('Preview association was not confirmed')
        except Exception:
            if made:
                storage.delete_object(Bucket=BUCKET, Key=thumb)
            raise
        linked += 1
    return {'pending': len(rows), 'created': created, 'linked': linked,
            'skipped': skipped, 'reasons': reasons, 'dry_run': False}


def main():
    import boto3
    import psycopg
    from botocore.config import Config

    url = configuration(os.environ)
    storage = boto3.client('s3', endpoint_url=f'https://{PROJECT}.storage.supabase.co/storage/v1/s3',
        region_name=REGION, aws_access_key_id=os.environ['SUPABASE_S3_ACCESS_KEY'],
        aws_secret_access_key=os.environ['SUPABASE_S3_SECRET_KEY'],
        config=Config(signature_version='s3v4', s3={'addressing_style':'path'},
                      request_checksum_calculation='when_required',
                      response_checksum_validation='when_required', retries={'max_attempts':3,'mode':'standard'}))
    storage.head_bucket(Bucket=BUCKET)
    with psycopg.connect(url, sslmode='require', connect_timeout=15, autocommit=True) as conn:
        if conn.execute("select public from storage.buckets where id='group-media'").fetchone() != (False,):
            raise ValueError('Private bucket check failed')
        result = backfill(conn, storage, apply='--apply' in sys.argv)
        # No member identifiers, object names, URLs, image bytes or keys in logs.
        print('Group preview backfill:', result)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Group preview backfill stopped:', type(error).__name__, file=sys.stderr)
        sys.exit(1)
