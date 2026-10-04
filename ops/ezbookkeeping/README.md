# 오쭈다 가계부 도입 준비

상태: **원본 소스 확보 및 설치 설정 준비. 서버 배포와 로그인 연동은 미완료.**

## 가져온 프로그램

- 원본: https://github.com/mayswind/ezbookkeeping
- 정식 태그: `v2.0.1`
- 고정 커밋: `323cf0c683d7889ad0c28377039ced1a44167c1e`
- `upstream/`은 이 커밋으로 고정한 Git submodule이다. 원본의 MIT LICENSE와 한국어 번역을 포함한다.
- 원본 수정 없음. `git submodule update --init ops/ezbookkeeping/upstream`으로 동일 소스를 복원한다.
- 현재 생활 가계부의 기기 내 저장 자료는 변경하지 않았다.

## 실행 환경

Go 서버와 지속 저장 공간이 필요하므로 GitHub Pages에서는 실행할 수 없다.
Docker 호스팅(Render 등) 또는 Docker를 실행할 수 있는 별도 서버가 필요하다.
이 준비 작업에서는 서버를 개설하거나 유료 자원을 생성하지 않았다.

일반 Docker 서버에서 사용할 설정은 `compose.yaml`에 있다. Docker Compose v2를 사용한다.

```sh
git submodule update --init ops/ezbookkeeping/upstream
cd ops/ezbookkeeping
cp .env.example .env
# .env에 실제 HTTPS 주소, 고정 암호화 키, OAuth 클라이언트 정보를 입력한다.
docker compose config --quiet
docker compose build
# 아래 로그인 보완/검증이 끝난 뒤에만 공개 서비스로 시작한다.
docker compose up -d
```

앱 포트는 로컬 루프백에만 연결한다. HTTPS reverse proxy가 필요하다.
Render에서 실행할 때에는 Dockerfile 경로를 `ops/ezbookkeeping/upstream/Dockerfile`,
빌드 컨텍스트를 `ops/ezbookkeeping/upstream`으로 지정하고 같은 환경변수를 사용한다.
소스의 submodule 체크아웃 지원과 UID 1000 쓰기 권한을 먼저 확인해야 한다.
SQLite와 업로드를 모두 보존할 영구 디스크를 연결한다. 임시 디스크로 운영하지 않는다.

## 오쭈다 로그인 연결 전 남은 작업

1. 기존 Supabase 프로젝트 `ziezbdjofcugznowiuda`의 OAuth Server 설정을 확인한다.
   OIDC discovery 응답은 확인했지만 OAuth 활성화 상태, 클라이언트 등록과 서명키는 미확인이다.
   ID token에는 비대칭 서명키가 필요하다. 기존 로그인 영향을 검토한 후 설정한다.
2. 서버의 실제 HTTPS 주소가 정해지면 confidential OAuth client를 등록한다.
   정확한 callback은 `{LEDGER_URL}/oauth2/callback`이다. PKCE를 사용한다.
3. 기존 오쭈다 로그인 세션을 사용하는 동의 화면을 만들고 Supabase Authorization Path에 등록한다.
   회원 이메일과 프로필 접근 범위를 표시하고 로그인 후 원래 요청으로 돌아오게 한다.
4. **회원 식별 보완이 필요하다.** 원본은 `preferred_username` 또는 `username`을 요구하며
   자동 가입 시 이메일도 요구한다 (`pkg/auth/oauth2/provider/oidc/oidc_provider.go`,
   `pkg/api/oauth2_authentications.go`). Supabase 계정마다 이 username이 있다고 가정하면 안 된다.
   검증된 ID token의 `sub`를 기준으로 변경 불가능한 내부 식별자를 만들고,
   사용자 변경 가능한 닉네임이나 이메일을 계정 연결 키로 사용하지 않도록 보완한다.
   사용자 이름 길이 제한도 확인한다. `userinfo.sub`와 ID token subject 일치도 검증한다.
5. 별도 가계부 가입을 차단하면서 OAuth 첫 가입만 허용하도록 원본을 보완한다.
   원본 `UserRegisterHandler`는 `EnableUserRegister`만 검사하므로 내부 로그인 비활성화만으로
   일반 가입 API가 닫힌다고 가정하면 안 된다. **현재 설정은 두 가입 경로 모두 비활성화**했다.
6. 신규 계정 기본 언어/통화를 한국어/원화로 지정한다. 원본 OAuth 가입 기본 통화는 USD다.
7. 두 테스트 계정으로 최초 로그인, 재로그인, 이메일/닉네임 변경, 서로의 거래·첨부파일 접근 차단,
   로그아웃, 회원 탈퇴 후 가계부 세션 처리, 서버 재시작 후 자료 보존을 검증한다.
8. 검증 후에만 `생활 → 가계부`를 새 서버로 연결한다.
   기존 기기 저장 자료는 별도 가져오기 기능을 만들어 옮기며 자동 삭제하지 않는다.

## 보존과 백업

`ledger-data`와 `ledger-storage`를 함께 보존해야 한다. `.env`의 암호화 키도 안전하게 보관한다.
`docker compose down -v`는 실제 자료를 삭제하므로 사용하지 않는다.
운영 전 SQLite 일관성을 보장하는 백업과 실제 복원 검증을 기존 백업 절차에 추가한다.
새 가계부 자료는 기존 GitHub 소스 백업이나 Supabase 백업에 자동 포함되지 않는다.

## 확인한 범위

- upstream 태그/커밋, MIT 라이선스, 한국어 번역 파일, OIDC/PKCE 설정 이름 확인.
- 기존 Supabase OIDC discovery의 issuer와 endpoint 응답 확인.
- 설치 설정 YAML 및 원본 설정 키 대조.
- 이 작업 환경에는 Docker/Go가 없어 이미지 빌드와 실제 로그인은 실행하지 못했다.
- 서버 연결과 회원 식별 보완이 끝나기 전까지 운영 적용 완료로 취급하지 않는다.

공식 문서:
- https://ezbookkeeping.mayswind.net/configuration/
- https://supabase.com/docs/guides/auth/oauth-server/getting-started
- https://render.com/docs/disks
