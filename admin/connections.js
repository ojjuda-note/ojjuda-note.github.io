/* Operational directory: public service identifiers only, never credentials or member records. */
(() => {
  'use strict';
  const REPO = 'https://github.com/ojjuda-note/ojjuda-note.github.io';
  const API = 'https://api.github.com/repos/ojjuda-note/ojjuda-note.github.io';
  const PROJECT = 'https://supabase.com/dashboard/project/ziezbdjofcugznowiuda';
  const VERIFIED = '2026-09-29';
  const LAST_BACKUP = '2026-09-29T08:08:33Z';
  // Verified against production config, database/storage metadata, source and
  // the backup job. Gabia and NAVER Cloud were also confirmed by the owner.
  const rows = [
    { group: '사이트·운영', name: '가비아 · 도메인', importance: 'important', tag: '중요 설정',
      address: 'ojjuda.com · ojjuda.kr', data: '도메인 소유권, 만료일·갱신, DNS 연결 설정',
      note: '도메인 관리 업체: 가비아. 만료·DNS 변경 시 접속에 영향이 있어요.', links: [['가비아 관리', 'https://my.gabia.com/']] },
    { group: '사이트·운영', name: 'GitHub Pages · 월드·노트', importance: 'important', tag: '서비스 운영',
      address: 'ojjuda.kr', data: '대문·월드·노트·관리자 화면과 공개 이미지 파일 제공',
      note: '웹 화면을 제공하는 서버예요. 회원 DB와 업로드 사진 원본은 Supabase에 있어요.',
      links: [['대문', 'https://ojjuda.kr/'], ['월드', 'https://ojjuda.kr/world.html'], ['노트', 'https://ojjuda.kr/note/'], ['Pages 설정', `${REPO}/settings/pages`]] },
    { group: '사이트·운영', name: 'GitHub Pages · 사용 안내', importance: 'normal', tag: '안내 사이트',
      address: 'ojjuda.com · ojjuda-com-redirect', data: '서비스 소개·사용법. 월드·노트 버튼은 ojjuda.kr로 연결',
      note: '별도 GitHub 저장소에서 안내 페이지를 제공해요.', links: [['안내 사이트', 'https://ojjuda.com/'], ['안내 소스', 'https://github.com/ojjuda-note/ojjuda-com-redirect']] },
    { group: '사이트·운영', name: 'GitHub · 운영 소스', importance: 'critical', tag: '핵심 자료',
      address: 'ojjuda-note/ojjuda-note.github.io', data: 'HTML·JS·CSS, 기본 사진, SQL·서버 함수 소스, 배포·복구 코드와 변경 이력',
      note: 'main 브랜치가 운영 배포 원본이에요. 공개 저장소이므로 비밀값을 넣지 않아요.', links: [['운영 소스', REPO]] },
    { group: '원본 자료·서버', name: 'Supabase · 운영 프로젝트', importance: 'critical', tag: '핵심 서버',
      address: 'ziezbdjofcugznowiuda · 서울(ap-northeast-2)', data: '월드·노트가 함께 쓰는 DB·로그인·파일 저장·서버 처리',
      note: '운영 config.js가 연결한 프로젝트예요. 프로젝트 상태 ACTIVE_HEALTHY 확인.', links: [['프로젝트 관리', PROJECT]] },
    { group: '원본 자료·서버', name: '회원·로그인 DB', importance: 'critical', tag: '핵심 · 개인정보',
      address: 'auth · ojjuda_account_internal', data: '로그인 계정, 가입 정보, 생년월일·성별·전화번호, 복구·탈퇴 보관 기록',
      note: '실제 회원 정보와 비밀번호 값은 이 표에 표시하지 않아요.', links: [['회원 인증 관리', `${PROJECT}/auth/users`], ['DB 관리', `${PROJECT}/database/tables`]] },
    { group: '원본 자료·서버', name: '월드 DB', importance: 'critical', tag: '핵심 자료',
      address: 'public · ojjuda_world_private', data: '프로필·방·친구·글·채팅·게임, 쭈 잔액·충전 기록, 신고·관리 기록과 보관 원문',
      note: '사진·영상의 목록은 DB에, 실제 파일은 Storage에 저장돼요.', links: [['월드 DB 관리', `${PROJECT}/editor`]] },
    { group: '원본 자료·서버', name: '노트 DB', importance: 'critical', tag: '핵심 · 위치정보',
      address: 'ojjuda_note · ojjuda_note_internal', data: '카드·답글·공감·태그, 위치·사진 연결, 꾸미기 구매, 알림·신고·문의·자동 글 설정',
      note: '이용자 자료와 내부 운영 자료를 나누어 보관해요.', links: [['노트 DB 관리', `${PROJECT}/editor`]] },
    { group: '원본 자료·서버', name: 'Supabase Storage · 월드 사진·영상', importance: 'critical', tag: '핵심 원본',
      address: 'media', data: '이용자가 올린 사진·영상의 실제 파일',
      note: '비공개 버킷 확인. DB 백업만으로는 사진·영상 파일이 복구되지 않아요.', links: [['파일 저장소 관리', `${PROJECT}/storage/buckets`]] },
    { group: '원본 자료·서버', name: 'Supabase Storage · 노트 사진', importance: 'critical', tag: '핵심 원본',
      address: 'note-card-photos · note-event-photos', data: '노트 카드 첨부 사진과 이벤트 사진의 실제 파일',
      note: '두 버킷 모두 비공개 확인. 원본 파일도 외부 백업에 포함해요.', links: [['파일 저장소 관리', `${PROJECT}/storage/buckets`]] },
    { group: '원본 자료·서버', name: 'Supabase · 서버 함수', importance: 'important', tag: '중요 기능',
      address: 'Edge Functions · DB 함수(RPC)', data: 'member-recovery: 비밀번호 찾기 / game-action: 게임 검증. DB 함수는 권한·쭈·카드 처리',
      note: '두 Edge Function의 ACTIVE 상태와 운영 코드 연결 확인.', links: [['서버 함수 관리', `${PROJECT}/functions`]] },
    { group: '원본 자료·서버', name: 'Supabase Realtime', importance: 'important', tag: '실시간 연결',
      address: '접속자·동네 대화·게임·알림 채널', data: '접속 상태와 게임·알림 변경을 화면에 실시간 전달',
      note: '실시간 전달 기능이에요. 영구 보관 자료는 해당 DB·Storage에서 관리해요.', links: [['프로젝트 관리', PROJECT]] },
    { group: '원본 자료·서버', name: 'Supabase Cron · 예약 작업', importance: 'important', tag: '중요 설정',
      address: '운영 DB의 예약 작업 9개 확인', data: '자동 카드 게시, 만료 안내·보관·정리, 신고·채팅·탈퇴 자료 보존기간 처리',
      note: '예약 작업을 변경하면 게시·보존기간 처리가 달라질 수 있어요.', links: [['예약 작업 확인', `${PROJECT}/integrations/cron/overview`]] },
    { group: '백업·복구', id: 'backup', name: '네이버클라우드 · 외부 백업', importance: 'critical', tag: '핵심 백업',
      address: '한국 Object Storage · ojjuda-backup-ziezbdjofcugznowiuda',
      data: '운영 소스·회원/월드/노트 DB·사진/영상 원본을 암호화해 보관',
      note: '매일 오전 3시(한국) 예약 · 30일 보관. 성공 여부는 아래 실행 결과에서 확인해요.',
      links: [['네이버클라우드 콘솔', 'https://console.ncloud.com/'], ['백업 실행 기록', `${REPO}/actions/workflows/nightly-backup.yml`]] },
    { group: '백업·복구', name: 'GitHub Actions · 배포·백업 실행', importance: 'important', tag: '중요 자동화',
      address: '.github/workflows', data: '사이트 배포, 오류 검사, 외부 암호화 백업과 임시 소스 백업 실행 기록',
      note: '백업을 실행하는 곳이에요. 전체 백업 파일의 보관 장소는 네이버클라우드예요.', links: [['작업 실행 기록', `${REPO}/actions`]] },
    { group: '백업·복구', name: 'GitHub Actions Secrets', importance: 'critical', tag: '핵심 접속정보',
      address: '저장소 Settings → Secrets and variables → Actions', data: 'DB 접속 비밀번호, 운영 사진 저장소·네이버클라우드 백업 접근키',
      note: '비밀값은 표·소스에 포함하지 않아요. 필요한 교체는 관리 화면에서 진행해요.', links: [['비밀값 관리', `${REPO}/settings/secrets/actions`]] },
    { group: '백업·복구', name: '백업 복구 개인 키', importance: 'critical', tag: '핵심 · 분실 주의',
      address: 'ojjuda-backup-recovery-key-2026-09-29.txt', data: '암호화된 외부 백업을 여는 개인 키',
      note: '별도 오프라인 보관 여부를 확인해 주세요. 잃어버리면 암호화 백업을 열 수 없어요. 키 값은 표시하지 않아요.', links: [] },
    { group: '화면·기기', name: 'jsDelivr', importance: 'normal', tag: '화면 의존성',
      address: 'cdn.jsdelivr.net', data: '브라우저용 Supabase 연결 라이브러리 제공',
      note: '회원 DB 저장소가 아니에요. 로딩 장애 시 로그인·자료 연결에 영향이 있어요.', links: [['서비스 확인', 'https://www.jsdelivr.com/']] },
    { group: '화면·기기', name: 'Google Fonts', importance: 'normal', tag: '글꼴 연결',
      address: 'fonts.googleapis.com · fonts.gstatic.com', data: '화면·카드의 웹 글꼴 파일 제공',
      note: '원본 글·사진을 보관하는 곳이 아니에요.', links: [['글꼴 서비스', 'https://fonts.google.com/']] },
    { group: '화면·기기', name: 'OpenStreetMap', importance: 'normal', tag: '지도 연결',
      address: 'tile.openstreetmap.org', data: '노트 위치 지도에 쓰는 배경 지도 이미지 제공',
      note: '카드의 저장된 위치 정보는 Supabase에 있어요.', links: [['지도 서비스', 'https://www.openstreetmap.org/']] },
    { group: '화면·기기', name: '이용자 기기 · 브라우저 저장', importance: 'important', tag: '중요 · 기기 자료',
      address: 'localStorage · 로그인 세션', data: '기기 설정·화면 상태·노트 꾸미기 선택·반려동물 대화 등 기기에 남는 자료',
      note: '기기 안에만 있는 자료는 서버의 외부 백업에 포함되지 않아요. 위치·음성 기능은 기기 권한을 사용해요.', links: [] },
    { group: '별도 보관·테스트', name: 'GitHub · 별도 비공개 소스', importance: 'important', tag: '별도 보관',
      address: 'ojjuda-note/ojjuda-source-private', data: '별도로 존재하는 비공개 소스 저장소',
      note: '현재 Pages 배포 원본이 아니며, 최신 운영본과의 동기화 여부는 확인이 필요해요.', links: [['비공개 저장소', 'https://github.com/ojjuda-note/ojjuda-source-private']] },
    { group: '별도 보관·테스트', name: 'Supabase · 별도 테스트 프로젝트', importance: 'normal', tag: '운영과 분리',
      address: 'ojjudanote · jucuqqbynilwlhqxyzrd', data: '별도 테스트 프로젝트. 로컬 시험 조건에만 참조가 있어요.',
      note: '현재 공개 사이트의 운영 DB가 아니에요. 운영 프로젝트와 혼동하지 마세요.', links: [['테스트 프로젝트', 'https://supabase.com/dashboard/project/jucuqqbynilwlhqxyzrd']] },
    { group: '별도 보관·테스트', name: '스마트 글래스 미리보기', importance: 'normal', tag: '연동 준비',
      address: 'note/glasses.html · Even G2 연동 소스', data: '카드 표시 미리보기와 기기 연동 준비 코드',
      note: '실제 Even·Rokid 기기 서비스 연결 완료로 확인된 상태는 아니에요.', links: [['미리보기', 'https://ojjuda.kr/note/glasses.html']] }
  ];
  const el = (tag, className, text) => {
    const node = document.createElement(tag); if (className) node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  };
  const formatDate = value => Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '시간 확인 필요';
  const link = (label, href) => {
    const node = el('a', 'oc-link', label); node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer'; return node;
  };

  function mount({ container, client, getAdminId, isCurrent = () => container.isConnected }) {
    let destroyed = false, run = 0, controller = null, subscription = null, backupStatus = null;
    let owner = getAdminId?.(), refreshButton = null;
    const current = () => !destroyed && isCurrent() && !!owner && getAdminId?.() === owner;
    function clear(message) { container.replaceChildren(el('p', 'oc-message', message)); }
    function setBackup(label, detail, tone = 'neutral', runId = null) {
      if (!current() || !backupStatus) return;
      backupStatus.replaceChildren(el('strong', `oc-status oc-${tone}`, label), el('p', '', detail));
      if (Number.isSafeInteger(runId) && runId > 0) backupStatus.append(link('해당 실행 보기', `${REPO}/actions/runs/${runId}`));
    }
    async function authorized() {
      if (!current()) return false;
      const auth = await client.auth.getUser();
      if (!current() || auth.error || auth.data?.user?.id !== owner) return false;
      const role = await client.from('app_admins').select('user_id').eq('user_id', owner).maybeSingle();
      return current() && !role.error && role.data?.user_id === owner;
    }
    async function json(path, signal) {
      const response = await fetch(`${API}${path}`, { credentials: 'omit', signal,
        headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!response.ok) throw new Error(`GitHub ${response.status}`);
      return response.json();
    }
    async function refresh() {
      const version = ++run;
      controller?.abort(); controller = new AbortController();
      const activeController = controller;
      if (refreshButton) refreshButton.disabled = true;
      try {
        if (!await authorized()) {
          if (!destroyed && isCurrent() && version === run) clear('관리자 권한을 확인할 수 없어요. 다시 로그인해 주세요.');
          return;
        }
        if (version !== run || !current()) return;
        setBackup('실행 결과 확인 중', '네이버클라우드 백업 작업의 실제 실행 결과를 확인하고 있어요.');
        const timeout = setTimeout(() => activeController.abort(), 10000);
        try {
          const result = await json('/actions/workflows/nightly-backup.yml/runs?branch=main&per_page=30', activeController.signal);
          // Push runs perform checks only; never mistake those for a backup.
          const latest = result.workflow_runs?.find(item => ['schedule', 'workflow_dispatch'].includes(item.event));
          if (!latest || !Number.isSafeInteger(latest.id)) throw new Error('No backup run');
          const jobs = await json(`/actions/runs/${latest.id}/jobs?per_page=100`, activeController.signal);
          if (version !== run || !current()) return;
          const job = jobs.jobs?.find(item => item.name === 'backup');
          const verified = job?.steps?.find(step => step.name === 'Back up, encrypt, upload and verify');
          if (job?.conclusion === 'success' && verified?.conclusion === 'success') {
            const at = job.completed_at;
            const age = Date.now() - Date.parse(at);
            if (!Number.isFinite(age)) throw new Error('Missing completion time');
            setBackup(age > 26 * 3600000 ? '확인 필요 · 백업 26시간 경과' : '백업 성공 확인',
              `${formatDate(at)} (한국) · 암호화·업로드·검증 단계 성공. 별도 프로젝트 복원 시험 완료를 뜻하지는 않아요.`, age > 26 * 3600000 ? 'warn' : 'good', latest.id);
          } else if (latest.status !== 'completed' || (job && job.status !== 'completed')) {
            setBackup('백업 대기·진행 중', '이번 실행이 완료된 뒤 결과를 다시 확인해 주세요.', 'neutral', latest.id);
          } else {
            setBackup('확인 필요 · 백업 미완료', job?.conclusion === 'skipped' ? '해당 실행에서 백업 작업이 건너뛰어졌어요.' : '최근 백업 작업이 성공으로 확인되지 않았어요. 실행 기록을 확인해 주세요.', 'warn', latest.id);
          }
        } finally { clearTimeout(timeout); }
      } catch {
        if (version === run && current()) setBackup('현재 결과 조회 불가',
          `GitHub 연결·조회 제한을 확인해 주세요. 기록상 마지막 확인: ${formatDate(LAST_BACKUP)} (한국), 백업 성공. 현재 상태는 실행 기록에서 확인해 주세요.`, 'warn', 36540552039);
      } finally {
        if (version === run && current() && refreshButton) refreshButton.disabled = false;
      }
    }
    function render() {
      const section = el('section', 'oc-directory'); section.setAttribute('aria-labelledby', 'oc-title');
      const heading = el('h3', '', '운영 연결'); heading.id = 'oc-title';
      section.append(heading, el('p', 'oc-intro', '오쭈다의 연결 위치와 중요한 자료를 한눈에 확인해요.'));
      const summary = el('div', 'oc-summary');
      for (const [label, value] of [['도메인', '가비아'], ['운영 DB·원본 사진', 'Supabase'], ['외부 백업', '네이버클라우드']]) {
        const card = el('div'); card.append(el('span', '', label), el('strong', '', value)); summary.append(card);
      }
      section.append(summary, el('p', 'oc-meta', `구성 확인일 ${VERIFIED} · 중요 표시는 복구·개인정보·운영에 필요한 항목이에요. 비밀값과 실제 회원 자료는 표시하지 않아요.`));
      const scroll = el('div', 'oc-table-wrap'); scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', '운영 연결 표, 좌우로 스크롤할 수 있어요');
      const table = el('table', 'oc-table');
      table.append(el('caption', '', '연결된 서비스와 보관 자료 · 작은 화면에서는 표를 좌우로 밀어 보세요.'));
      const head = el('thead'), tr = el('tr');
      for (const title of ['중요도', '연결된 곳', '역할·저장 자료', '확인 사항·관리']) { const th = el('th', '', title); th.scope = 'col'; tr.append(th); }
      head.append(tr); table.append(head);
      let previousGroup = '';
      for (const row of rows) {
        if (row.group !== previousGroup) {
          const group = el('tbody', 'oc-group'); const line = el('tr'); const th = el('th', '', row.group);
          th.colSpan = 4; th.scope = 'rowgroup'; line.append(th); group.append(line); table.append(group); previousGroup = row.group;
        }
        const line = el('tr', `oc-row oc-priority-${row.importance}`);
        const priority = el('td'); priority.append(el('span', `oc-badge oc-${row.importance}`, row.tag));
        const name = el('th'); name.scope = 'row'; name.append(el('strong', '', row.name), el('small', 'oc-address', row.address));
        const data = el('td', '', row.data), note = el('td'); note.append(el('p', '', row.note));
        if (row.id === 'backup') { backupStatus = el('div', 'oc-backup-status'); backupStatus.setAttribute('aria-live', 'polite'); note.append(backupStatus); }
        const links = el('div', 'oc-links'); for (const [label, href] of row.links) links.append(link(label, href)); note.append(links);
        line.append(priority, name, data, note); table.lastElementChild.append(line);
      }
      scroll.append(table); section.append(scroll);
      const footer = el('div', 'oc-footer'); refreshButton = el('button', 'btn', '백업 실행 결과 새로고침'); refreshButton.type = 'button';
      refreshButton.addEventListener('click', refresh); footer.append(refreshButton, el('span', '', '도메인·보관소 설정은 각 관리 화면에서 확인할 수 있어요.'));
      section.append(footer); container.replaceChildren(section);
    }
    clear('관리자 권한을 확인하고 있어요.');
    if (owner && client?.auth && typeof client.from === 'function') {
      subscription = client.auth.onAuthStateChange?.((_event, session) => {
        if (session?.user?.id !== owner) { run++; controller?.abort(); owner = null; clear('관리자 계정으로 다시 열어 주세요.'); }
      })?.data?.subscription;
      authorized().then(ok => {
        if (!current()) return;
        if (!ok) { clear('관리자 계정만 운영 연결 표를 볼 수 있어요.'); return; }
        render(); void refresh();
      }).catch(() => { if (current()) clear('관리자 권한을 확인하지 못했어요. 새로고침해 주세요.'); });
    } else clear('관리자 계정만 운영 연결 표를 볼 수 있어요.');
    return { refresh, destroy() { destroyed = true; run++; controller?.abort(); subscription?.unsubscribe?.(); container.replaceChildren(); } };
  }
  window.OjjudaConnections = Object.freeze({ mount });
})();
