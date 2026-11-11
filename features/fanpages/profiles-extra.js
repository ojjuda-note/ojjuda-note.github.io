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

/* NMIXX: only publicly documented dates are filled. Unknown personal facts remain blank. */
const nmixxProfile = window.OJJUDA_FAN_PROFILES.nmixx;
if (nmixxProfile) {
  nmixxProfile.expanded = true;
  nmixxProfile.awards = [
    { year: '2026.09', title: '더팩트 뮤직 어워즈 대상', detail: 'Sound of the Year · 2026.09.19', href: 'https://www.soompi.com/article/1871808wpp/winners-of-2026-the-fact-music-awards' }
  ];
  nmixxProfile.records = [
    { year: '2026', title: '첫 월드투어 진행', detail: 'EPISODE 1: ZERO FRONTIER · 유럽·아시아 투어', href: 'https://www.livenation.nl/en/event/nmixx-1st-world-tour-episode-1-zero-frontier-in-amsterdam-amsterdam-tickets-edp1642212' }
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

/* KISS OF LIFE: official Japanese release milestones. Unpublished personal data remains blank. */
const kissoflifeProfile = window.OJJUDA_FAN_PROFILES.kissoflife;
if (kissoflifeProfile) {
  kissoflifeProfile.records = [
    { year: '2025.11', title: '일본 데뷔 미니앨범 발매', detail: 'TOKYO MISSION START · 2025.11.05', href: 'https://columbia.jp/artist-info/kissoflife/discography/album.html' },
    { year: '2026.09', title: '일본 두 번째 미니앨범 발매', detail: 'SWEAT -JAPANESE EP- · 2026.09.16', href: 'https://columbia.jp/artist-info/kissoflife/discography/COCP-42739.html' }
  ];
  const verifiedBirthdays = {
    '쥴리': '2000.03.29',
    '나띠': '2002.05.30',
    '벨': '2004.03.20',
    '하늘': '2005.05.25'
  };
  for (const member of kissoflifeProfile.members) {
    member.birthday = verifiedBirthdays[member.name] || null;
    member.source = 'https://s2ent.co.kr/34';
  }
  kissoflifeProfile.sources.unshift({ label: 'S2 공식 멤버 프로필·생일', href: 'https://s2ent.co.kr/34' });
  kissoflifeProfile.sources.unshift({ label: '일본 컬럼비아 공식 음반 정보', href: 'https://columbia.jp/artist-info/kissoflife/' });
}
