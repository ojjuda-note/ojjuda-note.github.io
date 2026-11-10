/* Curated photographs and source links. Keep dates tied to their sources; this is not a live feed. */
const commonsPhoto = (file, label, year, author, license = 'CC BY 4.0') => {
  const name = encodeURIComponent(file.replaceAll(' ', '_'));
  const licenseUrl = license === 'CC BY 3.0'
    ? 'https://creativecommons.org/licenses/by/3.0/'
    : license === 'CC BY-SA 4.0'
      ? 'https://creativecommons.org/licenses/by-sa/4.0/'
      : 'https://creativecommons.org/licenses/by/4.0/';
  return {
    label,
    meta: `${year} · PHOTO`,
    image: `https://commons.wikimedia.org/wiki/Special:FilePath/${name}?width=960`,
    full: `https://commons.wikimedia.org/wiki/Special:FilePath/${name}?width=1920`,
    href: `https://commons.wikimedia.org/wiki/File:${name}`,
    credit: author,
    license,
    licenseUrl,
  };
};
window.OJJUDA_FAN_ARTISTS = [
  {
    id: "rescene", name: "RESCENE", korean: "리센느", fan: "REMINE", agency: "THE MUZE", members: ["원이", "리브", "미나미", "메이", "제나"],
    accent: "#7956a7", light: "#eee1fa", dark: "#48325f", shape: "✳", status: "PULSE · 2026.11.03",
    image: "https://pbs.twimg.com/media/HNbGjvlaEAAXooN.jpg", imageCredit: "RESCENE OFFICIAL X", imageLink: "https://x.com/RESCENEofficial",
    photos: [
      { label: "Pretty Girl", meta: "2026 · OFFICIAL", image: "https://pbs.twimg.com/media/HNbGjvlaEAAXooN.jpg", href: "https://x.com/RESCENEofficial", credit: "RESCENE 공식 X" },
      { label: "lip bomb", meta: "2025 · OFFICIAL", image: "https://pbs.twimg.com/media/G6iDfUgbAAAhZyt.jpg", href: "https://x.com/RESCENEofficial", credit: "RESCENE 공식 X" },
      { label: "Re:Scene", meta: "2024 · OFFICIAL", image: "https://pbs.twimg.com/media/GHeLpKIb0AAGZdc.jpg", href: "https://x.com/RESCENEofficial/status/1763036399006327254", credit: "RESCENE 공식 X" },
      commonsPhoto('RESCENE at Incheon Airport, 12 August 2026.png', '인천공항 · 단체', '2026', 'K-POPIT 케이팝잇'),
      commonsPhoto('Woni of RESCENE at Incheon Airport, 12 August 2026.png', '원이 · 공항', '2026', 'K-POPIT 케이팝잇'),
      commonsPhoto('Liv of RESCENE at Incheon Airport, 12 August 2026.png', '리브 · 공항', '2026', 'K-POPIT 케이팝잇'),
      commonsPhoto('Minami of RESCENE at Incheon Airport, 12 August 2026.png', '미나미 · 공항', '2026', 'K-POPIT 케이팝잇'),
      commonsPhoto('May of RESCENE at Incheon Airport, 12 August 2026.png', '메이 · 공항', '2026', 'K-POPIT 케이팝잇'),
      commonsPhoto('Zena of RESCENE at Incheon Airport, 12 August 2026.png', '제나 · 공항', '2026', 'K-POPIT 케이팝잇'),
      commonsPhoto('Rescene 250205.jpg', '2025 · 단체', '2025', '티비텐 TV10', 'CC BY 3.0')
    ],
    links: [
      { label: "Instagram", icon: "◎", url: "https://www.instagram.com/rescene_official/" },
      { label: "YouTube", icon: "▷", url: "https://www.youtube.com/@RESCENE_official" },
      { label: "X 공식", icon: "𝕏", url: "https://x.com/RESCENEofficial" },
      { label: "Mnet Plus", icon: "✦", url: "https://artist.mnetplus.world/main/stg/rescene-official" }
    ],
    merch: [
      { title: "PULSE", sub: "4th Mini Album", href: "https://artist.mnetplus.world/main/stg/rescene-official/contents/6acda1b99b432c2a150adc7a" },
      { title: "LIGHT STICK V2", sub: "Official Goods", href: "https://kplaceshop.com/products/rescene-official-light-stick-ver-2" }
    ],
    schedules: [
      { title: "공식 스케줄", sub: "Mnet Plus", href: "https://artist.mnetplus.world/main/stg/rescene-official/schedule/2026/11" },
      { title: "더쇼 · 11.10", sub: "참여 안내", href: "https://artist.mnetplus.world/main/stg/rescene-official/surveys/6af01659da3bdb578b5182ae" }
    ],
    news: [
      { date: "11.10", tag: "방송", title: "〈더쇼〉 사전 녹화·생방송", href: "https://artist.mnetplus.world/main/stg/rescene-official/surveys/6af01659da3bdb578b5182ae" },
      { date: "11.03", tag: "앨범", title: "4th Mini Album [PULSE]", href: "https://artist.mnetplus.world/main/stg/rescene-official/contents/6acda1b99b432c2a150adc7a" },
      { date: "10.19", tag: "사진", title: "PULSE 콘셉트 포토 A", href: "https://artist.mnetplus.world/main/stg/rescene-official/contents/6ad5d55f71a55b46a7487eb5" }
    ]
  },
  {
    id: "ive", name: "IVE", korean: "아이브", fan: "DIVE", agency: "STARSHIP", members: ["안유진", "가을", "레이", "장원영", "리즈", "이서"],
    accent: "#ab5b80", light: "#ffede9", dark: "#63354e", shape: "♡", status: "REVIVE+ · 2026",
    image: "https://imagedelivery.net/l1Bzo8LRyoaogf5OFVsfnA/600802b6-5256-4afe-dfe1-ad4eab2b0600/public", imageCredit: "K-POPIT / IVE", imageLink: "https://k-popit.com/articles/2026092890542",
    photos: [
      { label: "IVE · Group", meta: "2026 · PHOTO", image: "https://imagedelivery.net/l1Bzo8LRyoaogf5OFVsfnA/600802b6-5256-4afe-dfe1-ad4eab2b0600/public", href: "https://k-popit.com/articles/2026092890542", credit: "K-POPIT" },
      commonsPhoto('Ive in Seattle.jpg', '시애틀 공연', '2026', 'David Lee'),
      commonsPhoto('Ive at the 2026 Golden Disc Awards.png', '골든디스크 · 무대', '2026', '티비텐 TV10'),
      commonsPhoto('Ive at the 40th Golden Disc Awards, January 10, 2026 (2).png', '골든디스크 · 레드카펫', '2026', 'K-POPIT 케이팝잇'),
      commonsPhoto('Ive at the 2024 Melon Music Awards.png', '멜론뮤직어워드', '2024', 'K-POPIT 케이팝잇', 'CC BY 3.0'),
      commonsPhoto('IVE 2024 MMA 1.jpg', 'IVE · 2024 MMA', '2024', '10Asia', 'CC BY 3.0'),
      commonsPhoto('An Yu-jin of Ive, April 19, 2025.png', '안유진 · 포토월', '2025', 'K-POPIT 케이팝잇', 'CC BY 3.0')
    ],
    links: [
      { label: "Instagram", icon: "◎", url: "https://www.instagram.com/ivestarship/" },
      { label: "YouTube", icon: "▷", url: "https://www.youtube.com/@IVEstarship" },
      { label: "X 공식", icon: "𝕏", url: "https://x.com/IVEstarship" },
      { label: "Berriz", icon: "✦", url: "https://link.berriz.in/web/main/IVE" }
    ],
    merch: [
      { title: "STARSHIP SQUARE", sub: "앨범·공식 굿즈", href: "https://www.starship-square.com/product/list.html?cate_no=57" },
      { title: "IVE OFFICIAL", sub: "소속사 아티스트", href: "https://www.starship-ent.com/musician/ive" }
    ],
    schedules: [
      { title: "실시간 일정", sub: "blip", href: "https://blip.kr/artists/IVE/schedule?unitId=85" },
      { title: "공식 커뮤니티", sub: "Berriz", href: "https://link.berriz.in/web/main/IVE" }
    ],
    news: [
      { date: "10.26", tag: "앨범", title: "IVE THE 2ND ALBUM REVIVE+", href: "https://www.starship-ent.com/musician/ive" },
      { date: "공식", tag: "공지", title: "IVE 공식 커뮤니티", href: "https://link.berriz.in/web/main/IVE" }
    ]
  },
  {
    id: "aespa", name: "aespa", korean: "에스파", fan: "MY", agency: "SM ENTERTAINMENT", members: ["카리나", "지젤", "윈터", "닝닝"],
    accent: "#4b67aa", light: "#dce7ff", dark: "#242b55", shape: "✦", status: "LEMONADE · 2026",
    image: "https://pub-dc9a9c6ac2a64ba48bce426ced0ac56a.r2.dev/groups/aespa/profile.jpg?v=1778208612013", imageCredit: "kpopping / aespa", imageLink: "https://kpopping.com/kpics/aespa-2026-Season-s-Greetings-Western-House-Teaser",
    photos: [
      { label: "Western House", meta: "2026 · CONCEPT", image: "https://pub-dc9a9c6ac2a64ba48bce426ced0ac56a.r2.dev/groups/aespa/profile.jpg?v=1778208612013", href: "https://kpopping.com/kpics/aespa-2026-Season-s-Greetings-Western-House-Teaser", credit: "kpopping" },
      commonsPhoto('Aespa at Mise-en-Scene event on 19022026 (1).png', '미장센 · 포토월 01', '2026', '티비텐 TV10'),
      commonsPhoto('Aespa at Mise-en-Scene event on 19022026 (2).png', '미장센 · 포토월 02', '2026', '티비텐 TV10'),
      commonsPhoto('Aespa at Mise-en-Scene event on 19022026 (3).png', '미장센 · 포토월 03', '2026', '티비텐 TV10'),
      commonsPhoto('Aespa at Mise-en-Scene event on 19022026 (4).png', '미장센 · 포토월 04', '2026', '티비텐 TV10'),
      commonsPhoto('Aespa at Mise-en-Scene event on 19022026 (5).png', '미장센 · 포토월 05', '2026', '티비텐 TV10'),
      commonsPhoto('Aespa at Mise-en-Scene event on 19022026 (7).png', '미장센 · 포토월 07', '2026', '티비텐 TV10')
    ],
    links: [
      { label: "Instagram", icon: "◎", url: "https://www.instagram.com/aespa_official/" },
      { label: "YouTube", icon: "▷", url: "https://www.youtube.com/@aespa" },
      { label: "X 공식", icon: "𝕏", url: "https://x.com/aespa_official" },
      { label: "Weverse", icon: "✦", url: "https://weverse.io/aespa/feed" }
    ],
    merch: [
      { title: "Weverse Shop", sub: "공식 굿즈", href: "https://shop.weverse.io/ko/shop/KRW/artists/133" },
      { title: "SMTOWN SHOP", sub: "앨범·MD", href: "https://global.shop.smtown.com/collections/aespa" }
    ],
    schedules: [
      { title: "공식 공지", sub: "Weverse", href: "https://weverse.io/aespa/highlight" },
      { title: "팬 커뮤니티", sub: "Weverse", href: "https://weverse.io/aespa/feed" }
    ],
    news: [
      { date: "2026", tag: "팬미팅", title: "MY 보고싶다 ae가 · 공지", href: "https://weverse.io/aespa/highlight" },
      { date: "2026", tag: "굿즈", title: "aesParty 공식 MD 안내", href: "https://weverse.io/aespa/notice/38335" }
    ]
  },
  {
    id: "lesserafim", name: "LE SSERAFIM", korean: "르세라핌", fan: "FEARNOT", agency: "SOURCE MUSIC", members: ["김채원", "사쿠라", "허윤진", "카즈하", "홍은채"],
    accent: "#c63d38", light: "#f2ede8", dark: "#27262a", shape: "✶", status: "FEARNOT · OFFICIAL",
    image: "https://cloudfront-ap-northeast-1.images.arcpublishing.com/chosun/G5RDQNLDGE2WMMLGME3DAMLFHE.jpg", imageCredit: "조선 / SOURCE MUSIC", imageLink: "https://www.chosun.com/english/kpop-culture-en/2026/07/02/HEG2E7HZ3ZFPVE6TKQ7UKYDSEY/",
    photos: [
      { label: "Pureflow", meta: "2026 · PHOTO", image: "https://cloudfront-ap-northeast-1.images.arcpublishing.com/chosun/G5RDQNLDGE2WMMLGME3DAMLFHE.jpg", href: "https://www.chosun.com/english/kpop-culture-en/2026/07/02/HEG2E7HZ3ZFPVE6TKQ7UKYDSEY/", credit: "조선" },
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54795963237).jpg', '시애틀 투어 01', '2025', 'David Lee'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54795963367).jpg', '시애틀 투어 02', '2025', 'David Lee'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54795963372).jpg', '시애틀 투어 03', '2025', 'David Lee'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54795963817).jpg', '시애틀 투어 04', '2025', 'David Lee'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54795963857).jpg', '시애틀 투어 05', '2025', 'David Lee'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54796820611).jpg', '시애틀 투어 06', '2025', 'David Lee')
    ],
    links: [
      { label: "Instagram", icon: "◎", url: "https://www.instagram.com/le_sserafim/" },
      { label: "YouTube", icon: "▷", url: "https://www.youtube.com/@LESSERAFIM_official" },
      { label: "X 공식", icon: "𝕏", url: "https://x.com/le_sserafim" },
      { label: "Weverse", icon: "✦", url: "https://weverse.io/lesserafim" }
    ],
    merch: [
      { title: "Weverse Shop", sub: "공식 굿즈", href: "https://shop.weverse.io/en/shop/USD/artists/50/notices/13192" },
      { title: "OFFICIAL LINKS", sub: "공식 스토어", href: "https://linktr.ee/lesserafim" }
    ],
    schedules: [
      { title: "공식 커뮤니티", sub: "Weverse", href: "https://weverse.io/lesserafim" },
      { title: "공식 채널", sub: "Linktree", href: "https://linktr.ee/lesserafim" }
    ],
    news: [
      { date: "2026", tag: "굿즈", title: "LE SSERAFIM Official Merch", href: "https://shop.weverse.io/en/shop/USD/artists/50/notices/13192" },
      { date: "공식", tag: "채널", title: "LE SSERAFIM 최신 소식", href: "https://linktr.ee/lesserafim" }
    ]
  },
  {
    id: "twice", name: "TWICE", korean: "트와이스", fan: "ONCE", agency: "JYP ENTERTAINMENT", members: ["나연", "정연", "모모", "사나", "지효", "미나", "다현", "채영", "쯔위"],
    accent: "#b74175", light: "#ffe8df", dark: "#743b58", shape: "✿", status: "THIS IS FOR · TOUR",
    image: "https://pub-dc9a9c6ac2a64ba48bce426ced0ac56a.r2.dev/groups/TWICE/profile.webp", imageCredit: "kpopping / TWICE", imageLink: "https://kpopping.com/kpics/TWICE-Japan-Season-s-Greetings-2026-CAPTURED-MOMENTS-Concept-Photos",
    photos: [
      { label: "Captured Moments", meta: "2026 · CONCEPT", image: "https://pub-dc9a9c6ac2a64ba48bce426ced0ac56a.r2.dev/groups/TWICE/profile.webp", href: "https://kpopping.com/kpics/TWICE-Japan-Season-s-Greetings-2026-CAPTURED-MOMENTS-Concept-Photos", credit: "kpopping" },
      commonsPhoto('20260122 Twice @ This is For World Tour in Los Angeles 0.jpg', 'LA 투어 · 01', '2026', 'Shelby Lee', 'CC BY-SA 4.0'),
      commonsPhoto('20260122 Twice @ This is For World Tour in Los Angeles 1.jpg', 'LA 투어 · 02', '2026', 'Shelby Lee', 'CC BY-SA 4.0'),
      commonsPhoto('20260122 Twice @ This is For World Tour in Los Angeles 2.jpg', 'LA 투어 · 03', '2026', 'Shelby Lee', 'CC BY-SA 4.0'),
      commonsPhoto('Twice in Seattle 2026 - TWICE (55044093832).jpg', '시애틀 투어 01', '2026', 'David Lee'),
      commonsPhoto('Twice in Seattle 2026 - TWICE (55044985796).jpg', '시애틀 투어 02', '2026', 'David Lee'),
      commonsPhoto('Twice in Seattle 2026 - TWICE (55044987391).jpg', '시애틀 투어 03', '2026', 'David Lee')
    ],
    links: [
      { label: "Instagram", icon: "◎", url: "https://www.instagram.com/twicetagram/" },
      { label: "YouTube", icon: "▷", url: "https://www.youtube.com/c/TWICE" },
      { label: "X 공식", icon: "𝕏", url: "https://x.com/JYPETWICE" },
      { label: "FANS", icon: "✦", url: "https://app.fans/community/twice" }
    ],
    merch: [
      { title: "TWICE OFFICIAL", sub: "공식 스토어", href: "https://TWICE.lnk.to/Shop" },
      { title: "JYP FANS", sub: "커뮤니티", href: "https://app.fans/community/twice" }
    ],
    schedules: [
      { title: "공식 커뮤니티", sub: "JYP FANS", href: "https://app.fans/community/twice" },
      { title: "공식 홈페이지", sub: "JYP", href: "https://twice.jype.com/" }
    ],
    news: [
      { date: "2026", tag: "투어", title: "THIS IS FOR · TOUR CONTENT", href: "https://app.fans/community/twice/media/kdytkko38v" },
      { date: "공식", tag: "공지", title: "TWICE FANS 최신 소식", href: "https://app.fans/community/twice" }
    ]
  }
];
