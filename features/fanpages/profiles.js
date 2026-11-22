/* Fan-made artist fact cards. Cite the original source for dated achievements.
   Schools are past education/attendance, not a claim of current enrollment.
   Leave uncertain biographical details unfilled until a reliable source is found. */
const a2oMember = (name, source) => ({ name, birthday: null, height: null, hometown: '', school: '', note: 'A2O', source });
window.OJJUDA_FAN_PROFILES = {
  rescene: {
    checkedAt: '2026.11.17',
    debut: '2024.03.26', debutWork: 'Re:Scene · UhUh',
    agency: 'THE MUZE Entertainment',
    concept: '향기로 다시 떠오르는 장면, RESCENE.',
    heightSource: 'https://kpopdiscover.com/en/groups/rescene/',
    awards: [
      { year: '2026.11', title: 'SBS 인기가요 1위', detail: 'With · 2026.11.15 · 7,361점 · 음악방송 4관왕', href: 'https://www.soompi.com/article/1887262wpp/watch-rescene-snags-4th-win-for-with-on-inkigayo-performances-by-bestie-ateez-nct-dream-and-more' },
      { year: '2026.11', title: 'MMA2026 3관왕', detail: '글로벌 TOP10 · 카카오뱅크 모두의 스타 · 핫트렌드 (11.14)', href: 'https://www.xportsnews.com/article/2219598' },
      { year: '2026.11', title: 'MBC 쇼! 음악중심 1위', detail: 'With · 2026.11.14 · 8,473점', href: 'https://www.soompi.com/article/1886997wpp/watch-rescene-takes-3rd-win-for-with-on-music-core-performances-by-bestie-ateez-nct-dream-and-more' },
      { year: '2026.11', title: 'SBS M 더쇼 1위', detail: 'With · 2026.11.10', href: 'https://www.soompi.com/article/1885603wpp/watch-rescene-takes-1st-win-for-with-on-the-show' },
      { year: '2026.11', title: 'MBC M 쇼챔피언 1위', detail: 'With · 2026.11.11', href: 'https://www.xportsnews.com/article/2218400' },
      { year: '2026.07', title: 'SBS 인기가요 1위', detail: 'LOVE ATTACK', href: 'https://news.sbs.co.kr/english/endPagePrintPopup.do?news_id=N1008676108' },
      { year: '2026.07', title: 'MBC 쇼! 음악중심 1위', detail: 'Pretty Girl', href: 'https://news.sbs.co.kr/english/endPagePrintPopup.do?news_id=N1008676108' }
    ],
    records: [
      { year: '2026.07', title: '멜론 TOP100 1위', detail: 'LOVE ATTACK 역주행', href: 'https://news.sbs.co.kr/amp/news.amp?news_id=N1008649027' },
      { year: '2026', title: '멤버 고향 홍보대사', detail: '거제·수원·고양·경주', href: 'https://www.nocutnews.co.kr/news/6542161' }
    ],
    members: [
      { name: '원이', birthday: '2004.05.25', height: '162', heightSource: 'https://kprofiles.com/woni-rescene-profile/', hometown: '경남 거제', school: '거제제일고 · 졸업', note: '리더', source: 'https://v.daum.net/v/20251221101501214' },
      { name: '리브', birthday: '2006.10.11', height: '164', hometown: '경기 수원', school: '', note: '수원 홍보대사', source: 'https://www.nocutnews.co.kr/news/6542161' },
      { name: '미나미', birthday: '2006.11.29', height: '163', hometown: '일본', school: '', note: '방과후 설렘 출연', source: 'https://www.hankookilbo.com/news/article/A2024022108070000355' },
      { name: '메이', birthday: '2008.08.19', height: null, hometown: '경기 고양', school: '', note: '고양 홍보대사', source: 'https://www.nocutnews.co.kr/news/6542161' },
      { name: '제나', birthday: '2008.11.27', height: '164', hometown: '경북 경주', school: '', note: '청춘스타 출연', source: 'https://www.hankookilbo.com/news/article/A2024022108070000355' }
    ],
    sources: [
      { label: '데뷔·멤버', href: 'https://www.melon.com/artist/timeline.htm?artistId=3709231' },
      { label: '생일 자료', href: 'https://melomi.org/groups/564/rescene' },
      { label: '고향·활동', href: 'https://www.nocutnews.co.kr/news/6542161' }
    ]
  },
  ive: {
    checkedAt: '2026.11.22',
    debut: '2021.12.01', debutWork: 'ELEVEN',
    agency: 'STARSHIP Entertainment',
    concept: 'I HAVE, 그리고 당당한 IVE의 순간.',
    heightSource: 'https://www.youtube.com/watch?v=sqe55UwRU2o',
    awards: [
      { year: '2026.11', title: 'MAMA2026 BEST FEMALE GROUP', detail: '11.20 제1일차 · 여자 그룹상', href: 'https://en.yna.co.kr/view/AEN20261121001851315' },
      { year: '2026.11', title: 'MAMA2026 BEST SONG TOP 10', detail: '11.21 제2일차 · BANG BANG', href: 'https://www.soompi.com/article/1889392wpp/winners-of-2026-mama-awards-chapter-2' },
      { year: '2026.11', title: 'MMA2026 올해의 베스트송 대상 등 5관왕', detail: '11.15 BANG BANG · 베스트송·뮤직비디오, 베스트 그룹 여자, TOP10·글로벌 TOP10', href: 'https://www.melon.com/mma/result.htm?mmaYear=2026' },
      { year: '2022', title: 'MAMA 올해의 노래', detail: 'LOVE DIVE', href: 'https://mama.mnetplus.world/history/2022/winners' },
      { year: '2026.09', title: '장원영 · 올해의 브랜드 대상', detail: '여자 광고모델 부문 · 2년 연속', href: 'https://www.etnews.com/20260901000136' }
    ],
    records: [
      { year: '2026.06', title: 'LUCID DREAM 오리콘 주간 앨범 1위', detail: '일본 4번째 EP · 2026/6/8자 주간 앨범 차트 · 소니뮤직 공식 프로필', href: 'https://www.sonymusic.co.jp/artist/IVE/profile/' },
      { year: '2026.11', title: '제69회 그래미 어워즈 후보 지명', detail: '11.16 발표 · BANG BANG, Best Asian Pop Music Performance 부문 · 2027.02.07 시상 예정', href: 'https://www.grammy.com/songs/bang-bang-2/' },
      { year: '2023.02', title: '음악방송 누적 37관왕', detail: 'ELEVEN · LOVE DIVE · After LIKE', href: 'https://enews.imbc.com/News/RetrieveNewsInfo/373075' }
    ],
    members: [
      { name: '안유진', birthday: '2003.09.01', height: '173', hometown: '대전', school: '고졸 검정고시 · 합격', note: '리더', source: 'https://tvreport.co.kr/music/article/160836/' },
      { name: '가을', birthday: '2002.09.24', height: '164', hometown: '인천', school: '', note: '맏언니', source: 'https://ive-official.jp/mob/pageShw.php?cd=profile&site=DIVE' },
      { name: '레이', birthday: '2004.02.03', height: '169', hometown: '일본 나고야', school: '서울공연예고 · 졸업', note: '래퍼 · 보컬', source: 'https://ive-official.jp/mob/pageShw.php?cd=profile&site=DIVE' },
      { name: '장원영', birthday: '2004.08.31', height: '173', hometown: '서울', school: '서울공연예고 · 졸업', note: '보컬', source: 'https://enews.imbc.com/News/RetrieveNewsInfo/373075' },
      { name: '리즈', birthday: '2004.11.21', height: '171~172', hometown: '제주', school: '고졸 검정고시 · 합격', note: '보컬', source: 'https://v.daum.net/v/20221108192007843' },
      { name: '이서', birthday: '2007.02.21', height: '165', hometown: '서울', school: '한림연예예고 · 졸업', note: '막내', source: 'https://www.namu.moe/w/%EC%9D%B4%EC%84%9C' }
    ],
    sources: [
      { label: '2026 MAMA 수상 결과 (연합뉴스)', href: 'https://en.yna.co.kr/view/AEN20261121001851315' },
      { label: '2026 MMA 공식 수상자', href: 'https://www.melon.com/mma/result.htm?mmaYear=2026' },
      { label: '2027 그래미 공식 후보', href: 'https://www.grammy.com/songs/bang-bang-2/' },
      { label: 'IVE 공식 프로필', href: 'https://ive-official.jp/mob/pageShw.php?cd=profile&site=DIVE' },
      { label: 'MAMA 수상', href: 'https://mama.mnetplus.world/history/2022/winners' }
    ]
  },
  aespa: {
    checkedAt: '2026.11.17',
    debut: '2020.11.17', debutWork: 'Black Mamba',
    agency: 'SM Entertainment',
    concept: '현실과 가상 세계를 잇는 aespa.',
    heightSource: 'https://kpopdiscover.com/en/groups/aespa/',
    awards: [
      { year: '2026.11', title: 'MMA2026 올해의 글로벌-K 아티스트 · 대상', detail: '11.14 첫 시상 부문 수상', href: 'https://www.melon.com/mma/result.htm?mmaYear=2026' },
      { year: '2026.11', title: 'MMA2026 글로벌 TOP10', detail: '11.14 글로벌 TOP10 수상 · 2관왕', href: 'https://www.yna.co.kr/view/AKR20261114049700005' },
      { year: '2024', title: 'MAMA 올해의 노래', detail: 'Supernova', href: 'https://mama.mnetplus.world/history/2024/winners' },
      { year: '2025', title: '한국대중음악상 올해의 노래', detail: 'Supernova', href: 'https://koreanmusicawards.com/project/aespa-supernova/' }
    ],
    records: [
      { year: '2026.11', title: 'LEMONADE MV 1억 조회', detail: '11.13 돌파 · 그룹 12번째 1억 뷰 뮤직비디오', href: 'https://www.soompi.com/article/1886736wpp/aespas-lemonade-becomes-their-12th-mv-to-hit-100-million-views' },
      { year: '2024', title: 'MAMA 6관왕', detail: 'Supernova · Armageddon 외', href: 'https://cjenm.com/en/news/2024-mama-awards-wrap-up-historic-run-with-iconic-performances-and-milestone-moments/' }
    ],
    members: [
      { name: '카리나', birthday: '2000.04.11', height: '168', hometown: '경기 성남', school: '고졸 검정고시 · 합격', note: '리더', source: 'https://aespa-official.jp/profile/' },
      { name: '지젤', birthday: '2000.10.30', height: '164', hometown: '일본 도쿄', school: '세이신 국제학교 · 졸업', note: '래퍼', source: 'https://aespa-official.jp/profile/' },
      { name: '윈터', birthday: '2001.01.01', height: '165', hometown: '경남 양산', school: '고졸 검정고시 · 합격', note: '보컬', source: 'https://aespa-official.jp/profile/' },
      { name: '닝닝', birthday: '2002.10.23', height: '161', hometown: '중국 하얼빈', school: '', note: '보컬 · 막내', source: 'https://aespa-official.jp/profile/' }
    ],
    sources: [
      { label: 'aespa 일본 공식 생일', href: 'https://aespa-official.jp/profile/' },
      { label: 'MAMA 기록', href: 'https://mama.mnetplus.world/history/2024/winners' },
      { label: '한국대중음악상', href: 'https://koreanmusicawards.com/project/aespa-supernova/' }
    ]
  },
  lesserafim: {
    checkedAt: '2026.11.15',
    debut: '2022.05.02', debutWork: 'FEARLESS',
    agency: 'SOURCE MUSIC · HYBE',
    concept: 'IM FEARLESS, 두려움 없이 나아가는 다섯 멤버.',
    heightSource: 'https://kpopdiscover.com/en/groups/le-sserafim/',
    awards: [
      { year: '2024', title: 'MTV VMAs PUSH 퍼포먼스상', detail: 'EASY', href: 'https://www.paramountpressexpress.com/mtv/releases/?view=110288-mtv-reveals-winners-for-2024-video-music-awards-vmas' }
    ],
    records: [
      { year: '2026.08', title: '사쿠라 · Forbes JAPAN 30 UNDER 30', detail: '2026 일본 선정 · 멤버 개인 기록', href: 'https://www.le-sserafim.jp/news/11619647448c' },
      { year: '2026.11', title: '사쿠라 · WIRED Innovation Awards 2026', detail: '멤버 개인 수상 · 일본 WIRED 선정', href: 'https://www.le-sserafim.jp/news/8c78b9319fdd' },
      { year: '2024.03', title: '빌보드 200 8위', detail: 'EASY', href: 'https://ca.billboard.com/music/chart-beat/twice-le-sserafim-first-2-all-female-k-pop-groups-billboard-200-top-10-together-1235621542/' }
    ],
    members: [
      { name: '김채원', birthday: '2000.08.01', height: '164', hometown: '서울', school: '한림연예예고 · 졸업', note: '리더', source: 'https://www.le-sserafim.jp/profile/KIMCHAEWON' },
      { name: '사쿠라', birthday: '1998.03.19', height: '163', hometown: '일본 가고시마', school: '', note: '아이즈원 활동 이력', source: 'https://www.le-sserafim.jp/profile/SAKURA' },
      { name: '허윤진', birthday: '2001.10.08', height: '172', hometown: '미국 뉴욕주에서 성장', school: '니스카유나고 · 재학 이력', note: '싱어송라이터', source: 'https://www.le-sserafim.jp/profile/HUHYUNJIN' },
      { name: '카즈하', birthday: '2003.08.09', height: '170', hometown: '일본 오사카', school: '네덜란드 국립발레아카데미 · 유학', note: '발레 경력', source: 'https://www.le-sserafim.jp/profile/KAZUHA' },
      { name: '홍은채', birthday: '2006.11.10', height: '170', hometown: '서울', school: '', note: '막내', source: 'https://www.le-sserafim.jp/profile/HONGEUNCHAE' }
    ],
    sources: [
      { label: 'SOURCE MUSIC', href: 'https://sourcemusic.com/artist/profile/LE%20SSERAFIM?lang=ko' },
      { label: '공식 멤버 프로필', href: 'https://www.le-sserafim.jp/profile' },
      { label: 'MTV 수상', href: 'https://www.paramountpressexpress.com/mtv/releases/?view=110288-mtv-reveals-winners-for-2024-video-music-awards-vmas' }
    ]
  },
  twice: {
    checkedAt: '2026.11.17',
    debut: '2015.10.20', debutWork: 'The Story Begins · OOH-AHH하게',
    agency: 'JYP Entertainment',
    concept: 'SIXTEEN에서 출발한 아홉 멤버의 이야기.',
    heightSource: 'https://kpopdiscover.com/en/groups/twice/',
    awards: [
      { year: '2016', title: 'MAMA 올해의 노래', detail: 'CHEER UP', href: 'https://mama.mnetplus.world/history/2016/winners' }
    ],
    records: [
      { year: '2026', title: '일본 MUFG STADIUM 공연', detail: '해외 아티스트 최초 해당 공연장 공연 · TWICE 일본 공식 발표', href: 'https://www.twicejapan.com/news/detail/2047' },
      { year: '2024.03', title: '빌보드 200 1위', detail: 'With YOU-th', href: 'https://ca.billboard.com/charts/billboard-200/2024-03-09' },
      { year: '2023', title: '미국 스타디움 공연 매진', detail: 'SoFi · MetLife', href: 'https://ca.billboard.com/music/music-news/chaeyoung-talks-lil-fantasy-vol-1-solo-debut-twices-10th-anniversary-why-shes-hungrier-than-ever-musically-2674025078' }
    ],
    members: [
      { name: '나연', birthday: '1995.09.22', height: '163', hometown: '서울', school: '건국대 영상영화학 · 재학 이력', note: '맏언니', source: 'https://twice.jype.com/profile' },
      { name: '정연', birthday: '1996.11.01', height: '169', hometown: '경기 수원', school: '압구정고 · 졸업', note: '보컬', source: 'https://twice.jype.com/profile' },
      { name: '모모', birthday: '1996.11.09', height: '167', hometown: '일본 교토', school: '', note: '댄스', source: 'https://twice.jype.com/profile' },
      { name: '사나', birthday: '1996.12.29', height: '168', hometown: '일본 오사카', school: '', note: '보컬', source: 'https://twice.jype.com/profile' },
      { name: '지효', birthday: '1997.02.01', height: '162', hometown: '경기 구리', school: '', note: '리더', source: 'https://twice.jype.com/profile' },
      { name: '미나', birthday: '1997.03.24', height: '163', hometown: '일본 고베에서 성장', school: '', note: '미국 출생', source: 'https://twice.jype.com/profile' },
      { name: '다현', birthday: '1998.05.28', height: '165', hometown: '경기 성남', school: '한림연예예고 · 졸업', note: '래퍼', source: 'https://twice.jype.com/profile' },
      { name: '채영', birthday: '1999.04.23', height: '163', hometown: '서울', school: '한림연예예고 · 졸업', note: '래퍼', source: 'https://www.osen.co.kr/article/G1111080265' },
      { name: '쯔위', birthday: '1999.06.14', height: '170', hometown: '대만 타이난', school: '한림연예예고 · 졸업', note: '막내', source: 'https://www.osen.co.kr/article/G1111080265' }
    ],
    sources: [
      { label: 'JYP 공식 프로필', href: 'https://twice.jype.com/profile' },
      { label: 'Warner Music Japan · 멤버 공개 생일·혈액형', href: 'https://wmg.jp/twice/' },
      { label: 'TWICE JAPAN · 최근 활동·음반', href: 'https://www.twicejapan.com/latest_news/' },
      { label: 'MAMA 수상', href: 'https://mama.mnetplus.world/history/2016/winners' },
      { label: '빌보드 차트', href: 'https://ca.billboard.com/charts/billboard-200/2024-03-09' }
    ]
  },
  illit: {
    checkedAt: '2026.11.18',
    debut: '2024.03.25', debutWork: 'SUPER REAL ME · Magnetic',
    agency: 'BELIFT LAB · HYBE',
    concept: 'Magnetic부터 BREAK EVEN까지, 아일릿의 이야기.',
    heightSource: 'https://kprofiles.com/illit-members-profile/',
    awards: [
      { year: '2026.11', title: 'MMA2026 4관왕', detail: '톱10 · 글로벌 톱10 · 베스트 퍼포먼스 여자 · 글로벌 임팩트 아티스트 · 2026.11.15', href: 'https://www.osen.co.kr/article/G1112910990' },
      { year: '2026.11', title: 'KBS 뮤직뱅크 1위', detail: '체포하겠어 (You\'re Under Arrest) · 2026.11.06 · 9,803점', href: 'https://www.soompi.com/article/1884749wpp/watch-nmixx-takes-1st-win-for-birthday-wish-on-music-bank-performances-by-ateez-illit-and-more-2' },
      { year: '2026.10', title: '제15회 TTA 베스트 여자 아이돌 그룹', detail: '2026.10.30 · 여자 아이돌 그룹 부문 1위', href: 'https://www.tenasia.co.kr/article/2026103060504' },
      { year: '2024', title: 'MAMA 여자 신인상', detail: 'BEST NEW FEMALE ARTIST', href: 'https://mama.mnetplus.world/history/2024/winners' }
    ],
    records: [
      { year: '2024.04', title: '빌보드 HOT 100 진입', detail: 'Magnetic · 91위', href: 'https://en.yna.co.kr/view/AEN20240416002500315' },
      { year: '2026.11', title: '빌보드 200 6위', detail: 'BREAK EVEN', href: 'https://en.yna.co.kr/view/AEN20261110001100315' }
    ],
    members: [
      { name: '윤아', birthday: '2004.01.15', height: '168', hometown: '충북 충주', school: '', note: 'YUNAH', source: 'https://beliftlab.com/artist/profile/ILLIT' },
      { name: '민주', birthday: '2004.05.11', height: '163', hometown: '경기 남양주', school: '', note: 'MINJU', source: 'https://beliftlab.com/artist/profile/ILLIT' },
      { name: '모카', birthday: '2004.10.08', height: '162', hometown: '일본 후쿠오카', school: '', note: 'MOKA', source: 'https://beliftlab.com/artist/profile/ILLIT' },
      { name: '원희', birthday: '2007.06.26', height: '162', hometown: '경남 창원에서 성장', school: '', note: 'WONHEE', source: 'https://beliftlab.com/artist/profile/ILLIT' },
      { name: '이로하', birthday: '2008.02.04', height: '158', hometown: '일본 도쿄', school: '', note: 'IROHA', source: 'https://beliftlab.com/artist/profile/ILLIT' }
    ],
    sources: [
      { label: 'BELIFT LAB 공식', href: 'https://beliftlab.com/artist/profile/ILLIT' },
      { label: '멤버·생일·키 자료', href: 'https://kprofiles.com/illit-members-profile/' },
      { label: '2024 MAMA', href: 'https://mama.mnetplus.world/history/2024/winners' }
    ]
  },
  a2omay: {
    checkedAt: '2026.11.10',
    debut: '2024.12.20', debutWork: 'Under My Skin (A2O)',
    agency: 'A2O Entertainment',
    concept: '다섯 멤버가 선보이는 Zalpha Pop.',
    heightSource: 'https://kpopdiscover.com/en/groups/a2o-may/',
    awards: [
      { year: '2025', title: 'Weibo Music Awards 신인상', detail: 'Annual Newcomer Group', href: 'https://prtimes.jp/main/html/rd/p/000001831.000055377.html' }
    ],
    records: [
      { year: '2025', title: 'Mediabase Top 40 진입', detail: 'Under My Skin (A2O) · 39위', href: 'https://www.melon.com/artist/detail.htm?artistId=4531270' }
    ],
    members: ['CHENYU', 'SHIJIE', 'QUCHANG', 'MICHE', 'KAT'].map((name) => a2oMember(name, 'https://www.melon.com/artist/detail.htm?artistId=4531270')),
    sources: [
      { label: 'Melon 공식 유통 정보', href: 'https://www.melon.com/artist/detail.htm?artistId=4531270' },
      { label: 'A2O 공식', href: 'https://www.a2oentertainment.world/' },
      { label: '신인상 자료 · The Orchard Japan', href: 'https://prtimes.jp/main/html/rd/p/000001831.000055377.html' }
    ]
  },
  a2olite: {
    checkedAt: '2026.11.18',
    debut: '2026.10.13', debutWork: 'NEON',
    agency: 'A2O Entertainment',
    concept: '아홉 멤버의 네온빛 Zalpha Pop.',
    awards: [
      { year: '2026.11', title: '인기가요 트리플 크라운·음악방송 11관왕', detail: 'NEON · 11.08 인기가요 3번째 1위', href: 'https://www.soompi.com/article/1885054wpp/watch-a2o-lite-takes-11th-win-and-triple-crown-for-neon-on-inkigayo-performances-by-blackpinks-jisoo-and-more' },
      { year: '2026.10', title: '더쇼 첫 1위', detail: 'NEON · 2026.10.20', href: 'https://prtimes.jp/main/html/rd/p/000000005.000192898.html' },
      { year: '2026.10', title: '엠카운트다운 1위', detail: 'NEON · 2026.10.22, 음악방송 3관왕', href: 'https://prtimes.jp/main/html/rd/p/000000008.000192898.html' },
      { year: '2026.10', title: '인기가요 1위', detail: 'NEON', href: 'https://m.programs.sbs.co.kr/programTemplate/amp/clip/mobile/22000638968' }
    ],
    records: [
      { year: '2026.11', title: '써클 차트 3관왕', detail: 'NEON · 디지털·스트리밍·글로벌 K팝 차트 1위(11.11 보도)', href: 'https://www.soompi.com/article/1886133wpp/ive-riize-and-illit-top-circle-weekly-charts-a2o-earns-triple-crown' },
      { year: '2026.10', title: '빌보드 글로벌 차트 2개 부문 톱10', detail: 'NEON · Global 200 8위 / Global Excl. U.S. 3위 · 10.31 차트', href: 'https://prtimes.jp/main/html/rd/p/000000009.000192898.html' },
      { year: '2026.10', title: '오리콘 주간 스트리밍 급상승 1위', detail: 'NEON · 2026.10.29 발표', href: 'https://prtimes.jp/main/html/rd/p/000000009.000192898.html' },
      { year: '2026.10', title: '멜론 TOP100 1위', detail: 'NEON · 데뷔 다음 날', href: 'https://en.yna.co.kr/view/AEN20261015001400315' }
    ],
    members: ['YOUNG', 'OA', 'AYUNE', 'AIJING', 'HIMEKI', 'RADA', 'XILI', 'VORA', 'MERCI'].map((name) => a2oMember(name, 'https://www.melon.com/artist/detail.htm?artistId=5217450')),
    sources: [
      { label: 'Melon 공식 유통 정보', href: 'https://www.melon.com/artist/detail.htm?artistId=5217450' },
      { label: 'A2O 공식', href: 'https://www.a2oentertainment.world/' },
      { label: '멜론 1위 보도', href: 'https://en.yna.co.kr/view/AEN20261015001400315' },
      { label: 'A2O 공식 발표 · 음악방송 3관왕', href: 'https://prtimes.jp/main/html/rd/p/000000008.000192898.html' },
      { label: 'A2O 공식 발표 · 미국·일본 차트', href: 'https://prtimes.jp/main/html/rd/p/000000009.000192898.html' }
    ]
  },
  a2osoul: {
    checkedAt: '2026.11.18',
    debut: '2026.10.13', debutWork: 'SUPERSTAR 선공개',
    agency: 'A2O Entertainment',
    concept: '15명의 NEW SYNTHWAVE.',
    awards: [
      { year: '2026.11', title: 'SBS Life 더쇼 음악방송 첫 1위', detail: 'Dancing in the Dark · 2026.11.17 · 11,660점', href: 'https://www.soompi.com/article/1888114wpp/watch-a2o-soul-takes-1st-ever-win-on-the-show-for-dancing-in-the-dark' }
    ],
    records: [
      { year: '2026.11', title: '데뷔 EP 공개', detail: 'SUPERSTAR · 5곡', href: 'https://www.melon.com/album/detail.htm?albumId=14644792' },
      { year: '2026.10', title: 'SUPERSTAR 글로벌 차트 기록', detail: 'A2O 발표 기준 QQ Music 신곡 2위·MV 글로벌 4위, YouTube 인기 음악 18위', href: 'https://prtimes.jp/main/html/rd/p/000000007.000192898.html' }
    ],
    members: ['MOON', 'TAI', 'GAKU', 'SEE-ONE', 'SEOHA', 'SONO', 'LUCIEN', 'ZAI', 'AYDEN', 'ALURE', 'ZET', 'SORA', 'TEO', 'JUNE', 'HANSUNG'].map((name) => a2oMember(name, 'https://www.melon.com/artist/detail.htm?artistId=5217448')),
    sources: [
      { label: 'Melon 공식 유통 정보', href: 'https://www.melon.com/artist/detail.htm?artistId=5217448' },
      { label: '데뷔 EP 5곡', href: 'https://www.melon.com/album/detail.htm?albumId=14644792' },
      { label: 'A2O 공식', href: 'https://www.a2oentertainment.world/' },
      { label: '15인·더블 타이틀 공식 발표', href: 'https://prtimes.jp/main/html/rd/p/000000007.000192898.html' }
    ]
  }
};

/* Extra member facts are reference values, not fixed official measurements.
   MBTI can change after a new self-assessment. Keep conflicting or unpublished
   values blank until confirmed; never infer a blood type or personality type. */
const supplementaryProfiles = {
  rescene: {
    sources: [{ label: '멤버 혈액형·MBTI', href: 'https://kpopdiscover.com/en/groups/rescene/' }],
    members: {
      '원이': { bloodType: 'B', mbti: 'ESFP' }, '리브': { bloodType: 'A', mbti: 'ESFP' },
      '미나미': { bloodType: 'O', mbti: 'ENFP' }, '메이': { bloodType: 'AB', mbti: 'INTP' },
      '제나': { bloodType: 'A', mbti: 'INFP' }
    }
  },
  ive: {
    sources: [{ label: '멤버 혈액형·MBTI', href: 'https://kpopdiscover.com/en/groups/ive/' }],
    members: {
      '안유진': { bloodType: 'A', mbti: 'ISTP' }, '가을': { bloodType: 'B', mbti: 'ISTJ' },
      '레이': { bloodType: 'A', mbti: 'INFJ' }, '장원영': { bloodType: 'O', mbti: 'ENTJ' },
      '리즈': { bloodType: 'AB', mbti: 'INTP' }, '이서': { bloodType: 'O', mbti: 'ESTP' }
    }
  },
  aespa: {
    sources: [{ label: '멤버 혈액형·MBTI', href: 'https://kpopdiscover.com/en/groups/aespa/' }],
    members: {
      '카리나': { bloodType: 'B', mbti: 'ENFP' }, '지젤': { bloodType: 'O', mbti: 'INFJ' },
      '윈터': { bloodType: 'A', mbti: 'ENFJ' }, '닝닝': { bloodType: 'O', mbti: 'INFP' }
    }
  },
  lesserafim: {
    sources: [{ label: '멤버 혈액형·MBTI', href: 'https://kpopdiscover.com/en/groups/le-sserafim/' }],
    members: {
      '김채원': { bloodType: 'B', mbti: 'ISTP' }, '사쿠라': { bloodType: 'A', mbti: 'INTP' },
      '허윤진': { bloodType: 'B', mbti: 'INFJ' }, '카즈하': { bloodType: 'O', mbti: 'ENFP' },
      '홍은채': { bloodType: 'A', mbti: 'ISFP' }
    }
  },
  twice: {
    sources: [{ label: '멤버 혈액형·MBTI', href: 'https://kpopdiscover.com/en/groups/twice/' }],
    members: {
      '나연': { bloodType: 'A', mbti: 'ISTP' }, '정연': { bloodType: 'O', mbti: 'ESFJ' },
      '모모': { bloodType: 'A', mbti: 'INTP' }, '사나': { bloodType: 'B', mbti: 'ENFP' },
      '지효': { bloodType: 'O', mbti: 'ESTP' }, '미나': { bloodType: 'A', mbti: 'ISTP' },
      '다현': { bloodType: 'O', mbti: 'ISFJ-T' }, '채영': { bloodType: 'B', mbti: 'INFP-T' },
      '쯔위': { bloodType: 'A', mbti: 'ISFP-A' }
    }
  },
  illit: {
    sources: [
      { label: '멤버 혈액형·MBTI', href: 'https://kpopdiscover.com/en/groups/illit/' },
      { label: '아일릿 MBTI 변경 참고', href: 'https://kprofiles.com/illit-members-profile/' },
      { label: '민주 MBTI 변경 인터뷰', href: 'https://magazine.weverse.io/article/view/2003' }
    ],
    members: {
      '윤아': { bloodType: 'A', mbti: 'ENFP' }, '민주': { bloodType: 'O', mbti: 'ISTJ' },
      '모카': { bloodType: 'B', mbti: 'ISFP' }, '원희': { bloodType: 'A', mbti: 'ISFP' },
      '이로하': { bloodType: 'A', mbti: 'INFJ' }
    }
  },
  a2omay: {
    sources: [{ label: '멤버 생일·키', href: 'https://kpopdiscover.com/en/groups/a2o-may/' }],
    members: {
      'CHENYU': { birthday: '2008.02.22', height: '173' },
      'SHIJIE': { birthday: '2007.06.26', height: '170.5' },
      'QUCHANG': { birthday: '2007.07.28', height: '178.1' },
      'MICHE': { birthday: '2005.04.15', height: '172.5' },
      'KAT': { birthday: '2005.04.15', height: '171' }
    }
  },
  a2olite: {
    sources: [{ label: '멤버 생일·MBTI', href: 'https://tanjoubi.today/en/group/20261013_A2OLITE_dc66' }],
    members: {
      'YOUNG': { birthday: '2008.10.27' },
      'OA': { birthday: '2013.02.08', mbti: 'ENFP' },
      'AYUNE': { birthday: '2013.01.29' },
      'AIJING': { birthday: '2013.04.24', mbti: 'ESFJ' },
      'HIMEKI': { birthday: '2009.10.05', mbti: 'INFJ' },
      'RADA': { birthday: '2011.04.11' },
      'XILI': { birthday: '2010.11.06' },
      'VORA': { birthday: '2010.02.10', mbti: 'INTJ' },
      'MERCI': { birthday: '2011.05.31', mbti: 'ISTJ' }
    }
  },
  a2osoul: {
    sources: [],
    members: {}
  }
};

for (const [id, supplement] of Object.entries(supplementaryProfiles)) {
  const profile = window.OJJUDA_FAN_PROFILES[id];
  if (!profile) continue;
  profile.sources.push(...supplement.sources);
  for (const member of profile.members) {
    Object.assign(member, supplement.members[member.name] || {});
  }
}
