# 오쭈다 월드·노트 재해 복구

현재 GitHub 저장소의 전체 이력, 운영 Supabase DB(계정 포함), Storage 사진 원본을 매일 한국 시간 03:00에 점검을 시작한 뒤 하나의 암호화 파일로 **네이버 클라우드 Object Storage 한국 리전의 비공개 버킷**에 올리도록 준비한 절차다. 2026-09-29 사용자가 백업 보관소로 네이버 클라우드를 선택했다. **이 파일을 저장소에 추가하는 것만으로 백업이 시작되지는 않는다.** 아래 비밀값을 설정하고 첫 수동 실행·격리 복구 테스트가 성공해야 운영 중이라고 표시한다.

## 매일 03:00 오류·보안 점검 (2026-09-29 적용)

- 기존 00:00 예약을 03:00 `Asia/Seoul`로 변경한다. 중복 백업 예약을 추가하지 않는다.
- 먼저 추적 중인 JavaScript/Python 문법, 기존 가입·로그인·격리 DB 회귀검사, 잠금 파일 기준 npm 의존성 취약점과 포털·월드·노트 HTTPS 응답을 검사한다.
- 연결된 일일 점검 작업은 Supabase 상태·보안 권고·최근 24시간 오류 및 cron 실패를 읽고, GitHub 검사와 마지막 외부 백업 결과를 한국어로 보고한다. 이 검사로 모든 취약점이나 실제 침해 여부가 판정되는 것은 아니다.
- 검사 실패도 기록하고 백업은 시도한다. 검사에 문제가 있다는 이유로 복구용 스냅샷을 건너뛰지 않는다.
- workflow 파일 변경 시에는 검사만 실행하고 실제 백업은 예약 또는 수동 실행에서만 수행한다.
- **2026-09-29 00:17 KST 실행은 실패했다.** 로그에서 DB 연결 URL, 운영 Storage 읽기 키, 외부 보관소 연결값과 공개 암호화 수신자가 미설정된 것을 확인했다. 이 상태는 예약 준비 상태이며, 외부 백업 운영 완료가 아니다. 비밀값 설정 뒤 첫 암호화 업로드·다운로드 해시 검증 및 별도 복원 시험이 남아 있다.

## 2026-09-29 복원 검사 보강

- 격리된 가상 사진으로 암호화 → 복호화 → 파일·사진 해시 검증을 실행했다.
- 필수 SQL·메타데이터 누락, 중복 목록, 목록에 없는 사진, 변조된 파일을 실제 업로드 전에 차단한다.
- 외부 업로드 내용 변조, 운영 DB로의 잘못된 복원, 다른 파일까지 지우는 보존기간 처리를 회귀검사한다.
- `python tests/backup-restore.test.py`와 GitHub Actions의 `Encrypted recovery regression`에서 자동 검사한다. 실제 회원 DB·사진의 외부 업로드와 새 프로젝트 DB 복원은 접속정보 설정 후 수행해야 하며, 이 가상자료 시험으로 완료 처리하지 않는다.

## 설치와 최초 확인

1. Supabase **Database > Connect**에서 `postgres` 권한의 *session pooler* 연결 URL을 확인한다. 기존 비밀번호를 사용하며 이 작업 때문에 비밀번호를 재설정하지 않는다. 비밀번호가 URL에 들어가므로 GitHub 저장소 코드나 대화에 붙여 넣지 않는다.
2. Supabase **Storage > Configuration > S3**에서 S3 프로토콜을 켜고 전용 액세스 키를 만든다. 운영 버킷 `media`, `note-event-photos`, `note-card-photos`를 모두 읽을 수 있어야 한다. 새 버킷이 생겨도 SQL 목록으로 자동 발견한다.
3. 네이버 클라우드 콘솔에서 **한국 리전 > Storage > Object Storage > Bucket Management**에 백업 전용 버킷을 만든다. 권한은 **공개 안함**, 다른 계정 권한은 비워 둔다. API 키에는 해당 버킷의 목록 조회·파일 읽기·업로드·삭제와 버킷/파일 ACL 조회가 필요하다. 다른 서비스의 데이터와 섞지 않는다. 공개 웹 호스팅·공개 파일 링크를 켜지 않는다.
   첫 운영 백업 전에 보관업체(네이버클라우드)·국가(한국)·보유기간(30일)과 탈퇴 전 백업의 처리 방식을 개인정보처리방침에 반영하고, 방침에 적힌 변경 사전 공지 절차를 마친다.
4. 관리자 PC에서 `age-keygen`으로 암호화 키쌍을 만든다. `age1...` 공개 수신자만 GitHub Secret에 넣고, `AGE-SECRET-KEY-...` 개인 키는 GitHub·운영 서버와 별개로 **오프라인 두 곳**에 보관한다. 개인 키를 잃으면 어떤 백업도 열 수 없다.
5. GitHub 저장소 **Settings > Secrets and variables > Actions**에 다음 Repository Secrets를 넣는다.

| Secret | 값 |
| --- | --- |
| `BACKUP_SUPABASE_DB_URL` | 위 Postgres session pooler 연결 URL |
| `BACKUP_SUPABASE_S3_ACCESS_KEY`, `BACKUP_SUPABASE_S3_SECRET_KEY` | 운영 Storage S3 전용 키 |
| `BACKUP_S3_BUCKET` | 네이버 클라우드 한국 리전에 만든 **비공개** 백업 버킷 이름 |
| `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY` | 네이버 클라우드 백업 전용 API 인증키의 Access Key ID / Secret Key |
| `BACKUP_AGE_RECIPIENT` | 공개 `age1...` 수신자 값 |

   엔드포인트 `https://kr.object.ncloudstorage.com`과 리전 `kr-standard`는 workflow에 고정한다. 두 값은 Secret으로 등록할 필요가 없다. 로컬 실행에는 같은 값을 환경변수 `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`으로 설정한다. 스크립트는 다른 업체·해외 리전으로의 잘못된 백업 설정을 거부한다. API 인증키는 네이버 클라우드 **My Account > 계정 및 보안 관리 > 보안 관리 > 접근 관리 > API 인증키**에서 관리한다. 키와 DB 연결 URL은 대화나 소스에 남기지 않는다.

6. `.github/workflows/nightly-backup.yml`과 `ops/` 파일을 저장소 기본 브랜치에 올린 뒤 **Actions > Daily checks and encrypted offsite backup > Run workflow**로 첫 실행한다. 성공 로그의 `Encrypted offsite backup verified`와 외부 버킷의 `ojjuda-disaster-recovery/v1/daily/YYYY-MM-DD/backup-...tar.gz.age` 파일을 함께 확인한다. 마지막으로 아래 복구 검증을 별도 프로젝트에서 해 본다.

GitHub Actions의 예약 실행은 정각에 지연되거나 드물게 누락될 수 있고 공개 저장소가 60일 동안 활동이 없으면 예약이 중지될 수 있다. 작업 실패 알림을 켜고 **최근 성공 백업이 26시간 이내인지 매일 확인**한다. 복구 목표가 더 엄격하면 GitHub Actions와 독립된 실행기·모니터링이 필요하다.

## 네이버 클라우드 연결 검증

- HTTPS, Signature V4와 path 방식으로 접속한다. AWS 전용 선택적 스트리밍 체크섬은 요청하지 않고, 업로드한 암호문을 전부 다시 읽어 자체 SHA-256과 크기를 대조한다. 작은 파일과 멀티파트의 실제 SDK 요청 형식을 가상 키로 검사한다.
- 데이터 수집 전과 업로드 직전에 버킷 ACL을 조회한다. 소유자 외 계정·전체 사용자·인증된 모든 사용자에게 권한이 있거나 ACL을 확인할 수 없으면 실패한다. 기존 버킷 권한을 임의로 바꾸지 않는다.
- 파일 업로드에 `ACL=private`를 명시하고, 완료 후 버킷과 파일 양쪽의 소유자 전용 ACL을 다시 확인한다. 비공개 확인·다운로드 해시 검증이 모두 성공해야 이전 백업의 보존기간 정리를 시작한다.
- `python tests/backup-restore.test.py`는 암호화 복원, 파일 변조, 공유된 버킷·파일 차단, 잘못된 목적지, SDK 요청, 보존기간을 가상 자료로 검사한다. 이 검사 통과는 네이버 클라우드 계정 연결이나 실제 업로드 성공을 의미하지 않는다.

## 백업 안에 있는 것

- 전체 Git mirror (`source-git-mirror.tar.gz`): 커밋과 브랜치·태그 이력 및 공개 자산. GitHub 계정 권한/저장소 설정은 별도 재설정.
- `roles.sql`, `schema.sql`, `data.sql`: Supabase CLI의 역할·스키마·데이터 덤프. 작업이 `auth.users`와 `storage.objects` 데이터를 포함하지 않으면 **실패**한다.
- `vault_secret_count.txt`: 현재는 Vault 비밀값이 0개다. 앞으로 Vault 비밀값이 생기면 암호화 루트 키를 별도로 안전하게 보관하기 전까지 이 작업은 완전한 복구 백업으로 성공하지 않도록 중단한다.
- `buckets.jsonl`, `objects.jsonl`, `storage-map.json`, `storage/blobs/`: 버킷·파일 메타데이터와 실제 바이트. 목록·개수·크기·ETag, 전후 목록 일치를 검사한다.
- `cron_jobs.jsonl`, `migration_history.jsonl`, `extensions.jsonl`, `managed_schema_triggers.jsonl`, `managed_schema_policies.jsonl`: 복구 시 검토하여 재설치할 DB 예약 작업·마이그레이션·관리 스키마 사용자 정의 항목. 민감한 명령이 포함될 수 있으므로 암호화 파일 밖에 공개하지 않는다.
- `manifest.json`: 내부 파일별 SHA-256와 크기. 업로드한 **암호문을 다시 다운로드해 전체 SHA-256을 확인**한다.

개인정보가 든 일일 암호화 백업은 **30일** 보존하고 그보다 오래된 이 절차의 백업 객체만 성공적 새 업로드 후 삭제한다. 운영자가 정책을 정한 뒤 기간을 조정할 수 있다. Supabase 프로젝트 자체가 삭제되면 Supabase 쪽 백업도 사라질 수 있으므로 외부 버킷은 별도 계정이 좋다.

## 복구 절차: 공개 전 격리 필수

1. 운영 사이트를 닫고 새 Supabase 프로젝트를 **격리 상태**로 생성한다. 원본 프로젝트에 덮어쓰지 않는다. 백업 시각 이후 쓰인 글·탈퇴·신고를 별도의 최신 기록과 대조해야 한다.
2. 외부 비공개 버킷에서 원하는 `.tar.gz.age`를 관리자 PC로 다운로드한다. 오프라인 개인 키로 `age -d -i /secure/backup-identity.txt -o backup.tar.gz backup-....tar.gz.age` 실행 후 `mkdir snapshot && tar -xzf backup.tar.gz -C snapshot`으로 푼다. **보안 PC에서만** 작업하고 풀린 SQL·회원 데이터는 공유하지 않는다.
3. 보안 PC에 Python 의존성을 `python -m pip install -r ops/backup-requirements.txt`로 설치한다. `python ops/restore-storage.py snapshot`으로 `manifest.json`의 **모든 파일** 해시·크기와 사진 원본을 먼저 검증한다. (`python ops/backup.py --check-config`는 복구 검증 명령이 아니다.)
4. 새 프로젝트의 확장, DB Webhooks, Auth 공급자·이메일(SMTP), Redirect URL, API 키, Realtime 설정을 복구 체크리스트대로 설정한다. `extensions.jsonl`과 기존 Supabase 대시보드 설정을 대조한다. API 키/JWT·OAuth 비밀은 새 프로젝트용으로 안전하게 재발급해야 할 수 있다. **Vault 또는 pgsodium 암호화 자료를 사용했다면**, SQL 덤프에 복호화용 프로젝트 루트 키가 없다. 원본 프로젝트가 살아 있을 때 안전하게 별도 보관한 키를 Supabase 공식 절차에 따라 새 프로젝트로 옮기기 전에는 해당 암호문을 복구 완료로 간주하지 않는다. 현재 운영 프로젝트의 Vault 비밀 항목은 0개로 확인했다(2026-09-28).
5. Supabase 공식 **Backup and Restore using the CLI** 가이드에 따라 새 DB의 연결 URL로 역할→스키마→데이터 순서로 복원한다. 예: `psql --single-transaction --variable ON_ERROR_STOP=1 --file snapshot/roles.sql --file snapshot/schema.sql --command 'SET session_replication_role = replica' --file snapshot/data.sql --dbname "$NEW_DB_URL"`. 버전/기본 권한 충돌이 나면 무시한 채 서비스 공개하지 말고 원인을 해결한다.
6. 새 프로젝트의 Storage S3 접근 키를 만들고 `RESTORE_SUPABASE_PROJECT_REF`, `RESTORE_SUPABASE_REGION`, `RESTORE_SUPABASE_S3_ACCESS_KEY`, `RESTORE_SUPABASE_S3_SECRET_KEY`, 새 프로젝트의 postgres session pooler URL인 `RESTORE_SUPABASE_DB_URL`을 **관리자 PC 환경변수**로 설정한다. `python ops/restore-storage.py snapshot --apply`로 실제 파일을 업로드·검증한다. 이 절차는 S3 업로드로 바뀌는 사진의 MIME·캐시 설정을 유지하고, 업로드 후 DB의 원래 파일 소유자·사용자 메타데이터를 새 프로젝트에서 복원한다. 실제 Storage 파일 버전·ETag는 새로 올라간 바이트에 맞는 값을 남긴다. **Supabase는 평소 Storage 테이블을 SQL에서 읽기 전용으로 취급하라고 권장한다. 이 소유자 재설정은 격리 복구 중에만 시행하고, 적용 실패·검증 불일치 시 서비스를 공개하지 않는다.** 스크립트는 원본 프로젝트 ref와 동일한 대상, 대상 ref와 다른 DB URL을 거부한다. 버킷 목록이 빠지면 DB 복원부터 재확인한다.
7. `cron_jobs.jsonl` 중 우리 서비스 예약 작업만 **새 프로젝트에서 SQL로 재생성**한다. 작업 명령에 이전 프로젝트 URL·토큰이 들어 있다면 새 키로 바꾼다. `managed_schema_triggers.jsonl`과 `managed_schema_policies.jsonl`의 사용자 정의 항목(특히 `auth.users` 가입·탈퇴 트리거)을 새 프로젝트와 비교하고 중복 없이 재설치한다. `migration_history.jsonl`과 실제 스키마를 맞춘다. 이 검토 과정은 현재 자동화되어 있지 않다.
8. Git mirror를 `tar -xzf snapshot/source-git-mirror.tar.gz`로 풀어 `git -C repo.git fsck --full` 검증하고, 새 저장소/Pages에 코드와 정적 사진을 복구한다. 새 Supabase URL·공개 키를 `config.js`에 연결하고 관리자 로그인을 검증한다.
9. 격리 상태에서 DB 회원·노트·월드 카드 수, 3개 Storage 버킷/파일 수와 해시, 사진 MIME·소유권, 로그인·사진 열기·관리자 기능·cron을 점검한다. **마지막 성공 백업 이후에 탈퇴한 계정/삭제한 게시물의 독립 최신 기록을 확인해 복원본에서 재삭제한 뒤** 서비스를 연다. 독립 기록이 없으면 탈퇴 데이터가 되살아날 수 있어 공개를 보류하고 조사한다.

매일 한 번의 스냅샷은 마지막 성공 백업 이후 **최대 약 24시간의 자료 손실**을 허용하며, 새 프로젝트와 도메인 재연결에는 시간이 든다. 자동 즉시 전환이나 탈퇴 사건의 실시간 독립 기록은 이 구성에 포함되어 있지 않다.

공식 문서: [네이버 클라우드 Object Storage API·한국 리전](https://api.ncloud-docs.com/docs/common-objectstorageapi-objectstorageapi), [버킷 권한 관리](https://guide.ncloud-docs.com/docs/objectstorage-use-bucket), [Object Storage ACL](https://api.ncloud-docs.com/docs/storage-objectstorage), [SDK 체크섬 설정](https://docs.aws.amazon.com/botocore/latest/reference/config.html), [Supabase 백업](https://supabase.com/docs/guides/platform/backups), [CLI 덤프·복구](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [Vault 키 이동](https://supabase.com/docs/guides/database/vault), [Storage 파일 복사](https://supabase.com/docs/guides/storage/management/download-objects), [GitHub 예약 실행](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
