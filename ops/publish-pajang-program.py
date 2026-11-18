"""Stage one immutable member program; never update its live Edge manifest."""

import hashlib
import json
import os
from pathlib import Path
import re
import sys

PROJECT = 'ziezbdjofcugznowiuda'
REGION = 'ap-northeast-2'
BUCKET = 'pajang-member-assets'
PROGRAM = Path('features/pajang/assets/station.js')
MANIFEST = Path('supabase/functions/pajang-assets/index.ts')
MAX_BYTES = 1048576


class PublishError(Exception):
    """Only fixed status codes from this module may reach CI logs."""


def validate_program(body, digest):
    if not isinstance(body, bytes) or not 1 <= len(body) <= MAX_BYTES:
        raise PublishError('invalid_program_size')
    if not re.fullmatch(r'[0-9a-f]{64}', digest or ''):
        raise PublishError('invalid_manifest_digest')
    if hashlib.sha256(body).hexdigest() != digest:
        raise PublishError('program_digest_mismatch')
    return digest + '/station.js'


def read_program(root):
    root = Path(root).resolve()
    program, manifest = root / PROGRAM, root / MANIFEST
    if program.resolve() != program or manifest.resolve() != manifest:
        raise PublishError('unexpected_local_path')
    try:
        with program.open('rb') as stream:
            body = stream.read(MAX_BYTES + 1)
        source = manifest.read_text(encoding='utf-8')
    except (OSError, UnicodeError):
        raise PublishError('local_program_read_failed') from None
    entries = re.findall(r'[\"\']station\.js[\"\']\s*:', source)
    digests = re.findall(r'^\s*"station\.js"\s*:\s*"([0-9a-f]{64})"\s*,?\s*$', source, re.M)
    if len(entries) != 1 or len(digests) != 1:
        raise PublishError('invalid_program_manifest')
    validate_program(body, digests[0])
    return body, digests[0]


def error_code(error):
    return str(getattr(error, 'response', {}).get('Error', {}).get('Code', ''))


def verify_remote(storage, key, digest, size):
    try:
        response = storage.get_object(Bucket=BUCKET, Key=key)
    except Exception as error:
        if error_code(error) in ('NoSuchKey', 'NotFound', '404'):
            return False
        raise PublishError('object_read_failed') from None
    try:
        stream = response['Body']
        try:
            remote = stream.read(MAX_BYTES + 1)
        finally:
            stream.close()
        matches = (len(remote) == size == response['ContentLength']
                   and hashlib.sha256(remote).hexdigest() == digest)
    except Exception:
        raise PublishError('object_read_failed') from None
    if not matches:
        raise PublishError('existing_object_mismatch')
    return True


def publish(storage, body, digest):
    key = validate_program(body, digest)
    result = {'sha256': digest, 'bytes': len(body), 'key': key}
    if verify_remote(storage, key, digest, len(body)):
        return {**result, 'status': 'verified_existing'}
    status = 'uploaded_and_verified'
    try:
        storage.put_object(Bucket=BUCKET, Key=key, Body=body,
                           ContentLength=len(body), ContentType='application/javascript',
                           CacheControl='private, no-store', IfNoneMatch='*')
    except Exception as error:
        if error_code(error) not in ('PreconditionFailed', '412', 'ConditionalRequestConflict'):
            raise PublishError('object_upload_failed') from None
        status = 'verified_concurrent_upload'
    if not verify_remote(storage, key, digest, len(body)):
        raise PublishError('uploaded_object_not_found')
    return {**result, 'status': status}


def main():
    try:
        if (len(sys.argv) != 1
                or os.environ.get('GITHUB_REPOSITORY') != 'ojjuda-note/ojjuda-note.github.io'
                or os.environ.get('GITHUB_REF') != 'refs/heads/main'
                or os.environ.get('GITHUB_EVENT_NAME') not in ('push', 'workflow_dispatch')):
            raise PublishError('untrusted_release_context')
        body, digest = read_program(Path(__file__).resolve().parents[1])
        access = os.environ.get('SUPABASE_S3_ACCESS_KEY', '')
        secret = os.environ.get('SUPABASE_S3_SECRET_KEY', '')
        if not access.strip() or not secret.strip():
            raise PublishError('missing_storage_credentials')
        import boto3
        from botocore.config import Config
        storage = boto3.client('s3',
            endpoint_url=f'https://{PROJECT}.storage.supabase.co/storage/v1/s3',
            region_name=REGION, aws_access_key_id=access, aws_secret_access_key=secret,
            config=Config(signature_version='s3v4', s3={'addressing_style': 'path'},
                          request_checksum_calculation='when_required',
                          response_checksum_validation='when_required',
                          retries={'max_attempts': 2, 'mode': 'standard'}))
        result = publish(storage, body, digest)
    except PublishError as error:
        print(json.dumps({'status': str(error)}), file=sys.stderr)
        return 1
    except Exception:
        print(json.dumps({'status': 'publication_failed'}), file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == '__main__':
    sys.exit(main())
