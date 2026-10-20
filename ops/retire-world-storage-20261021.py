"""One-time removal of retired album and comic files, preserving profile folders."""
import json,os,time,urllib.request
import boto3
from botocore.config import Config

for attempt in range(30):
    try:
        with urllib.request.urlopen('https://ojjuda.kr/version.json?retire=20261021',timeout=10) as response:
            if json.load(response)['version']=='0.45.129-beta':
                break
    except Exception:
        pass
    time.sleep(5)
else:
    raise RuntimeError('New site version is not deployed; no files were deleted')

client=boto3.client('s3',endpoint_url='https://ziezbdjofcugznowiuda.storage.supabase.co/storage/v1/s3',
    region_name='ap-northeast-2',aws_access_key_id=os.environ['SUPABASE_S3_ACCESS_KEY'],
    aws_secret_access_key=os.environ['SUPABASE_S3_SECRET_KEY'],
    config=Config(signature_version='s3v4',s3={'addressing_style':'path'},
                  request_checksum_calculation='when_required',response_checksum_validation='when_required'))
def objects(bucket):
    return [row for page in client.get_paginator('list_objects_v2').paginate(Bucket=bucket) for row in page.get('Contents',[])]
def is_profile(key):
    parts=key.split('/')
    return len(parts)==3 and parts[1] in ('profile','profile-source')

media=objects('media');protected={row['Key']:row.get('ETag') for row in media if is_profile(row['Key'])}
assert len(protected)>=6,'Expected existing profile files are missing; stop'
assert all(len(row['Key'].split('/'))==2 or is_profile(row['Key']) for row in media),'Unrecognized media folder; stop'
plans={'media':[row for row in media if not is_profile(row['Key'])]}
buckets={row['Name'] for row in client.list_buckets()['Buckets']}
if 'creative-comics' in buckets:plans['creative-comics']=objects('creative-comics')
assert len(plans['media'])<=300 and len(plans.get('creative-comics',[]))<=200,'Unexpected deletion volume; stop'
summary={}
for bucket,rows in plans.items():
    from botocore.exceptions import ClientError
    for row in rows:
        try:
            client.delete_object(Bucket=bucket,Key=row['Key'])
        except ClientError as error:
            metadata=error.response.get('ResponseMetadata',{})
            print(json.dumps({'operation':'DeleteObject','bucket':bucket,'status':metadata.get('HTTPStatusCode'),'code':error.response.get('Error',{}).get('Code')},ensure_ascii=False))
            raise RuntimeError('Storage API did not authorize or complete deletion') from None
    remaining=objects(bucket)
    assert all(is_profile(r['Key']) for r in remaining) if bucket=='media' else not remaining
    summary[bucket]={'deleted_files':len(rows),'deleted_bytes':sum(r['Size'] for r in rows),'remaining_files':len(remaining)}
for key,etag in protected.items():
    assert client.head_object(Bucket='media',Key=key).get('ETag')==etag,'Profile file changed unexpectedly'
if 'creative-comics' in plans:client.delete_bucket(Bucket='creative-comics')
print(json.dumps({'storage_cleanup':summary,'protected_profile_files':len(protected)},ensure_ascii=False))
