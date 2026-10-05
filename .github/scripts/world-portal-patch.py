from pathlib import Path
from html import escape

def once(s,a,b):
 assert s.count(a)==1,'Source changed: '+a[:100]
 return s.replace(a,b,1)

p=Path('index.html');s=p.read_text()
for a,b in [
 ('오쭈다 | 공원과 우리집','오쭈다 월드 | 일상과 친구, 놀이가 만나는 곳'),
 ('오늘의 작은 마음은 익명카드에, 나만의 공간은 미니홈피에. 오쭈다 월드에서 함께 만나요.','나만의 우리집, 익명카드가 모이는 공원, 친구와 즐기는 게임과 생활 도구. 하나의 오쭈다 월드에서 함께 만나요.'),
 ('짧은 마음은 익명카드에, 나만의 공간은 미니홈피에. 오쭈다에서 오늘의 한 장을 남겨 보세요.','방을 꾸미고, 공원에서 이야기하고, 친구와 게임을 즐겨요. 일상이 모이는 오쭈다 월드.'),
 ('<body>','<body class="world-portal">'),
 ('aria-label="오쭈다 홈"','aria-label="오쭈다 월드 대문"'),
 ('aria-hidden="true"> 오쭈다</a>','aria-hidden="true"> 오쭈다 월드</a>'),
 ('<link rel="stylesheet" href="portal.css?v=20261004-design1">','<link rel="stylesheet" href="portal.css?v=20261004-design1">\n  <link rel="stylesheet" href="/world-portal.css?v=20261005-world1">'),
 ('portal.js?v=20261004-audit1','portal.js?v=20261005-world1'),
 ('하나의 계정으로 두 공간을 즐겨요.','우리집부터 공원과 오락실까지, 오쭈다 월드에서 함께해요.')]:
 s=once(s,a,b) if s.count(a)==1 else s.replace(a,b) if a=='오쭈다 | 공원과 우리집' else once(s,a,b)
start=s.index('  <main id="main"');end=s.index('  <footer class="site-footer">',start)
hero='''  <main id="main" class="front" aria-labelledby="front-title">
    <section id="places" class="world-welcome" aria-label="오쭈다 월드 시작">
      <div class="world-welcome-copy">
        <span class="eyebrow">OJJUDA WORLD · BETA</span>
        <h1 id="front-title">일상도, 친구도, 놀이도.<br><em>오쭈다 월드에서.</em></h1>
        <p>나만의 방을 꾸미고, 공원에서 마음을 나누고,<br>친구와 게임 한 판. 우리의 하루가 한곳에 모여요.</p>
        <div class="world-welcome-actions"><button class="pill-button" type="button" data-destination="world">오쭈다 월드 시작하기 <span aria-hidden="true">→</span></button><a class="world-welcome-help" href="/guide.html">처음이세요? 사용 안내</a></div>
        <div class="world-welcome-meta" aria-label="운영 안내"><span>베타 서비스</span><span>하나의 월드, 하나의 계정</span></div>
      </div>
      <figure class="world-welcome-visual"><span class="world-welcome-stamp">A LITTLE WORLD OF OUR OWN</span><img src="/house-test/assets/room-day-v3.webp" width="1507" height="1044" alt="나만의 공간을 꾸밀 수 있는 오쭈다 우리집" fetchpriority="high"><figcaption>내 공간을 꾸미고, 서로의 하루를 만나요.</figcaption></figure>
    </section>
    <section class="world-preview" aria-labelledby="world-features-title">
      <div class="world-section-heading"><div><h2 id="world-features-title">월드에서 만나는 하루</h2><p>모든 공간과 기능을 하나의 월드에서 이용해요.</p></div><a href="/sitemap.html">전체 메뉴와 기능 보기 →</a></div>
      <div class="world-feature-grid">
        <a class="world-feature" href="/sitemap.html#map-neighborhood"><span class="world-feature-number">01 / NEIGHBORHOOD</span><h3>동네</h3><p>카페, 공원, 도서관과 오락실에서 친구를 만나요.</p><span class="world-feature-arrow" aria-hidden="true">↗</span></a>
        <a class="world-feature" href="/sitemap.html#map-home"><span class="world-feature-number">02 / MY HOME</span><h3>우리집</h3><p>방을 꾸미고 글과 사진을 모아 나를 보여 주세요.</p><span class="world-feature-arrow" aria-hidden="true">↗</span></a>
        <a class="world-feature" href="/sitemap.html#map-board"><span class="world-feature-number">03 / COMMUNITY</span><h3>게시판</h3><p>공개된 이야기, 사진과 영상, 게임순위를 둘러봐요.</p><span class="world-feature-arrow" aria-hidden="true">↗</span></a>
        <a class="world-feature" href="/sitemap.html#map-life"><span class="world-feature-number">04 / EVERYDAY</span><h3>생활</h3><p>일정과 날씨, 뉴스와 가계부를 편하게 챙겨요.</p><span class="world-feature-arrow" aria-hidden="true">↗</span></a>
        <a class="world-feature" href="/sitemap.html#map-settings"><span class="world-feature-number">05 / MY MENU</span><h3>메뉴</h3><p>프로필과 공개 설정, 알림과 계정을 관리해요.</p><span class="world-feature-arrow" aria-hidden="true">↗</span></a>
      </div>
    </section>
    <a class="guide-entry" href="/guide.html"><span><strong>오쭈다 월드를 처음 시작하시나요?</strong><small>가입부터 방 꾸미기, 카드 쓰기와 게임까지. 기능별 사용법을 확인하세요.</small></span><span class="guide-entry-action">사용 안내 <span aria-hidden="true">→</span></span></a>
  </main>
'''
s=s[:start]+hero+s[end:];p.write_text(s)

p=Path('portal.js');s=p.read_text()
s=once(s,'한 번 가입하면 두 공간을 자유롭게 오갈 수 있어요.','한 번 가입하면 오쭈다 월드의 모든 공간을 이용할 수 있어요.')
s=once(s,'하나의 계정으로 두 공간을 즐겨요.','우리집부터 공원과 오락실까지, 오쭈다 월드에서 함께해요.')
s=once(s,'    noteButton.disabled = true;\n    const release = () => { noteButton.disabled = false; enteringNote = false; };','    if (noteButton) noteButton.disabled = true;\n    const release = () => { if (noteButton) noteButton.disabled = false; enteringNote = false; };')
s=once(s,"openAuth(button.dataset.openAuth)","openAuth(button.dataset.openAuth, 'world')")
p.write_text(s)

p=Path('guide.html');s=p.read_text()
s=s.replace('오쭈다 사용 안내 | 미니홈피 월드와 공원 익명카드','오쭈다 월드 사용 안내 | 동네·우리집·게시판·생활')
s=s.replace('aria-label="서비스 바로가기"','aria-label="월드 공간 바로가기"')
s=once(s,'<p class="story-label">미니홈피 · 오쭈다월드</p>','<p class="story-label">오쭈다 월드 · 우리집</p>')
s=s.replace('하나의 계정으로 우리집과 공원를 함께','하나의 계정으로 오쭈다 월드를 함께')
s=s.replace('아래쪽의 동네·우리집·생활·메뉴를 기준으로 찾으면 편해요.','아래쪽의 동네·우리집·게시판·생활·메뉴를 기준으로 찾으면 편해요.')
start=s.index('<details class="topic topic-detail" id="life-tools"');end=s.index('</details>',start)+len('</details>')
life='''<details class="topic topic-detail" id="life-tools" data-search-title="생활 스케줄 달력 날씨 뉴스 가계부 계산기 위젯" data-keywords="일정 반복 수입 지출 배치 숨기기"><summary><h3>생활 도구를 원하는 크기와 순서로</h3><span class="topic-more" aria-hidden="true"><b>＋</b></span></summary><div class="topic-body"><p class="route">월드 → 하단 생활</p><p>달력·날씨·뉴스·가계부·계산기를 한 화면에서 이용해요. 필요한 도구를 누르고 원하는 크기로 조절할 수 있어요.</p><ul><li><strong id="life-calendar">스케줄 달력:</strong> 날짜를 선택해 일정을 만들고 수정·삭제해요. 반복 일정과 달력의 일정 표시도 확인할 수 있어요.</li><li><strong id="life-weather">날씨:</strong> 지역을 선택하거나 위치 권한을 허용해 예보를 확인해요. 불러오지 못하면 다시 시도할 수 있어요.</li><li><strong id="life-news">뉴스:</strong> 주요 뉴스와 관심 분야를 선택하면 구글 뉴스가 새 창에서 열려요.</li><li><strong id="life-ledger">가계부:</strong> 수입·지출을 기록하고 분류별 합계와 내역을 확인해요. 가져오기와 내보내기를 이용하고, 저장 실패 안내가 나오면 다시 시도해 주세요.</li><li><strong id="life-calculator">계산기:</strong> 간단한 계산을 생활 화면 안에서 바로 해요.</li><li><strong id="life-layout">위젯 배치:</strong> 길게 눌러 위치를 옮기고 테두리로 크기를 조절해요. 필요 없는 도구는 숨길 수 있어요.</li></ul></div></details>'''
s=s[:start]+life+s[end:]
anchor='<details class="topic topic-detail" id="arcade"'
community='''<details class="topic topic-detail" id="community-board" data-search-title="게시판 전체글 베스트 익명카드 앨범 비디오 노트 게임순위" data-keywords="공감 공개글 연승 골드"><summary><h3>공개된 이야기와 게임순위를 한눈에</h3><span class="topic-more" aria-hidden="true"><b>＋</b></span></summary><div class="topic-body"><p class="route">월드 → 하단 게시판</p><p>다른 이용자의 공개된 기록을 모아 보고 게임순위를 확인하는 공용 게시판이에요. 우리집의 개인 게시판과 별도로 이용해요.</p><ul><li><strong id="community-board-feed">종류별 글:</strong> 익명카드·앨범·비디오·노트를 나누어 보고 전체글을 열 수 있어요.</li><li><strong id="community-board-best">최신과 베스트:</strong> 최신순과 공감순을 선택해 이야기를 찾아요.</li><li><strong id="community-board-detail">상세 보기와 공감:</strong> 글을 눌러 내용을 확인하고 공감할 수 있어요. 작성자가 공개 범위를 바꾸거나 삭제하면 더 이상 보이지 않을 수 있어요.</li><li><strong id="community-board-games">게임순위:</strong> 기록이 있는 게임부터 순위를 둘러보고 게임 이름을 눌러 해당 게임으로 이동해요. 점수·연승·맞고 골드는 게임별 표시 기준을 확인하세요.</li></ul></div></details>'''
s=once(s,anchor,community+anchor)
s=once(s,'© 2026 오쭈다 · 작은 일상, 두 개의 공간.','© 2026 오쭈다 월드 · 작은 일상이 모이는 곳.')
p.write_text(s)

