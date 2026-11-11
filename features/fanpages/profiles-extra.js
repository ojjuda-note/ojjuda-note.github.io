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
