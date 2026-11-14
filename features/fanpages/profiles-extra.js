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


/* Stray Kids: JYP-published member birth dates; unknown personal facts stay blank. */
const strayKidsProfile = window.OJJUDA_FAN_PROFILES.straykids;
if (strayKidsProfile) {
  strayKidsProfile.expanded = true;
  strayKidsProfile.checkedAt = '2026.11.14';
  const birthdays = {
    '방찬': '1997.10.03', '리노': '1998.10.25', '창빈': '1999.08.11',
    '현진': '2000.03.20', '한': '2000.09.14', '필릭스': '2000.09.15',
    '승민': '2000.09.22', '아이엔': '2001.02.08'
  };
  for (const member of strayKidsProfile.members) {
    member.birthday = birthdays[member.name] || null;
    member.source = 'https://straykids.jype.com/profile';
  }
  strayKidsProfile.awards = [
    { year: '2026.01', title: '제40회 골든디스크 어워즈 음반 대상', detail: 'KARMA · 2026.01.10 타이베이 개최', href: 'https://www.soompi.com/article/1811420wpp/winners-of-40th-golden-disc-awards' },
    { year: '2026.03', title: '제40회 일본 골드 디스크 대상 4관왕', detail: 'Hollow 아시아 앨범 오브 더 이어 등 4개 부문', href: 'https://www.koreaherald.com/article/10692784' }
  ];
  strayKidsProfile.records = [
    { year: '2026.11', title: 'RUN IT 일본 투어 총 52만 관객', detail: '2026년 11월 6~8일 도쿄돔 포함 일본 4개 지역 10회 공연 완료 · JYP 공식 자료', href: 'https://straykids.jype.com/discography/ls6uuw6p' }
  ];
  strayKidsProfile.sources.unshift({ label: 'JYP 공식 멤버 프로필 · 생일', href: 'https://straykids.jype.com/profile' });
  strayKidsProfile.sources.push({ label: 'JYP 공식 최신 발매·공연 기록', href: 'https://straykids.jype.com/discography/ls6uuw6p' });
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
  idleProfile.awards = [
    { year: '2026.02', title: 'Mono 음악방송 3관왕', detail: '2.05 M COUNTDOWN · 2.06 MUSIC BANK · 2.08 인기가요 1위', href: 'https://i-dle.cubeent.co.jp/news/2639/' },
    { year: '2025.11', title: 'MAMA AWARDS FANS’ CHOICE', detail: '2025 MAMA AWARDS 팬스 초이스 수상 · 큐브 공식 보도', href: 'https://i-dle.cubeent.co.jp/news/2588/' }
  ];
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
  idleProfile.sources.push({ label: '큐브 일본 공식 Mono 음악방송 3관왕', href: 'https://i-dle.cubeent.co.jp/news/2639/' });
}

/* NMIXX: only publicly documented dates are filled. Unknown personal facts remain blank. */
const nmixxProfile = window.OJJUDA_FAN_PROFILES.nmixx;
if (nmixxProfile) {
  nmixxProfile.expanded = true;
  nmixxProfile.awards = [
    { year: '2026.09', title: '더팩트 뮤직 어워즈 대상', detail: 'Sound of the Year · 2026.09.19', href: 'https://www.soompi.com/article/1871808wpp/winners-of-2026-the-fact-music-awards' },
    { year: '2026.10', title: '대한민국 대중문화예술상 장관 표창', detail: '2026.10.29 제17회 시상식 · 문화체육관광부 장관 표창', href: 'https://recruit.jype.com/ko/news/61' }
  ];
  nmixxProfile.records = [
    { year: '2026', title: '첫 월드투어 진행', detail: 'EPISODE 1: ZERO FRONTIER · 유럽·아시아 투어', href: 'https://recruit.jype.com/ko/news/60' },
    { year: '2026.10', title: '월드투어 피날레 3회 전석 매진 발표', detail: '10.28 JYP 발표 기준 · 인천 11.27~29 공연', href: 'https://recruit.jype.com/ko/news/60' }
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
  nmixxProfile.sources.push({ label: 'JYP · 2026 대중문화예술상 장관 표창', href: 'https://recruit.jype.com/ko/news/61' });
}

/* BABYMONSTER: YG-published birthdays and seven-member debut; private details stay blank. */
const babymonsterProfile = window.OJJUDA_FAN_PROFILES.babymonster;
if (babymonsterProfile) {
  babymonsterProfile.expanded = true;
  babymonsterProfile.records = [
    { year: '2024.04', title: '7인조 정식 데뷔', detail: '미니 1집 BABYMONS7ER · SHEESH', href: 'https://ygfamily.com/ko/artists/babymonster/profile' },
    { year: '2026', title: '두 번째 월드투어', detail: '2026–27 춤 (CHOOM) · 아시아·오세아니아 공연', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
    { year: '2027.04', title: '코첼라 무대 출연 예정', detail: '2026.11.11 YG 발표 · 2027.04.11·18 미국 인디오', href: 'https://ygfamily.com/en/news/report/7601' }
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

/* Hearts2Hearts: 8 birthdays and group achievements confirmed by Japanese official profile.
   Unpublished height, blood type, MBTI, hometown and education remain unset. */
const hearts2heartsProfile = window.OJJUDA_FAN_PROFILES.hearts2hearts;
if (hearts2heartsProfile) {
  hearts2heartsProfile.expanded = true;
  hearts2heartsProfile.checkedAt = '2026.11.13';
  const officialBirthdays = {
    '지우': '2006.09.07',
    '카르멘': '2006.03.28',
    '유하': '2007.04.12',
    '스텔라': '2007.06.18',
    '주은': '2008.12.03',
    '에이나': '2008.12.20',
    '이안': '2009.10.09',
    '예온': '2010.04.19'
  };
  for (const member of hearts2heartsProfile.members) {
    member.birthday = officialBirthdays[member.name] || null;
    member.source = 'https://hearts2heartsofficial.jp/profile/';
  }
  hearts2heartsProfile.awards = [
    { year: '2025', title: '신인상 9관왕', detail: '2025년 데뷔 K-pop 아티스트 중 최다 신인상 · 일본 공식 프로필', href: 'https://hearts2heartsofficial.jp/profile/' }
  ];
  hearts2heartsProfile.records = [
    { year: '2026', title: 'The Chase·STYLE Spotify 각각 1억 재생', detail: '2025년 데뷔 K-pop 걸그룹 최초 기록 · 일본 공식 소개', href: 'https://hearts2heartsofficial.jp/profile/' },
    { year: '2026.02', title: 'RUDE! 음악방송 5관왕', detail: '공식 소개의 차트·음악방송 기록', href: 'https://hearts2heartsofficial.jp/profile/' },
    { year: '2026.08', title: '일본 정식 데뷔', detail: '첫 일본 싱글 ICONIC HEART · 2026.08.12', href: 'https://hearts2heartsofficial.jp/news/2026081203/' },
    { year: '2026.11', title: '일본 첫 팬 이벤트', detail: 'READY! S2U · 도쿄 아리아케 아레나 11.22~23', href: 'https://hearts2heartsofficial.jp/news/2026081203/' }
  ];
  hearts2heartsProfile.sources.unshift({ label: 'Hearts2Hearts 일본 공식 프로필 · 8명 생일·수상·차트', href: 'https://hearts2heartsofficial.jp/profile/' });
  hearts2heartsProfile.sources.push({ label: '일본 공식 활동 · ANIMAX MUSIX·티니핑 협업', href: 'https://hearts2heartsofficial.jp/news/2026090802/' });
}

/* BLACKPINK: YG-published member birthdays; no inferred physical or school details. */
const blackpinkProfile = window.OJJUDA_FAN_PROFILES.blackpink;
if (blackpinkProfile) {
  blackpinkProfile.expanded = true;
  blackpinkProfile.checkedAt = '2026.11.14';
  blackpinkProfile.records = [
    { year: '2026.02', title: '유튜브 공식 아티스트 채널 최초 1억 구독자', detail: '2026.02.20 달성 · 유튜브 레드 다이아몬드 크리에이터 어워드', href: 'https://en.yna.co.kr/view/AEN20260221002851320' },
    { year: '2025–2026', title: '월드투어 DEADLINE', detail: '16개 도시·33회 공연 후 2026년 1월 종료', href: 'https://www.ygfamily.com/en/news/report/7378' }
  ];
  blackpinkProfile.awards = [
    { year: '2026.01', title: '제40회 골든디스크 어워즈 디지털 음원 본상', detail: 'YG 공식 수상 이력', href: 'https://ygfamily.com/ko/artists/blackpink/profile' },
    { year: '2025.12', title: '2025 AAA · 10 레전더리 여자그룹', detail: 'YG 공식 수상 이력', href: 'https://ygfamily.com/ko/artists/blackpink/profile' }
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
  btsProfile.checkedAt = '2026.11.14';
  btsProfile.expanded = true;
  btsProfile.records = [
    { year: '2026.07', title: 'FIFA 월드컵 결승 하프타임 공연', detail: '2026.07.19 · 미국 메트라이프 스타디움 · FIFA 공식 무대 공개', href: 'https://www.youtube.com/watch?v=qUzSrkIuP0U' },
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
  seventeenProfile.checkedAt = '2026.11.14';
  seventeenProfile.expanded = true;
  seventeenProfile.records = [
    { year: '2015.05', title: '17 CARAT로 데뷔', detail: '13명 · 보컬/힙합/퍼포먼스 3유닛 · 직접 제작에 참여', href: 'https://www.pledis.co.kr/artist/detail/seventeen/profile/' },
    { year: '2025.05', title: '정규 5집 HAPPY BURSTDAY', detail: '타이틀 THUNDER · 단체곡 3곡과 멤버 솔로 13곡', href: 'https://www.seventeen-17.jp/posts/discography/incaiv' },
    { year: '2026.10', title: '정한×조슈아 JxJ 유닛 DREAMSCAPE', detail: '타이틀 12 o’clock · 미니 1집 7곡', href: 'https://www.pledis.co.kr/en/artist/detail/seventeen/discography/?albumType=ALL' },
    { year: '2026.10', title: 'JxJ DREAMSCAPE · 일본 골드 인증', detail: '10월도 일본 레코드협회 골드 디스크(누적 10만 장 이상 출하) · 11/11 공식 발표', href: 'https://www.seventeen-17.jp/posts/information/hheyrw' }
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

// Official source rechecked 2026-11-12.
const twsProfile = window.OJJUDA_FAN_PROFILES.tws;
if (twsProfile) {
  twsProfile.expanded = true;
  twsProfile.checkedAt = '2026.11.12';
  twsProfile.records = [
    { year: '2024.01', title: 'Sparkling Blue 데뷔', detail: '2024.01.22 데뷔 미니앨범 · 5곡', href: 'https://music.apple.com/us/album/sparkling-blue/1723932647' },
    { year: '2026.11', title: 'TO US 두 번째 싱글', detail: '11월 2일 발매 · 3곡', href: 'https://music.apple.com/us/album/to-us-single/6818392534' }
  ];
  const twsBirthdays = {
    '신유': '2003.11.07', '도훈': '2005.01.30', '영재': '2005.05.31',
    '한진': '2006.01.05', '지훈': '2006.03.28', '경민': '2007.10.02'
  };
  for (const member of twsProfile.members) {
    member.birthday = twsBirthdays[member.name] || null;
    member.source = 'https://tws-official.jp/profile/';
  }
  twsProfile.sources.unshift({ label: 'TWS 일본 공식 그룹 소개', href: 'https://tws-official.jp/profile/' });
  twsProfile.sources.push({ label: 'TWS 일본 공식 멤버 생일', href: 'https://tws-official.jp/profile/' });
  twsProfile.sources.push({ label: 'Apple Music · TO US 음반', href: 'https://music.apple.com/us/album/to-us-single/6818392534' });
}

// Official source rechecked 2026-11-12.
const nctdreamProfile = window.OJJUDA_FAN_PROFILES.nctdream;
if (nctdreamProfile) {
  nctdreamProfile.expanded = true;
  nctdreamProfile.checkedAt = '2026.11.12';
  nctdreamProfile.records = [
    { year: '2026.11', title: '정규 6집 DREAM AFTER DREAM', detail: '2026.11.09 발매 · 타이틀 Boogie Woogie · 10곡', href: 'https://music.apple.com/us/album/dream-after-dream/6827483714' },
    { year: '2026.11', title: '일본 공연 출연', detail: '11.22 TV아사히 드림 페스티벌 출연', href: 'https://nct-jp.net/en/news/detail.php?id=1135918' }
  ];
  nctdreamProfile.sources.unshift({ label: 'NCT 일본 공식 소식 · 음반·활동 일정', href: 'https://nct-jp.net/news/' });
  nctdreamProfile.sources.push({ label: 'SM 공식 음반 유통 · DREAM AFTER DREAM', href: 'https://music.apple.com/us/album/dream-after-dream/6827483714' });
}

// Official source rechecked 2026-11-12.
const ateezProfile = window.OJJUDA_FAN_PROFILES.ateez;
if (ateezProfile) {
  ateezProfile.expanded = true;
  ateezProfile.checkedAt = '2026.11.12';
  const ateezBirthdays = {
    '홍중': '1998.11.07', '성화': '1998.04.03', '윤호': '1999.03.23', '여상': '1999.06.15',
    '산': '1999.07.10', '민기': '1999.08.09', '우영': '1999.11.26', '종호': '2000.10.12'
  };
  for (const member of ateezProfile.members) {
    member.birthday = ateezBirthdays[member.name] || null;
    member.source = 'https://ateez-official.jp/profiles';
  }
  ateezProfile.awards = []; // Primary award announcement still unverified.
  ateezProfile.records = [
    { year: '2026', title: 'GOLDEN HOUR : Part.5 발매', detail: '2026.06.26 미니 14집 · 타이틀 BAD', href: 'https://ateez-official.jp/musics/20862' },
    { year: '2027', title: 'ZERO TO ALL 월드투어 예정', detail: '인천 1.22~24·일본 2월·유럽 3~4월 공식 발표', href: 'https://ateez.kqent.com/en/contents/6ac915ceb899027df4664814' }
  ];
  ateezProfile.sources.unshift({ label: 'ATEEZ 일본 공식 8인 프로필 · 생일', href: 'https://ateez-official.jp/profiles' });
  ateezProfile.sources.push({ label: 'KQ 2027 ZERO TO ALL 투어 공식 발표', href: 'https://ateez.kqent.com/en/contents/6ac915ceb899027df4664814' });
}

// Official source rechecked 2026-11-12.
const treasureProfile = window.OJJUDA_FAN_PROFILES.treasure;
if (treasureProfile) {
  treasureProfile.checkedAt = '2026.11.12';
  treasureProfile.expanded = true;
  const birthdays = {
    '최현석': '1999.04.21', '지훈': '2000.03.14', '요시': '2000.05.15',
    '준규': '2000.09.09', '윤재혁': '2001.07.23', '아사히': '2001.08.20',
    '도영': '2003.12.04', '하루토': '2004.04.05', '박정우': '2004.09.28',
    '소정환': '2005.02.18'
  };
  for (const member of treasureProfile.members) {
    member.birthday = birthdays[member.name] || null;
    member.source = 'https://ygfamily.com/ko/artists/treasure/profile';
  }
  treasureProfile.awards = [
    { year: '2023.01', title: '골든디스크 어워즈 베스트 그룹', detail: 'YG 공식 수상 이력', href: 'https://ygfamily.com/ko/artists/treasure/profile' },
    { year: '2021.01', title: '서울가요대상 신인상', detail: '제30회 · YG 공식 수상 이력', href: 'https://ygfamily.com/ko/artists/treasure/profile' }
  ];
  treasureProfile.records = [
    { year: '2020.08', title: 'THE FIRST STEP : CHAPTER ONE 데뷔', detail: '2020.08.07 · BOY', href: 'https://ygfamily.com/ko/artists/treasure/profile' },
    { year: '2026.06', title: '4번째 미니앨범 NEW WAV', detail: '타이틀 IF I 포함 4곡', href: 'https://www.ygfamily.com/en/artists/treasure/discography/1660' }
  ];
  treasureProfile.sources.unshift({ label: 'YG 공식 프로필 · 멤버 생일·수상', href: 'https://ygfamily.com/ko/artists/treasure/profile' });
  treasureProfile.sources.push({ label: 'YG 공식 최신 음반 정보', href: 'https://www.ygfamily.com/en/artists/treasure/discography' });
}

// Official source rechecked 2026-11-12.
const nctwishProfile = window.OJJUDA_FAN_PROFILES.nctwish;
if (nctwishProfile) {
  nctwishProfile.expanded = true;
  const nctwishBirthdays = {
    '시온': '2002.05.11', '리쿠': '2003.06.28', '유우시': '2004.04.05',
    '재희': '2005.06.21', '료': '2007.08.04', '사쿠야': '2007.11.18'
  };
  for (const member of nctwishProfile.members) {
    member.birthday = nctwishBirthdays[member.name] || null;
    member.source = 'https://world.kbs.co.kr/service/contents_view.htm?board_seq=450066&lang=j';
  }
  nctwishProfile.records = [
    { year: '2026.10', title: '미니 4집 I SPY 발매', detail: '2026.10.12 정식 발매 · 총 6곡 · SM ENTERTAINMENT 공식 음반 정보', href: 'https://smtownandstore.com/product/nct-wish-the-4th-mini-album-i-spy-deluxe-book-ver/29341/category/53/display/1/' },
    { year: '2026.11', title: '첫 일본 전국 아레나 투어 발표', detail: '2027.02~03 도쿄·고베·후쿠오카·아이치 10회 확정', href: 'https://www.nct-jp.net/news/detail.php?id=1137082' }
  ];
  nctwishProfile.sources.unshift({ label: 'KBS WORLD 공식 아티스트 소개 · 멤버 생일 및 발매일', href: 'https://world.kbs.co.kr/service/contents_view.htm?board_seq=450066&lang=j' });
  nctwishProfile.sources.unshift({ label: 'NCT 일본 공식 소개 · 데뷔 일자', href: 'https://www.nct-jp.net/profile/' });
  nctwishProfile.sources.push({ label: 'SM 공식 4집 음반·트랙리스트', href: 'https://smtownandstore.com/product/nct-wish-the-4th-mini-album-i-spy-deluxe-book-ver/29341/category/53/display/1/' });
}

// Official source rechecked 2026-11-12.
const andteamProfile = window.OJJUDA_FAN_PROFILES.andteam;
if (andteamProfile) {
  andteamProfile.checkedAt = '2026.11.12';
  andteamProfile.expanded = true;
  andteamProfile.records = [
    { year: '2022.12', title: '일본 데뷔', detail: 'First Howling : ME · Under the skin', href: 'https://www.andteam-official.jp/news/owsyjh' },
    { year: '2026–2027', title: 'Mark on You 일본 투어', detail: '홀·아레나 공연 · 변경은 공식 일정 확인', href: 'https://www.andteam-official.jp/news/dd0f71998bc8' }
  ];
  const officialMembers = {
    '의주': ['2002.09.07', 'EJ'],
    '후마': ['1998.06.29', 'FUMA'],
    '케이': ['1997.10.21', 'K'],
    '니콜라스': ['2002.07.09', 'NICHOLAS'],
    '유마': ['2004.02.07', 'YUMA'],
    '조': ['2004.07.08', 'JO'],
    '하루아': ['2005.05.01', 'HARUA'],
    '타키': ['2005.05.04', 'TAKI'],
    '마키': ['2006.02.17', 'MAKI']
  };
  for (const member of andteamProfile.members) {
    const official = officialMembers[member.name];
    if (!official) continue;
    member.birthday = official[0];
    member.source = 'https://www.andteam-official.jp/profile/' + official[1];
  }
  andteamProfile.sources.unshift({ label: '&TEAM 일본 공식 멤버 프로필 · 생일', href: 'https://www.andteam-official.jp/profile' });
  andteamProfile.sources.push({ label: '&TEAM 공식 2026 음반·곡 목록', href: 'https://www.andteam-official.jp/discography' });
  andteamProfile.sources.push({ label: '2026–2027 Mark on You 공식 공연 일정', href: 'https://www.andteam-official.jp/news/021ab1de6a61' });
}

// All six pending artist profiles were rechecked against primary sources.
for (const id of ['tws','nctdream','ateez','treasure','nctwish','andteam']) window.OJJUDA_FAN_PROFILES[id].checkedAt = '2026.11.13';

/* KISS OF LIFE: verified 2026 music and official Japanese source; unknown personal data remain blank. */
const kissOfLifeProfile = window.OJJUDA_FAN_PROFILES.kissoflife;
if (kissOfLifeProfile) {
  kissOfLifeProfile.expanded = true;
  kissOfLifeProfile.checkedAt = '2026.11.13';
  const officialBirthdays = { '쥴리': '2000.03.29', '나띠': '2002.05.30', '벨': '2004.03.20', '하늘': '2005.05.25' };
  for (const member of kissOfLifeProfile.members) {
    member.birthday = officialBirthdays[member.name] || null;
    member.source = 'https://s2ent.co.kr/34';
  }
  kissOfLifeProfile.sources.unshift({ label: 'S2엔터테인먼트 공식 멤버 생일', href: 'https://s2ent.co.kr/34' });
  kissOfLifeProfile.awards = [
    { year: '2026.09', title: '2026 SPOTV K-POP AWARDS 본상', detail: 'Artist of the Year (Bonsang) · 2026.09.06', href: 'https://www.soompi.com/article/1868372wpp/winners-of-2026-spotv-k-pop-awards' },
    { year: '2026.09', title: '2026 SPOTV K-POP AWARDS 베스트 여자 그룹상', detail: 'Best Female Group · 2026.09.06', href: 'https://www.soompi.com/article/1868372wpp/winners-of-2026-spotv-k-pop-awards' }
  ];
  kissOfLifeProfile.records = [
    { year: '2025.11', title: '일본 음반 데뷔', detail: 'TOKYO MISSION START · 일본 컬럼비아', href: 'https://columbia.jp/artist-info/kissoflife/discography/album.html' },
    { year: '2026.09', title: '일본 미니 2집 발매', detail: 'SWEAT -JAPANESE EP- · 6곡', href: 'https://columbia.jp/artist-info/kissoflife/discography/album.html' }
  ];
  kissOfLifeProfile.sources.unshift({ label: '일본 컬럼비아 공식 발매·트랙리스트', href: 'https://columbia.jp/artist-info/kissoflife/discography/album.html' });
  kissOfLifeProfile.sources.push({ label: 'AAA 2026 공식 출연 명단', href: 'https://www.asiaartistawards.com/en/news/3225' });
}



/* KiiiKiii: only officially published group achievements; personal details remain unknown. */
const kiiikiiiProfile = window.OJJUDA_FAN_PROFILES.kiiikiii;
if (kiiikiiiProfile) {
  kiiikiiiProfile.records = [
    { year: '2025', title: '데뷔 첫해 신인상 7개', detail: '서울시 공식 발표 · 시상 내역 상세는 원문 확인', href: 'https://mediahub.seoul.go.kr/archives/2016856' },
    { year: '2026.02', title: '404 (New Era) 멜론 TOP100 1위', detail: '카카오엔터테인먼트 발표 · 발매 16일 만에 1위', href: 'https://newsroom.kakaoent.com/news/mma2026-welcomes-more-k-pop-heavyweights/' }
  ];
  kiiikiiiProfile.sources.unshift({ label: 'STARSHIP 공식 앨범·아티스트 프로필', href: 'https://www.starship-ent.com/musician/kiiikiii' });
  kiiikiiiProfile.sources.push({ label: '서울시 홍보대사·수상 이력', href: 'https://mediahub.seoul.go.kr/archives/2016856' });
  kiiikiiiProfile.sources.push({ label: '카카오엔터테인먼트 활동·차트', href: 'https://newsroom.kakaoent.com/news/mma2026-welcomes-more-k-pop-heavyweights/' });
}


/* STAYC: birthdays are publicly provided by the agency; other personal fields stay blank. */
const staycProfile = window.OJJUDA_FAN_PROFILES.stayc;
if (staycProfile) {
  staycProfile.expanded = true;
  const birthdays = {
    '수민': '2001.03.13',
    '시은': '2001.08.01',
    '아이사': '2002.01.23',
    '세은': '2003.06.14',
    '윤': '2004.04.14',
    '재이': '2004.12.09'
  };
  for (const member of staycProfile.members) {
    member.birthday = birthdays[member.name] || null;
    member.source = 'https://www.highup-ent.com/en/stayc/';
  }
  staycProfile.records = [
    { year: '2026.08–10', title: 'STAY CLOSER · 8도시 팬콘 투어', detail: '서울 8/22~23 개막 · 마닐라·마카오·타이베이·퍼스·멜버른·시드니·홍콩(10/24 추가 공연)까지', href: 'https://stayc.lnk.to/tour' }
  ];
  staycProfile.sources.push({ label: 'STAY CLOSER 공식 투어 일정 · 홍콩 추가 공연', href: 'https://stayc.lnk.to/tour' });
  staycProfile.sources.unshift({ label: '하이업엔터테인먼트 공식 멤버 소개·생일', href: 'https://www.highup-ent.com/en/stayc/' });
  staycProfile.sources.push({ label: '공식 2:LOVE 음반·트랙리스트', href: 'https://www.highup-ent.com/stayc/2love/' });
}


/* RIIZE: birthdays verified from six official Japan member profiles. */
const riizeProfile = window.OJJUDA_FAN_PROFILES.riize;
if (riizeProfile) {
  riizeProfile.expanded = true;
  const officialBirthdays = {
    '쇼타로': ['2000.11.25', 'shotaro'],
    '은석': ['2001.03.19', 'eunseok'],
    '성찬': ['2001.09.13', 'sungchan'],
    '원빈': ['2002.03.02', 'wonbin'],
    '소희': ['2003.11.21', 'sohee'],
    '앤톤': ['2004.03.21', 'anton']
  };
  for (const member of riizeProfile.members) {
    const info = officialBirthdays[member.name];
    if (!info) continue;
    member.birthday = info[0];
    member.source = 'https://riizeofficial.jp/profile/' + info[1] + '/';
  }
  riizeProfile.records = [
    { year: '2026.05', title: '일본 싱글 All of You 더블 플래티넘 인증', detail: '일본레코드협회 골드디스크 더블 플래티넘 인증 · 2026.05.14 공식 발표', href: 'https://riizeofficial.jp/news/20260514/' },
    { year: '2026.08', title: '일본 싱글 3집 Sunburst 발매', detail: '2026.08.26 CD 발매 · Sunburst/Rise Over/KILL SHOT', href: 'https://riizeofficial.jp/discography/sunburst_normal/' }
  ];
  riizeProfile.sources.unshift({ label: 'RIIZE 일본 공식 6인 프로필 · 생일', href: 'https://riizeofficial.jp/profile/' });
  riizeProfile.sources.push({ label: 'RIIZE 일본 공식 음반 목록', href: 'https://riizeofficial.jp/discography/' });
}


/* BOYNEXTDOOR: member birth dates from KOZ's official group profile (2026-11-12). */
const boynextdoorProfile = window.OJJUDA_FAN_PROFILES.boynextdoor;
if (boynextdoorProfile) {
  boynextdoorProfile.expanded = true;
  const officialBirthdays = {
    '성호': '2003.09.04', '리우': '2003.10.22', '명재현': '2003.12.04',
    '태산': '2004.08.10', '이한': '2004.10.20', '운학': '2006.11.29'
  };
  for (const member of boynextdoorProfile.members) {
    member.birthday = officialBirthdays[member.name] || null;
    member.source = 'https://kozofficial.com/artist/profile/BOYNEXTDOOR';
  }
  boynextdoorProfile.awards = [
    { year: '2026', title: '40회 골든디스크어워즈 음원 본상 · 네이버 AI Choice', href: 'https://enews.imbc.com/News/RetrieveNewsInfo/490432' }
  ];
  boynextdoorProfile.sources.push(
    { label: 'KOZ 공식 그룹 프로필 · 멤버 생일', href: 'https://kozofficial.com/artist/profile/BOYNEXTDOOR' },
    { label: 'KOZ 공식 정규 1집 트랙리스트', href: 'https://www.kozofficial.com/artist/discography/BOYNEXTDOOR/32' },
    { label: 'BOYNEXTDOOR 일본 공식 일정', href: 'https://boynextdoor-official.jp/Schedule' }
  );
}

// Pending PR reconciliation: only the eight manually reviewed profiles.
for (const id of ["hearts2hearts", "kissoflife", "kiiikiii", "stayc", "seventeen", "enhypen", "riize", "boynextdoor"]) window.OJJUDA_FAN_PROFILES[id].checkedAt = '2026.11.13';

// STAYC was reviewed again against official sources for the current slot.
window.OJJUDA_FAN_PROFILES.stayc.checkedAt = '2026.11.14';
// SEVENTEEN reviewed in n=48 without modifying other groups.
window.OJJUDA_FAN_PROFILES.seventeen.checkedAt = '2026.11.14';
// RIIZE-only recheck after the earlier cross-group review stamp.
window.OJJUDA_FAN_PROFILES.riize.checkedAt = '2026.11.14';
