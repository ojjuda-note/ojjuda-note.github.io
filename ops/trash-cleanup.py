"""Delete only tombstoned Note photos through Storage's S3 API; never edit storage metadata."""
import os
import re
import sys
from urllib.parse import quote, urlparse

PROJECT = 'ziezbdjofcugznowiuda'
REGION = 'ap-northeast-2'
BUCKETS = ('note-card-photos', 'note-event-photos')
# Tombstones are created only when the corresponding photo row is removed.
# The joins additionally protect any currently referenced photo, including archived cards.
PENDING = """
select t.bucket_id,t.photo_path
from ojjuda_note_internal.note_photo_tombstones t
join storage.objects o on o.bucket_id=t.bucket_id and o.name=t.photo_path
where t.bucket_id in ('note-card-photos','note-event-photos')
  and not exists(select 1 from ojjuda_note_internal.card_photos p where p.photo_path=t.photo_path)
  and not exists(select 1 from ojjuda_note_internal.event_ads e where e.photo_path=t.photo_path)
order by t.purged_at,t.bucket_id,t.photo_path limit 500
"""


def configuration(env):
    ref = env.get('SUPABASE_PROJECT_REF', '')
    if ref != PROJECT or env.get('SUPABASE_REGION') != REGION:
        raise ValueError('Unexpected cleanup project or region')
    url = env.get('SUPABASE_DB_URL', '').strip()
    if not url:
        host = env.get('SUPABASE_DB_POOLER_HOST', '')
        if host != 'aws-0-ap-northeast-2.pooler.supabase.com' or not env.get('SUPABASE_DB_PASSWORD'):
            raise ValueError('Missing cleanup database configuration')
        url = f"postgresql://postgres.{PROJECT}:{quote(env['SUPABASE_DB_PASSWORD'], safe='')}@{host}:5432/postgres"
    parsed = urlparse(url)
    direct = parsed.hostname == f'db.{PROJECT}.supabase.co' and parsed.username == 'postgres'
    pooler = parsed.hostname == 'aws-0-ap-northeast-2.pooler.supabase.com' and parsed.username == f'postgres.{PROJECT}'
    if parsed.scheme not in ('postgresql', 'postgres') or not parsed.password or not (direct or pooler):
        raise ValueError('Database connection does not match cleanup project')
    if not all(env.get(k, '').strip() for k in ('SUPABASE_S3_ACCESS_KEY','SUPABASE_S3_SECRET_KEY')):
        raise ValueError('Missing cleanup Storage credentials')
    return url


def valid_path(bucket, key):
    return (bucket in BUCKETS and isinstance(key, str) and len(key) <= 1024
            and bool(re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/', key))
            and not any(part in ('', '.', '..') for part in key.split('/'))
            and not any(ord(c) < 32 or c == '\\' for c in key))


def clean(conn, storage, apply=False):
    rows = conn.execute(PENDING).fetchall()
    # Fail before deleting anything if the queue contains an unexpected path.
    if any(not valid_path(bucket, key) for bucket, key in rows):
        raise ValueError('Unsafe cleanup queue entry')
    if not apply:
        return {'pending': len(rows), 'deleted': 0, 'dry_run': True}
    deleted = 0
    for bucket, key in rows:
        # Recheck immediately before the external operation. Reuse of tombstoned
        # paths is already prohibited by Note's publish and Storage policies.
        eligible = conn.execute("""select exists(
          select 1 from ojjuda_note_internal.note_photo_tombstones t
          where t.bucket_id=%s and t.photo_path=%s
          and not exists(select 1 from ojjuda_note_internal.card_photos p where p.photo_path=t.photo_path)
          and not exists(select 1 from ojjuda_note_internal.event_ads e where e.photo_path=t.photo_path)
        )""", (bucket, key)).fetchone()[0]
        if not eligible:
            continue
        storage.delete_object(Bucket=bucket, Key=key)
        # Storage updates both object metadata and bytes; a silent failure is retried.
        remaining = conn.execute('select exists(select 1 from storage.objects where bucket_id=%s and name=%s)', (bucket,key)).fetchone()[0]
        if remaining:
            raise RuntimeError('Storage deletion not confirmed')
        deleted += 1
    return {'pending': len(rows), 'deleted': deleted, 'dry_run': False}


def main():
    import boto3
    import psycopg
    from botocore.config import Config
    url = configuration(os.environ)
    storage = boto3.client('s3',endpoint_url=f'https://{PROJECT}.storage.supabase.co/storage/v1/s3',region_name=REGION,
        aws_access_key_id=os.environ['SUPABASE_S3_ACCESS_KEY'],aws_secret_access_key=os.environ['SUPABASE_S3_SECRET_KEY'],
        config=Config(signature_version='s3v4',s3={'addressing_style':'path'},request_checksum_calculation='when_required',
                      response_checksum_validation='when_required',retries={'max_attempts':3,'mode':'standard'}))
    for bucket in BUCKETS:
        storage.head_bucket(Bucket=bucket)
    with psycopg.connect(url, sslmode='require', connect_timeout=15, autocommit=True) as conn:
        if not conn.execute("select pg_try_advisory_lock(hashtext('ojjuda_trash_photo_cleanup'))").fetchone()[0]:
            print('Another cleanup is running');return
        result = clean(conn,storage,apply='--apply' in sys.argv)
        # Counts only: no filenames, member identifiers, connection URLs or secrets.
        print('Cleanup:',result)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Cleanup failed; remaining tombstones will be retried on the next run.', file=sys.stderr)
        sys.exit(1)
