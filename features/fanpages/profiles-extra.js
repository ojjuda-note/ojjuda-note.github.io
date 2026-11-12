/* New groups use source-linked group introductions.
   Individual personal details are not guessed or copied from unofficial profiles. */
for (const artist of window.OJJUDA_FAN_ARTISTS.filter((item) => item.basicProfile)) {
  window.OJJUDA_FAN_PROFILES[artist.id] = {
    basic: true,
    checkedAt: artist.checkedAt,
    debut: artist.debut,
    debutWork: artist.debutWork,
    agency: artist.agency,
    concept: artist.concept,
    heightSource: '',
    awards: [],
    records: [],
    members: artist.members.map((name) => ({
      name,
      birthday: null,
      height: null,
      hometown: '',
      school: '',
      note: 'MEMBER',
      source: artist.official
    })),
    sources: [
      { label: '공식 아티스트 채널', href: artist.official },
      { label: '사진 · Wikimedia Commons', href: artist.imageLink }
    ]
  };
}

/* ENHYPEN: dates from BELIFT LAB's current six-member profile. */
const enhypenProfile = window.OJJUDA_FAN_PROFILES.enhypen;
if (enhypenProfile) {
  enhypenProfile.expanded = true;
  const birthdays = {
    '정원': '2004.02.09', '제이': '2002.04.20', '제이크': '2002.11.15',
    '성훈': '2002.12.08', '선우': '2003.06.24', '니키': '2005.12.09'
  };
  for (const member of enhypenProfile.members) {
    member.birthday = birthdays[member.name] || null;
    member.source = 'https://beliftlab.com/artist/profile/ENHYPEN';
  }
  enhypenProfile.records = [
    { year: '2026', title: '6인조 공식 활동', detail: '정원·제이·제이크·성훈·선우·니키 · BELIFT LAB 공식 프로필', href: 'https://beliftlab.com/artist/profile/ENHYPEN' }
  ];
  enhypenProfile.sources.unshift({ label: 'BELIFT LAB 공식 멤버 프로필 · 생일', href: 'https://beliftlab.com/artist/profile/ENHYPEN' });
  enhypenProfile.sources.push({ label: 'BELIFT LAB 공식 음반 목록', href: 'https://beliftlab.com/artist/discography/ENHYPEN' });
}

/* TXT: public birthdays and reference heights from official Japanese profiles. */
const txtProfile = window.OJJUDA_FAN_PROFILES.txt;
if (txtProfile) {
  txtProfile.expanded = true;
  txtProfile.heightSource = 'https://txt-official.jp/profile/';
  const txtOfficialMembers = {
    '수빈': { birthday: '2000.12.05', height: '185', slug: 'SOOBIN' },
    '연준': { birthday: '1999.09.13', height: '181.5', slug: 'YEONJUN' },
    '범규': { birthday: '2001.03.13', height: '180', slug: 'BEOMGYU' },
    '태현': { birthday: '2002.02.05', height: '177', slug: 'TAEHYUN' },
    '휴닝카이': { birthday: '2002.08.14', height: '183', slug: 'HUENINGKAI' }
  };
  for (const member of txtProfile.members) {
    const official = txtOfficialMembers[member.name];
    if (!official) continue;
    member.birthday = official.birthday;
    member.height = official.height;
    member.source = 'https://txt-official.jp/profile/' + official.slug;
  }
  txtProfile.records = [
    { year: '2025.08', title: '빅히트 뮤직과 멤버 전원 재계약', detail: '2026년 미니 8집 공식 소개에서 확인', href: 'https://ibighit.com/ko/txt/discography/detail/7th_year' },
    { year: '2026.11', title: 'STEAL THE WIND 월드투어 개막', detail: '11.13~15 서울 KSPO DOME 공연 예정', href: 'https://weverse.io/txt/notice/39106' }
  ];
  txtProfile.sources.unshift({ label: 'TXT 일본 공식 멤버 프로필 · 생일·신장', href: 'https://txt-official.jp/profile/' });
  txtProfile.sources.push({ label: 'BIGHIT MUSIC 공식 2026 미니 8집', href: 'https://ibighit.com/ko/txt/discography/detail/7th_year' });
}

/* i-dle: birthdays and tour from Cube's Japanese official site. */
const idleProfile = window.OJJUDA_FAN_PROFILES.idle;
if (idleProfile) {
  idleProfile.expanded = true;
  idleProfile.records = [
    { year: '2025', title: 'i-dle로 활동명 변경', detail: '데뷔 7주년 이후 다섯 멤버의 팀 이름으로 활동', href: 'https://i-dle.cubeent.co.jp/profile/' },
    { year: '2026', title: '네 번째 월드투어 Syncopation', detail: '2026.02.21 서울 KSPO DOME 개막 · 아시아·오세아니아 공연', href: 'https://i-dle.cubeent.co.jp/news/2588/' }
  ];
  const birthdays = {
    '미연': '1997.01.31', '민니': '1997.10.23', '소연': '1998.08.26',
    '우기': '1999.09.23', '슈화': '2000.01.06'
  };
  for (const member of idleProfile.members) {
    member.birthday = birthdays[member.name] || null;
    member.source = 'https://i-dle.cubeent.co.jp/profile/';
  }
  idleProfile.sources.unshift({ label: '큐브 일본 공식 프로필 · 생일', href: 'https://i-dle.cubeent.co.jp/profile/' });
  idleProfile.sources.push({ label: '큐브 일본 공식 2026 월드투어 발표', href: 'https://i-dle.cubeent.co.jp/news/2588/' });
}

/* NMIXX: only publicly documented dates are filled. Unknown personal facts remain blank. */
const nmixxProfile = window.OJJUDA_FAN_PROFILES.nmixx;
if (nmixxProfile) {
  nmixxProfile.expanded = true;
  nmixxProfile.awards = [
    { year: '2026.09', title: '더팩트 뮤직 어워즈 대상', detail: 'Sound of the Year · 2026.09.19', href: 'https://www.soompi.com/article/1871808wpp/winners-of-2026-the-fact-music-awards' }
  ];
  nmixxProfile.records = [
    { year: '2026', title: '첫 월드투어 진행', detail: 'EPISODE 1: ZERO FRONTIER · 유럽·아시아 투어', href: 'https://recruit.jype.com/ko/news/60' }
  ];
  const birthdays = {
    '릴리': '2002.10.17',
    '해원': '2003.02.25',
    '설윤': '2004.01.26',
    '배이': '2004.12.28',
    '지우': '2005.04.13',
    '규진': '2006.05.26'
  };
  for (const member of nmixxProfile.members) {
    member.birthday = birthdays[member.name] || null;
    member.source = 'https://nmixx.jype.com/profile';
  }
  nmixxProfile.sources.unshift({ label: 'JYP 공식 멤버 프로필·생일', href: 'https://nmixx.jype.com/profile' });
  nmixxProfile.sources.push({ label: '2026 TMA 수상', href: 'https://www.soompi.com/article/1871808wpp/winners-of-2026-the-fact-music-awards' });
}

/* BABYMONSTER: YG-published birthdays and seven-member debut; private details stay blank. */
const babymonsterProfile = window.OJJUDA_FAN_PROFILES.babymonster;
if (babymonsterProfile) {
  babymonsterProfile.expanded = true;
  babymonsterProfile.records = [
    { year: '2024.04', title: '7인조 정식 데뷔', detail: '미니 1집 BABYMONS7ER · SHEESH', href: 'https://ygfamily.com/ko/artists/babymonster/profile' },
    { year: '2026', title: '두 번째 월드투어', detail: '2026–27 춤 (CHOOM) · 아시아·오세아니아 공연', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' }
  ];
  const birthdays = {
    '루카': '2002.03.20',
    '파리타': '2005.08.26',
    '아사': '2006.04.17',
    '아현': '2007.04.11',
    '라미': '2007.10.17',
    '로라': '2008.08.14',
    '치키타': '2009.02.17'
  };
  for (const member of babymonsterProfile.members) {
    member.birthday = birthdays[member.name] || null;
    member.source = 'https://ygfamily.com/ko/artists/babymonster/profile';
  }
  babymonsterProfile.sources.unshift({ label: 'YG 공식 프로필 · 멤버 생일·정식 데뷔', href: 'https://ygfamily.com/ko/artists/babymonster/profile' });
  babymonsterProfile.sources.push({ label: 'YG 공식 디스코그래피 · 첫 디지털 싱글', href: 'https://www.ygfamily.com/en/artists/babymonster/discography/1578' });
}

/* Hearts2Hearts: official group milestones; private member details stay blank. */
const hearts2heartsProfile = window.OJJUDA_FAN_PROFILES.hearts2hearts;
if (hearts2heartsProfile) {
  hearts2heartsProfile.records = [
    { year: '2026.08', title: '일본 정식 데뷔', detail: '첫 일본 싱글 ICONIC HEART · 2026.08.12', href: 'https://hearts2heartsofficial.jp/news/2026081203/' },
    { year: '2026.11', title: '일본 첫 팬 이벤트', detail: 'READY! S2U · 도쿄 아리아케 아레나 11.22~23', href: 'https://hearts2heartsofficial.jp/news/2026081203/' }
  ];
  hearts2heartsProfile.sources.unshift({ label: 'Hearts2Hearts 일본 공식 프로필·공연', href: 'https://hearts2heartsofficial.jp/' });
}

/* BLACKPINK: YG-published member birthdays; no inferred physical or school details. */
const blackpinkProfile = window.OJJUDA_FAN_PROFILES.blackpink;
if (blackpinkProfile) {
  blackpinkProfile.expanded = true;
  blackpinkProfile.records = [
    { year: '2026.02', title: '유튜브 공식 아티스트 채널 최초 1억 구독자', detail: '2026.02.20 달성 · 유튜브 레드 다이아몬드 크리에이터 어워드', href: 'https://en.yna.co.kr/view/AEN20260221002851320' },
    { year: '2025–2026', title: '월드투어 DEADLINE', detail: '16개 도시·33회 공연 후 2026년 1월 종료', href: 'https://www.ygfamily.com/en/news/report/7378' }
  ];
  blackpinkProfile.awards = [
    { year: '2026.01', title: '제40회 골든디스크 어워즈 디지털 음원 본상', detail: 'YG 공식 수상 이력', href: 'https://ygfamily.com/ko/artists/blackpink/profile' }
  ];
  const birthdays = { '지수': '1995.01.03', '제니': '1996.01.16', '로제': '1997.02.11', '리사': '1997.03.27' };
  for (const member of blackpinkProfile.members) {
    member.birthday = birthdays[member.name] || null;
    member.source = 'https://ygfamily.com/ko/artists/blackpink/profile';
  }
  blackpinkProfile.sources.unshift({ label: 'YG 공식 멤버 프로필·생일·수상', href: 'https://ygfamily.com/ko/artists/blackpink/profile' });
  blackpinkProfile.sources.push({ label: 'YG 공식 DEADLINE 음반·수록곡', href: 'https://ygfamily.com/en/artists/blackpink/discography/1651' });
}


/* BTS: seven official member birth dates and blood types. Unpublished height,
   MBTI, school and hometown information remains unset. */
const btsProfile = window.OJJUDA_FAN_PROFILES.bts;
if (btsProfile) {
  btsProfile.checkedAt = '2026.11.12';
  btsProfile.expanded = true;
  btsProfile.records = [
    { year: '2026.03', title: '정규 5집 ARIRANG 발매', detail: '2026.03.20 · 타이틀 SWIM · 총 14곡', href: 'https://ibighit.com/ko/bts/discography/detail/arirang' },
    { year: '2026–27', title: 'BTS WORLD TOUR ARIRANG', detail: '고양에서 시작 · 아시아·미주·유럽·호주 등', href: 'https://btsworldtourofficial.com/' },
    { year: '2026.07', title: 'NORMAL 뮤직비디오 스트리밍 기록', detail: 'Spotify K-pop 영상 공개 첫날 스트리밍 기록', href: 'https://newsroom.spotify.com/2026-07-18/bts-music-video-normal/' }
  ];
  const facts = {
    'RM': ['1994.09.12', 'A', 'RM'],
    '진': ['1992.12.04', 'O', 'Jin'],
    '슈가': ['1993.03.09', 'O', 'SUGA'],
    '제이홉': ['1994.02.18', 'A', 'j-hope'],
    '지민': ['1995.10.13', 'A', 'Jimin'],
    '뷔': ['1995.12.30', 'AB', 'V'],
    '정국': ['1997.09.01', 'A', 'JungKook']
  };
  for (const member of btsProfile.members) {
    const info = facts[member.name];
    if (!info) continue;
    member.birthday = info[0];
    member.bloodType = info[1];
    member.source = 'https://bts-official.jp/profile/' + info[2];
  }
  btsProfile.sources.unshift({ label: 'BTS 일본 공식 멤버 프로필 · 생일·혈액형', href: 'https://bts-official.jp/profile/' });
  btsProfile.sources.push({ label: 'BIGHIT MUSIC · ARIRANG', href: 'https://ibighit.com/ko/bts/discography/detail/arirang' });
  btsProfile.sources.push({ label: 'BTS WORLD TOUR 공식 일정', href: 'https://btsworldtourofficial.com/' });
}

/* SEVENTEEN: member birth dates from each official Japanese profile.
   Other personal data are unpublished or unverified and remain blank. */
const seventeenProfile = window.OJJUDA_FAN_PROFILES.seventeen;
if (seventeenProfile) {
  seventeenProfile.checkedAt = '2026.11.12';
  seventeenProfile.expanded = true;
  seventeenProfile.records = [
    { year: '2015.05', title: '17 CARAT로 데뷔', detail: '13명 · 보컬/힙합/퍼포먼스 3유닛 · 직접 제작에 참여', href: 'https://www.pledis.co.kr/artist/detail/seventeen/profile/' },
    { year: '2025.05', title: '정규 5집 HAPPY BURSTDAY', detail: '타이틀 THUNDER · 단체곡 3곡과 멤버 솔로 13곡', href: 'https://www.seventeen-17.jp/posts/discography/incaiv' },
    { year: '2026.10', title: '정한×조슈아 JxJ 유닛 DREAMSCAPE', detail: '타이틀 12 o’clock · 미니 1집 7곡', href: 'https://www.pledis.co.kr/en/artist/detail/seventeen/discography/?albumType=ALL' }
  ];
  const officialBirthdays = {
    '에스쿱스': ['1995.08.08', 'scoups'],
    '정한': ['1995.10.04', 'jeonghan'],
    '조슈아': ['1995.12.30', 'joshua'],
    '준': ['1996.06.10', 'jun'],
    '호시': ['1996.06.15', 'hoshi'],
    '원우': ['1996.07.17', 'wonwoo'],
    '우지': ['1996.11.22', 'woozi'],
    '디에잇': ['1997.11.07', 'the8'],
    '민규': ['1997.04.06', 'mingyu'],
    '도겸': ['1997.02.18', 'dk'],
    '승관': ['1998.01.16', 'seungkwan'],
    '버논': ['1998.02.18', 'vernon'],
    '디노': ['1999.02.11', 'dino']
  };
  for (const member of seventeenProfile.members) {
    const detail = officialBirthdays[member.name];
    if (!detail) continue;
    member.birthday = detail[0];
    member.source = 'https://www.seventeen-17.jp/pages/profile-' + detail[1];
  }
  seventeenProfile.sources.unshift({ label: 'SEVENTEEN 일본 공식 멤버 프로필 · 생일', href: 'https://www.seventeen-17.jp/pages/profile' });
  seventeenProfile.sources.push({ label: 'PLEDIS · SEVENTEEN 공식 프로필', href: 'https://www.pledis.co.kr/artist/detail/seventeen/profile/' });
  seventeenProfile.sources.push({ label: '일본 공식 일정 · 11월 공연', href: 'https://www.seventeen-17.jp/posts/schedule' });
}
