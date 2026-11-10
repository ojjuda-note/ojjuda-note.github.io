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
