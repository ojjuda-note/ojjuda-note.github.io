# 오쭈다 임시 소스 백업

외부 저장소 연결을 다음 날 진행하기로 한 동안, 공개 GitHub 저장소에 있는 소스와 정적 파일을 보존한다. **회원 DB와 회원이 올린 사진은 포함하지 않는다. 전체 서버 또는 외부 백업이 아니다.**

## 실행 순서

`.github/workflows/nightly-source-backup.yml`이 한국 시간 매일 03:00에 다음 순서로 실행된다.

1. 추적 중인 JavaScript/Python 문법, 기존 가입·로그인·격리 DB 회귀검사, 잠금 파일 기준 npm 의존성 취약점, 포털·월드·노트 HTTPS 응답 검사.
2. 검사 완료 결과를 확인한다. 문제가 있어도 복구 자료를 잃지 않도록 소스를 보존하지만, `manifest.json`의 `checks_result`에 실패 상태를 그대로 남긴다.
3. 추적된 소스·정적 이미지·Git 브랜치/태그/이력을 묶어 GitHub Actions artifact에 저장한다.
4. 저장본을 다시 내려받아 manifest 및 모든 파일의 SHA-256과 크기를 확인하고, Git bundle을 격리 경로에 복원해 무결성과 기준 커밋을 검사한다.

## 저장 범위와 보관

- 파일명: `ojjuda-source-<한국날짜시각>-KST-<커밋>`
- 임시 보관 기간: **2일**. GitHub의 같은 저장소 계정 안에 있으므로 GitHub 장애 대비용 외부 보관소 역할은 하지 않는다.
- 포함: `site-source.tar.gz`, `repository.bundle`, `manifest.json`, `README.txt`.
- 제외: 실제 회원 DB, 회원 업로드 사진 원본, 비밀키, 호스팅 설정.
- 소스 백업 성공을 전체 백업 성공으로 보고하지 않는다.
- 이 workflow는 DB나 외부 S3에 접속하지 않고 비밀값을 받지 않는다. 기존 전체 백업 workflow와 그 설정은 변경하지 않는다.

## 복구

Actions > Checked temporary source backup 실행에서 artifact를 내려받는다.

- 현재 사이트 파일: `tar -xzf site-source.tar.gz`
- Git 이력: `git clone repository.bundle restored-site`

DB와 Storage 파일은 별도로 검증된 전체 백업이 필요하다. 날짜·기준 커밋·검사 결과·제외 범위는 manifest에 기록된다.
