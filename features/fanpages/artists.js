/* Curated photographs and source links. Keep dates tied to their sources; this is not a live feed. */
const commonsPhoto = (file, label, year, author, license = 'CC BY 4.0') => {
  const name = encodeURIComponent(file.replaceAll(' ', '_'));
  // The Pages build stores permission-checked Commons photos on the Ojjuda CDN.
  // Preview builds or failed downloads safely use the original Commons image.
  const stored = window.OJJUDA_FAN_LOCAL_PHOTOS?.[file];
  const actualLicense = stored?.license || license;
  const licenseUrl = {
    'CC BY 1.0': 'https://creativecommons.org/licenses/by/1.0/',
    'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
    'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
    'CC BY-SA 2.0': 'https://creativecommons.org/licenses/by-sa/2.0/',
    'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
    'Public domain': 'https://commons.wikimedia.org/wiki/Commons:Public_domain'
  }[actualLicense] || 'https://commons.wikimedia.org/wiki/Commons:Licensing';
  return {
    label,
    meta: `${year} · PHOTO`,
    image: stored?.thumb || `https://commons.wikimedia.org/wiki/Special:FilePath/${name}?width=960`,
    full: stored?.full || `https://commons.wikimedia.org/wiki/Special:FilePath/${name}?width=1920`,
    href: `https://commons.wikimedia.org/wiki/File:${name}`,
    credit: author,
    license: actualLicense,
    licenseUrl: stored?.licenseUrl || licenseUrl,
    optimized: Boolean(stored),
  };
};
const creditedPhoto = (image, label, year, credit, href, sourceLabel) => ({
  label, meta: `${year} · PHOTO`, image, full: image, href, credit, sourceLabel
});
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
      commonsPhoto('RESCENE Woni 261103.jpg', 'PULSE 쇼케이스 · 원이', '2026', 'Runtorescene', 'CC BY 1.0'),
      commonsPhoto('RESCENE Liv 261103 (2).jpg', 'PULSE 쇼케이스 · 리브', '2026', 'Runtorescene', 'CC BY 1.0'),
      commonsPhoto('RESCENE Minami 261103.jpg', 'PULSE 쇼케이스 · 미나미', '2026', 'Runtorescene', 'CC BY 1.0'),
      commonsPhoto('RESCENE May 261103.jpg', 'PULSE 쇼케이스 · 메이', '2026', 'Runtorescene', 'CC BY 1.0'),
      commonsPhoto('RESCENE Zena 261103 (1).jpg', 'PULSE 쇼케이스 · 제나', '2026', 'Runtorescene', 'CC BY 1.0'),
      commonsPhoto('Rescene 250205.jpg', '2025 · 단체', '2025', '티비텐 TV10', 'CC BY 3.0'),
      commonsPhoto('240329 Rescene.jpg', '2024 · 데뷔 무대', '2024', '티비텐 TV10', 'CC BY 3.0')
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
    music: [
      { title: "PULSE", date: "2026.11.03", type: "미니 4집", songs: ["With", "Finest Thing", "백화요란 (Inside Out)", "MEME", "Dragon"], href: "https://www.melon.com/album/detail.htm?albumId=15082293" },
      { title: "Pretty Girl - Special Single", date: "2026.07.08", type: "싱글", songs: ["Pretty Girl"], href: "https://music.bugs.co.kr/album/4151191" },
      { title: "lip bomb", date: "2025.11.25", type: "미니 3집", songs: ["Heart Drop", "Bloom", "Love Echo", "Hello XO", "MVP"], href: "https://www.melon.com/album/detail.htm?albumId=12196394" },
      { title: "SCENEDROME", date: "2024.08.27", type: "미니 1집", songs: ["LOVE ATTACK", "Pinball"], href: "https://en.themuze.kr/scenedrome" }
    ],
    appearances: [
      { date: "2026-11-14", title: "MMA2026", sub: "서울 고척스카이돔 · 18:00", href: "https://into.melon.com/2026mma" },
      { date: "2026-11-20", title: "2026 MAMA AWARDS", sub: "일본 오사카 · CHAPTER 1", href: "https://www.cj.net/jp/press-release/view/1132" },
      { date: "2026-11-22", title: "[PULSE] 메이크스타 팬사인회", sub: "대면 13:00 · 영상통화 별도 · 응모 마감", href: "https://www.makestar.com/product/21557" },
      { date: "2026-12-05", endDate: "2026-12-06", title: "AAA 2026", sub: "대만 가오슝 · 12.05~12.06", href: "https://asiaartistawards.com/news/detail/184791/all" },
      { date: "2026-12-13", title: "뮤직뱅크 글로벌 페스티벌", sub: "도쿄 국립경기장 · 17:00 예정", href: "https://music-bank.jp/" }
    ],
    campaigns: [
      { kind: "콜라보", date: "2026.09", title: "CU × 리센느 빵 5종", sub: "BAKE405 · 멤버별 베이커리·포토카드", href: "https://www.bgfretail.com/press/view/?id=2040" },
      { kind: "광고", date: "2026.10", title: "도미노피자", sub: "전속 모델 · 신규 브랜드 캠페인", href: "https://www.mt.co.kr/living/2026/10/12/2026101208525329438" },
      { kind: "광고", date: "2026.08", title: "나랑드사이다", sub: "동아오츠카 광고 모델", href: "https://www.edaily.co.kr/News/Read?mediaCodeNo=257&newsId=05323446645545024" },
      { kind: "광고", date: "2026.08", title: "할리스", sub: "창립 이래 첫 브랜드 광고 모델", href: "https://mobile.newsis.com/view/NISX20260818_0003751971" },
      { kind: "홍보대사", date: "2026.07", title: "캐릭터 라이선싱 페어", sub: "2026 공식 홍보대사", href: "https://welcon.kocca.kr/ko/info/business/1958256" },
      { kind: "홍보대사", date: "2026.07", title: "거제·수원·경주·고양", sub: "멤버 고향 도시 홍보대사", href: "https://www.newsen.com/news_view.php?uid=202607030947385710" }
    ],
    schedules: [
      { title: "공식 활동 소식", sub: "RESCENE 공식 X", href: "https://x.com/RESCENEofficial" },
      { title: "공식 스케줄", sub: "Mnet Plus · 최신 일정", href: "https://artist.mnetplus.world/main/stg/rescene-official/schedule/2026/11" }
    ],
    news: [
      { date: "11.11", tag: "수상", title: "〈쇼챔피언〉 ‘With’ 1위", href: "https://www.soompi.com/article/1886056wpp/watch-rescene-takes-2nd-win-for-with-on-show-champion-performances-by-p1harmony-xlov-and-more" },
      { date: "11.10", tag: "방송", title: "〈더쇼〉 사전 녹화·생방송", href: "https://artist.mnetplus.world/main/stg/rescene-official/surveys/6af01659da3bdb578b5182ae" },
      { date: "11.03", tag: "앨범", title: "4th Mini Album [PULSE]", href: "https://artist.mnetplus.world/main/stg/rescene-official/contents/6acda1b99b432c2a150adc7a" },
      { date: "10.19", tag: "사진", title: "PULSE 콘셉트 포토 A", href: "https://artist.mnetplus.world/main/stg/rescene-official/contents/6ad5d55f71a55b46a7487eb5" }
    ]
  },
  {
    id: "ive", name: "IVE", korean: "아이브", fan: "DIVE", agency: "STARSHIP", members: ["안유진", "가을", "레이", "장원영", "리즈", "이서"],
    accent: "#ab5b80", light: "#ffede9", dark: "#63354e", shape: "♡", status: "Looks Can Kill · 2026.10.26",
    image: "https://imagedelivery.net/l1Bzo8LRyoaogf5OFVsfnA/600802b6-5256-4afe-dfe1-ad4eab2b0600/public", imageCredit: "K-POPIT / IVE", imageLink: "https://k-popit.com/articles/2026092890542",
    photos: [
      { label: "IVE · Group", meta: "2026 · PHOTO", image: "https://imagedelivery.net/l1Bzo8LRyoaogf5OFVsfnA/600802b6-5256-4afe-dfe1-ad4eab2b0600/public", href: "https://k-popit.com/articles/2026092890542", credit: "K-POPIT" },
      commonsPhoto('03102026 IVE YUJIN Airport Departure 6.jpg', '안유진 · 공항 출국', '2026.10.03', 'K-POPIT 케이팝잇', 'CC BY 4.0'),
      commonsPhoto('Ive in Seattle.jpg', '시애틀 공연', '2026', 'David Lee'),
      commonsPhoto('Ive at the 2026 Golden Disc Awards.png', '골든디스크 · 무대', '2026', '티비텐 TV10'),
      commonsPhoto('Ive at the 40th Golden Disc Awards, January 10, 2026 (2).png', '골든디스크 · 레드카펫', '2026', 'K-POPIT 케이팝잇'),
      commonsPhoto('Ive at the 2024 Melon Music Awards.png', '멜론뮤직어워드', '2024', 'K-POPIT 케이팝잇', 'CC BY 3.0'),
      commonsPhoto('IVE 2024 MMA 1.jpg', 'IVE · 2024 MMA', '2024', '10Asia', 'CC BY 3.0'),
      commonsPhoto('An Yu-jin of Ive, April 19, 2025.png', '안유진 · 포토월', '2025', 'K-POPIT 케이팝잇', 'CC BY 3.0'),
      commonsPhoto('아이브(IVE) Gaeul Wonyoung Yujin at the 40th Golden Disc Awards.png', '가을·원영·유진', '2026', 'K-POPIT 케이팝잇'),
      commonsPhoto('아이브(IVE) 골든디스크어워즈 The 40th Golden Disc Awards.png', '골든디스크 · 2026', '2026', 'K-POPIT 케이팝잇')
    ],
    links: [
      { label: "Instagram", icon: "◎", url: "https://www.instagram.com/ivestarship/" },
      { label: "YouTube", icon: "▷", url: "https://www.youtube.com/@IVEstarship" },
      { label: "X 공식", icon: "𝕏", url: "https://x.com/IVEstarship" },
      { label: "Berriz", icon: "✦", url: "https://link.berriz.in/web/main/IVE" }
    ],
    merch: [
      { title: "Looks Can Kill · 음반", sub: "2026.10.26 발매 · 공식 IVE 스토어", href: "https://shop.ive-starship.com/" },
      { title: "Looks Can Kill · 사인반", sub: "HERO COMICS ver. · 품절(공식 판매처 기준)", href: "https://shop.ive-starship.com/products/hero-comics-ver-ive-looks-can-kill-signed" },
      { title: "STARSHIP SQUARE", sub: "앨범·공식 굿즈", href: "https://www.starship-square.com/product/list.html?cate_no=57" },
      { title: "IVE OFFICIAL", sub: "소속사 아티스트", href: "https://www.starship-ent.com/musician/ive" }
    ],
    music: [
      { title: "Looks Can Kill", date: "2026.10.26", type: "미니 5집 · 6곡", songs: ["Looks Can Kill", "Mirror Mirror", "SNAKESKIN", "CRUMBS", "Girls Girls Girls", "Glow Motion"], href: "https://music.apple.com/us/album/looks-can-kill-ep/6823675363" },
      { title: "LUCID DREAM", date: "2026.05.27", type: "일본 미니 4집 · 6곡", songs: ["LUCID DREAM", "Fashion", "JIGSAW", "REBEL HEART -Japanese ver.-", "ATTITUDE -Japanese ver.-", "Thank U -Japanese ver.-"], href: "https://www.sonymusic.co.jp/artist/IVE/info/585343" },
      { title: "REVIVE+", date: "2026.02.23", type: "정규 2집", songs: ["BLACKHOLE", "BANG BANG", "Hush", "Fireworks"], href: "https://ive-official.jp/mob/news/diarKijiShw.php?id=303477&site=DIVE" },
      { title: "IVE SECRET", date: "2025.08.25", type: "미니 4집", songs: ["XOXZ", "Wild Bird", "Dear, My Feelings"], href: "https://shop.ive-starship.com/products/ive-secret" },
      { title: "IVE EMPATHY", date: "2025.02.03", type: "미니 3집", songs: ["REBEL HEART", "ATTITUDE", "FLU"], href: "https://shop.ive-starship.com/products/ive-empathy-ep-cd" }
    ],
    appearances: [
      { date: "2026-11-15", title: "MMA2026", sub: "서울 고척스카이돔 · 18:00", href: "https://into.melon.com/2026mma" },
      { date: "2026-11-21", title: "2026 MAMA AWARDS", sub: "교세라 돔 오사카 · CHAPTER 2 · 15:00(JST)", href: "https://www.cj.net/jp/press-release/view/1133" },
      { date: "2026-12-13", title: "뮤직뱅크 글로벌 페스티벌", sub: "도쿄 MUFG 스타디움(국립경기장) · IVE 출연 확정", href: "https://music-bank.jp/" }
    ],
    campaigns: [
      { kind: "홍보대사", date: "2026.02.02", title: "메종 발렌티노 · 레이·리즈", sub: "공식 브랜드 앰배서더 임명 · 발렌티노 발표", href: "https://prtimes.jp/main/html/rd/p/000000257.000101366.html" },
      { kind: "광고", date: "2026.03.30", title: "App Store × IVE · Fashion", sub: "일본 App Store 캠페인 음악 · 레이 내레이션", href: "https://www.sonymusic.co.jp/artist/IVE/info/582822" }
    ],
    schedules: [
      { title: "실시간 일정", sub: "blip", href: "https://blip.kr/artists/IVE/schedule?unitId=85" },
      { title: "공식 커뮤니티", sub: "Berriz", href: "https://link.berriz.in/web/main/IVE" }
    ],
    news: [
      { date: "10.26", tag: "앨범", title: "미니 5집 〈Looks Can Kill〉 정식 발매", href: "https://www.starship-ent.com/musician/ive" },
      { date: "10.16", tag: "행사", title: "IVE, 11월 21일 2026 MAMA AWARDS 출연 발표", href: "https://www.cj.net/jp/press-release/view/1133" },
      { date: "05.27", tag: "앨범", title: "일본 미니 4집 〈LUCID DREAM〉 발매", href: "https://www.sonymusic.co.jp/artist/IVE/info/585343" },
      { date: "02.23", tag: "앨범", title: "IVE THE 2ND ALBUM REVIVE+", href: "https://ive-official.jp/mob/news/diarKijiShw.php?id=303477&site=DIVE" },
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
      commonsPhoto('Aespa at Mise-en-Scene event on 19022026 (7).png', '미장센 · 포토월 07', '2026', '티비텐 TV10'),
      commonsPhoto('Aespa at Mise-en-Scene event on 19022026 (6).png', '미장센 · 포토월 06', '2026', '티비텐 TV10'),
      commonsPhoto('Aespa at Mise-en-Scene event on 19022026 (8).png', '미장센 · 포토월 08', '2026', '티비텐 TV10')
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
    music: [
      { title: "LEMONADE", date: "2026.05.29", type: "정규 2집", songs: ["LEMONADE", "WDA (Whole Different Animal)", "SHAKIN‘", "Camouflage"], href: "https://aespa-official.jp/discography/lemonade/" },
      { title: "Rich Man", date: "2025.09.05", type: "미니 6집", songs: ["Rich Man", "Drift", "Bubble", "To The Girls"], href: "https://aespa-official.jp/discography/richman/" },
      { title: "Whiplash", date: "2024.10.21", type: "미니 5집", songs: ["Whiplash", "Kill It", "Flights, Not Feelings"], href: "https://aespa-official.jp/discography/whiplash/" }
    ],
    appearances: [
      { date: "2026-11-14", title: "MMA2026", sub: "서울 고척스카이돔 · 18:00", href: "https://into.melon.com/2026mma" },
      { date: "2026-12-12", title: "뮤직뱅크 글로벌 페스티벌", sub: "도쿄 국립경기장 · 17:00 예정", href: "https://music-bank.jp/" }
    ],
    schedules: [
      { title: "공식 공지", sub: "Weverse", href: "https://weverse.io/aespa/highlight" },
      { title: "팬 커뮤니티", sub: "Weverse", href: "https://weverse.io/aespa/feed" }
    ],
    news: [
      { date: "2026", tag: "팬미팅", title: "MY 보고싶다 ae가 · 공지", href: "https://weverse.io/aespa/notice/40306" },
      { date: "2026", tag: "굿즈", title: "aesParty 공식 MD 안내", href: "https://weverse.io/aespa/notice/38335" }
    ]
  },
  {
    id: "lesserafim", name: "LE SSERAFIM", korean: "르세라핌", fan: "FEARNOT", agency: "SOURCE MUSIC", members: ["김채원", "사쿠라", "허윤진", "카즈하", "홍은채"],
    accent: "#c63d38", light: "#f2ede8", dark: "#27262a", shape: "✶", status: "FEARNOT · OFFICIAL",
    image: "https://cloudfront-ap-northeast-1.images.arcpublishing.com/chosun/G5RDQNLDGE2WMMLGME3DAMLFHE.jpg", imageCredit: "조선 / SOURCE MUSIC", imageLink: "https://www.chosun.com/english/kpop-culture-en/2026/07/02/HEG2E7HZ3ZFPVE6TKQ7UKYDSEY/",
    photos: [
      { label: "Pureflow", meta: "2026 · PHOTO", image: "https://cloudfront-ap-northeast-1.images.arcpublishing.com/chosun/G5RDQNLDGE2WMMLGME3DAMLFHE.jpg", href: "https://www.chosun.com/english/kpop-culture-en/2026/07/02/HEG2E7HZ3ZFPVE6TKQ7UKYDSEY/", credit: "조선" },
      commonsPhoto('Le Sserafim in Manila (2025).jpg', '마닐라 투어 · 단체', '2025', 'Patrick Cristiano', 'CC BY-SA 4.0'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54795963237).jpg', '시애틀 투어 01', '2025', 'David Lee'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54795963367).jpg', '시애틀 투어 02', '2025', 'David Lee'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54795963372).jpg', '시애틀 투어 03', '2025', 'David Lee'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54795963817).jpg', '시애틀 투어 04', '2025', 'David Lee'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54795963857).jpg', '시애틀 투어 05', '2025', 'David Lee'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54796820611).jpg', '시애틀 투어 06', '2025', 'David Lee'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54795963252).jpg', '시애틀 투어 07', '2025', 'David Lee'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54795963297).jpg', '시애틀 투어 08', '2025', 'David Lee'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54795963477).jpg', '시애틀 투어 09', '2025', 'David Lee'),
      commonsPhoto('Easy Crazy Hot Tour in Seattle - le sserafim (54795963727).jpg', '시애틀 투어 10', '2025', 'David Lee')
    ],
    links: [
      { label: "Instagram", icon: "◎", url: "https://www.instagram.com/le_sserafim/" },
      { label: "YouTube", icon: "▷", url: "https://www.youtube.com/@LESSERAFIM_official" },
      { label: "X 공식", icon: "𝕏", url: "https://x.com/le_sserafim" },
      { label: "Weverse", icon: "✦", url: "https://weverse.io/lesserafim" }
    ],
    merch: [
      { title: "Made My Night 싱글 앨범", sub: "CHEMICAL NIGHT·컴팩트판 · 한국 9.11 발매·일본 10.09 발매 · 재고는 판매처 확인", href: "https://www.le-sserafim.jp/news/984d91860ac0" },
      { title: "FIM'S Holiday Express 공식 MD", sub: "쿠션·키링·블랭킷 · 11.09부터 한정 예약 · 재고는 판매처 확인", href: "https://www.le-sserafim.jp/news/4fc666123c77" },
      { title: "사쿠라 × Couturier 공식 협업 상품", sub: "DIY 키트·니트 MD · 3차 예약 11.27 18:00(JST)까지·수량 한정", href: "https://www.le-sserafim.jp/news/28a632789865" },
      { title: "Weverse Shop", sub: "공식 굿즈", href: "https://shop.weverse.io/en/shop/USD/artists/50/notices/13192" },
      { title: "LE SSERAFIM 공식 스토어", sub: "앨범·공식 굿즈", href: "https://shop.weverse.io/ko/shop/KRW/artists/50" }
    ],
    music: [
      { title: "Made My Night", date: "2026.09.11", type: "싱글 2집", songs: ["Made My Night", "AEIOU"], href: "https://sourcemusic.com/artist/discography/LE%20SSERAFIM/19" },
      { title: "ICONIC BY MISTAKE", date: "2026.06.12", type: "합동 디지털 싱글 · ILLIT·KATSEYE", songs: ["ICONIC BY MISTAKE"], href: "https://www.le-sserafim.jp/news/72e8fb13fd3d" },
      { title: "'PUREFLOW' pt.1", date: "2026.05.22", type: "정규 2집", songs: ["Pureflow", "BOOMPALA", "CELEBRATION", "Creatures", "iffy iffy", "우리 어떻게 더 사귈 수 있을까 (Need Your Company)", "Sonder", "Saki (feat. Aliyah's Interlude)", "Irony", "Trust Exercise", "Liminal Space"], href: "https://sourcemusic.com/artist/discography/LE%20SSERAFIM/17" },
      { title: "SPAGHETTI", date: "2025.10.24", type: "싱글", songs: ["SPAGHETTI (feat. j-hope)", "Pearlies (My oyster is the world)"], href: "https://sourcemusic.com/artist/discography/LE%20SSERAFIM/16" },
      { title: "HOT", date: "2025.03.14", type: "미니 5집", songs: ["HOT", "Come Over", "Ash"], href: "https://sourcemusic.com/artist/discography/LE%20SSERAFIM/15" }
    ],
    appearances: [
      { date: "2026-11-14", title: "PUREFLOW 투어 · 타이베이 (1일차)", sub: "대만 NTSU 아레나 · 현지 시간은 공식 판매처 확인", href: "https://weverse.io/lesserafim/notice/40760" },
      { date: "2026-11-15", title: "PUREFLOW 투어 · 타이베이 (2일차)", sub: "대만 NTSU 아레나 · 현지 시간은 공식 판매처 확인", href: "https://weverse.io/lesserafim/notice/40760" },
      { date: "2026-11-21", title: "2026 MAMA AWARDS", sub: "일본 오사카 · CHAPTER 2", href: "https://www.cj.net/jp/press-release/view/1132" },
      { date: "2026-11-28", title: "PUREFLOW 투어 · 싱가포르", sub: "APEX@EXPO · 현지 17:00 · iMe Singapore 주최", href: "https://ticketmaster.sg/activity/detail/26sg_lsf" },
      { date: "2026-12-05", title: "PUREFLOW 투어 · 마닐라", sub: "SM Mall of Asia Arena · PULP Live World 주최 · 12.06 공연 취소, 12.05만 진행", href: "https://www.pulpliveworld.com/Shows/296" },
      { date: "2026-12-10", endDate: "2026-12-13", title: "VR FEST · INVITATION (1차 상영)", sub: "도쿄 109 시네마즈 프리미엄 신주쿠 · 회차는 극장 확인", href: "https://www.le-sserafim.jp/news/e5aa32400684" },
      { date: "2026-12-13", title: "뮤직뱅크 글로벌 페스티벌", sub: "도쿄 국립경기장 · 17:00 예정", href: "https://music-bank.jp/" },
      { date: "2026-12-17", endDate: "2026-12-19", title: "VR FEST · INVITATION (2차 상영)", sub: "도쿄 109 시네마즈 프리미엄 신주쿠 · 회차는 극장 확인", href: "https://www.le-sserafim.jp/news/e5aa32400684" },
      { date: "2026-12-19", title: "PUREFLOW 투어 · 오사카 돔 (1일차)", sub: "교세라 돔 오사카 · 17:00 JST", href: "https://www.le-sserafim.jp/news/34281e5b5c57" },
      { date: "2026-12-20", title: "PUREFLOW 투어 · 오사카 돔 (2일차)", sub: "교세라 돔 오사카 · 16:00 JST", href: "https://www.le-sserafim.jp/news/34281e5b5c57" },
      { date: "2026-12-26", title: "COUNTDOWN JAPAN 26/27", sub: "지바 마쿠하리 멧세 · 르세라핌 12.26만 출연", href: "https://www.le-sserafim.jp/schedule/35ce4b06d4b8" },
      { date: "2027-01-23", title: "일본 데뷔 4주년 Celebration Greeting · 오사카", sub: "오사카 시내 · 시간·세부 장소 미공개 · 구매자 추첨", href: "https://www.le-sserafim.jp/news/555c78286abe" },
      { date: "2027-01-24", title: "일본 데뷔 4주년 Celebration Greeting · 도쿄", sub: "도쿄 시내 · 시간·세부 장소 미공개 · 구매자 추첨", href: "https://www.le-sserafim.jp/news/555c78286abe" }
    ],
    campaigns: [
      { kind: "콜라보", date: "2026.09.10", title: "LE SSERAFIM × 오버워치", sub: "Made My Night 공식 MV 및 게임 컬래버레이션", href: "https://www.invenglobal.com/articles/25804/operation-rescue-le-sserafim-overwatch-collab-music-video-for-made-my-night-released" },
      { kind: "콜라보", date: "2026.05.22", title: "BOOMPALA × Google Android", sub: "Google Android·Gemini 연계 공식 뮤직비디오 프로젝트", href: "https://www.billboard-japan.com/d_news/detail/161790/2" },
      { kind: "콜라보", date: "2026.06.03", title: "사쿠라 × Couturier", sub: "펠리시모 뜨개질·DIY 브랜드 협업 · 공식 한정 상품", href: "https://www.le-sserafim.jp/news/28a632789865" }
    ],
    schedules: [
      { title: "일본 공식 일정", sub: "공연·방송·이벤트", href: "https://www.le-sserafim.jp/schedule" },
      { title: "공식 커뮤니티", sub: "Weverse", href: "https://weverse.io/lesserafim" },
      { title: "공식 채널", sub: "Linktree", href: "https://linktr.ee/lesserafim" }
    ],
    news: [
      { date: "2026.11.13", tag: "이벤트", title: "2027.01.23~24 일본 데뷔 4주년 기념 이벤트 공지", href: "https://www.le-sserafim.jp/news/555c78286abe" },
      { date: "2026.11.06", tag: "수상", title: "사쿠라 WIRED Innovation Awards 2026 수상", href: "https://www.le-sserafim.jp/news/8c78b9319fdd" },
      { date: "2026.11.06", tag: "굿즈", title: "FIM'S Holiday Express 공식 MD 예약 안내", href: "https://www.le-sserafim.jp/news/4fc666123c77" },
      { date: "2026.11.05", tag: "VR 공연", title: "VR FEST 2026 12월 상영 일정 발표", href: "https://www.le-sserafim.jp/news/e5aa32400684" },
      { date: "2026.10.26", tag: "공연 변경", title: "마닐라 12.06 추가 공연 취소 · 12.05 공연 유지", href: "https://philstarlife.com/geeky/896437-le-sserafim-cancels-second-day-manila-concert-in-december" },
      { date: "2026", tag: "굿즈", title: "LE SSERAFIM Official Merch", href: "https://shop.weverse.io/en/shop/USD/artists/50/notices/13192" },
      { date: "공식", tag: "굿즈", title: "LE SSERAFIM 공식 굿즈 소식", href: "https://shop.weverse.io/ko/shop/KRW/artists/50/notices" }
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
      commonsPhoto('Twice in Seattle 2026 - TWICE (55044987391).jpg', '시애틀 투어 03', '2026', 'David Lee'),
      commonsPhoto('Twice in Seattle 2026 - TWICE (55045170513).jpg', '시애틀 투어 04', '2026', 'David Lee'),
      commonsPhoto('Twice in Seattle 2026 - TWICE (55045249274).jpg', '시애틀 투어 05', '2026', 'David Lee'),
      commonsPhoto('Twice in Seattle 2026 - TWICE (55045326100).jpg', '시애틀 투어 06', '2026', 'David Lee'),
      commonsPhoto('Twice in Seattle.jpg', '시애틀 공연 · 2026', '2026', 'David Lee'),
      commonsPhoto('Twice This Is For World Tour in Vancouver, post-finale send off, January 9, 2026.jpg', '밴쿠버 투어 · 피날레', '2026', 'Yue', 'CC BY-SA 4.0')
    ],
    links: [
      { label: "Instagram", icon: "◎", url: "https://www.instagram.com/twicetagram/" },
      { label: "YouTube", icon: "▷", url: "https://www.youtube.com/c/TWICE" },
      { label: "X 공식", icon: "𝕏", url: "https://x.com/JYPETWICE" },
      { label: "FANS", icon: "✦", url: "https://app.fans/community/twice" }
    ],
    merch: [
      { title: "NAYEON · NA-sty", sub: "2026.11.20 발매 · 카세트 2종 예약 · 포토카드 특전은 판매처 확인", href: "https://www.twicejapan.com/news/detail/2059" },
      { title: "THIS IS FOR · 서울 피날레 라이브 LP", sub: "2026.10.16 발매 · 2LP · JYP JAPAN 공식 판매처", href: "https://jypj-store.com/collections/twice-official-goods/products/tw26-tff-0001" },
      { title: "#BEST 2015-2025 · 한정 BOX", sub: "2026.12.16 발매 예정 · 수량·재고는 공식 판매처 확인", href: "https://jypj-store.com/collections/twice-official-goods/products/tw26-bes-0003" },
      { title: "THIS IS FOR · MUFG STADIUM 라이브 Blu-ray/DVD", sub: "2026.12.02 발매 예정 · 일본 공식 디스코그래피", href: "https://www.twicejapan.com/discography/detail/92/" },
      { title: "TWICE OFFICIAL", sub: "공식 스토어 · FANS SHOP", href: "https://app.fans/shop/twice" },
      { title: "JYP FANS", sub: "커뮤니티", href: "https://app.fans/community/twice" }
    ],
    music: [
      { title: "THIS IS FOR WORLD TOUR FINALE in SEOUL - LIVE", date: "2026.10.16", type: "서울 피날레 라이브 음반 · 26곡", songs: ["FOUR", "THIS IS FOR", "Strategy", "MAKE ME GO", "SET ME FREE"], href: "https://music.apple.com/us/album/this-is-for-world-tour-finale-in-seoul-live/6812503580" },
      { title: "#BEST 2015-2025", date: "2026.08.26", type: "일본 베스트 앨범 · 4CD", songs: ["Like OOH-AHH", "CHEER UP", "TT", "Feel Special", "ME + YOU"], href: "https://www.twicejapan.com/discography/detail/91/" },
      { title: "TEN: The Story Goes On", date: "2025.10.10", type: "데뷔 10주년 스페셜 앨범", songs: ["ME+YOU", "MEEEEEE", "FIX A DRINK", "CHESS"], href: "https://twice.jype.com/discography?AmSeq=1&PgIndex=1" },
      { title: "THIS IS FOR", date: "2025.07.11", type: "정규 4집", songs: ["THIS IS FOR", "FOUR", "OPTIONS", "MARS"], href: "https://twice.jype.com/discography/7lpxlcye" },
      { title: "STRATEGY", date: "2024.12.06", type: "미니 14집", songs: ["Strategy (feat. Megan Thee Stallion)", "Kiss My Troubles Away", "Sweetest Obsession"], href: "https://twice.jype.com/discography/1xokcjbo" },
      { title: "With YOU-th", date: "2024.02.23", type: "미니 13집", songs: ["ONE SPARK", "I GOT YOU"], href: "https://twice.jype.com/discography/jfzzhl4x" }
    ],
    appearances: [
      { date: "2026-11-14", title: "나연 · CHAGEE 마닐라 밋앤그릿", sub: "필리핀 현지 17:30 출연 예정 · Bonifacio High Street Activity Center, BGC · 초대권 당첨자 입장", href: "https://thelookout.com.ph/article/nayeon-of-twice-returns-to-manila-for-chagees-first-philippine-flagship-store-opening" },
      { date: "2026-11-20", title: "나연 · NA-sty 싱글 발매", sub: "JYP · 한국 정식 발매일 (예약 공지와 구별)", href: "https://www.twicejapan.com/news/detail/2059" },
      { date: "2026-11-21", title: "2026 MAMA AWARDS", sub: "나연 솔로 출연 · 일본 오사카", href: "https://www.cj.net/jp/press-release/view/1132" },
      { date: "2026-12-12", title: "뮤직뱅크 글로벌 페스티벌", sub: "MISAMO·나연 출연 · 도쿄", href: "https://music-bank.jp/" },
      { date: "2027-01-23", title: "나연 · NA-sty 발매 기념 밋앤그릿", sub: "일본 도쿄 · 추첨 당첨자 한정 · 상세 장소·시간 당첨자 별도 안내", href: "https://www.twicejapan.com/news/detail/2065" }
    ],
    campaigns: [
      { kind: "콜라보", date: "2026.10.28", title: "나연 × CHAGEE 필리핀", sub: "11.14 첫 플래그십 개점 기념 팬 행사 · 포토카드 구매 응모는 11.11 종료", href: "https://thelookout.com.ph/article/nayeon-of-twice-returns-to-manila-for-chagees-first-philippine-flagship-store-opening" },
      { kind: "콜라보", date: "2026.10.02", title: "TWICE LOVELYS × Cake.jp", sub: "공식 캐릭터 쿠키·금평당 선물 세트 · 예약 판매 시작", href: "https://www.twicejapan.com/news/detail/2045" },
      { kind: "콜라보", date: "2026.03", title: "TWICE LOVELYS × 반다이", sub: "캐릭터 젤리·참·파우치 · 2026년 3월 출시", href: "https://wmg.jp/twice/news/90426" },
      { kind: "콜라보", date: "2026.02", title: "TWICE LOVELYS × 산리오캐릭터즈", sub: "선스타 문구 데스크 굿즈 시리즈", href: "https://www.twicejapan.com/news/detail/1948" }
    ],
    schedules: [
      { title: "공식 일정", sub: "JYP TWICE 활동 달력", href: "https://twice.jype.com/schedule" },
      { title: "일본 공식 일정", sub: "TWICE JAPAN", href: "https://www.twicejapan.com/schedule/" },
      { title: "공식 커뮤니티", sub: "JYP FANS", href: "https://app.fans/community/twice" },
      { title: "공식 홈페이지", sub: "JYP", href: "https://twice.jype.com/" }
    ],
    news: [
      { date: "11.10", tag: "공지", title: "나연 'NA-sty' 팬 이벤트 장소·응모 안내 정정", href: "https://www.twicejapan.com/news/detail/2065" },
      { date: "11.06", tag: "음반", title: "나연 'NA-sty' 11.20 발매 · 카세트 2종 예약", href: "https://www.twicejapan.com/news/detail/2059" },
      { date: "10.28", tag: "행사", title: "나연 × CHAGEE, 11.14 마닐라 팬 이벤트 발표", href: "https://thelookout.com.ph/article/nayeon-of-twice-returns-to-manila-for-chagees-first-philippine-flagship-store-opening" },
      { date: "10.16", tag: "음악", title: "서울 투어 피날레 라이브 음원 발매", href: "https://www.twicejapan.com/news/detail/2050" },
      { date: "10.09", tag: "굿즈", title: "도쿄 MUFG 스타디움 라이브 DVD/Blu-ray 12.02 발매 발표", href: "https://www.twicejapan.com/news/detail/2047" },
      { date: "2026", tag: "투어", title: "THIS IS FOR · TOUR CONTENT", href: "https://app.fans/community/twice/media/kdytkko38v" },
      { date: "공식", tag: "공지", title: "TWICE FANS 최신 소식", href: "https://app.fans/community/twice" }
    ]
  },
  {
    id: "illit", name: "ILLIT", korean: "아일릿", fan: "GLLIT", agency: "BELIFT LAB", members: ["윤아", "민주", "모카", "원희", "이로하"],
    accent: "#7774e7", light: "#eff1c3", dark: "#30396c", shape: "✧", status: "BREAK EVEN · 2026.10.26",
    image: commonsPhoto('Illit in January 2026.png', '2026 · 단체', '2026', '티비텐 TV10').image,
    imageCredit: "티비텐 TV10 · CC BY 4.0", imageLink: "https://commons.wikimedia.org/wiki/File:Illit_in_January_2026.png",
    photos: [
      commonsPhoto('Illit in January 2026.png', '2026 · 단체', '2026', '티비텐 TV10'),
      commonsPhoto('Illit at Canada Goose Photo Call, December 11, 2024.png', '캐나다구스 · 포토콜', '2024', '티비텐 TV10', 'CC BY 3.0'),
      commonsPhoto('Illit 240326.jpg', '데뷔 · 단체', '2024', '티비텐 TV10', 'CC BY 3.0'),
      commonsPhoto('ILLIT Yunah at Canada Goose Photo Call.png', '윤아 · 포토콜', '2024', '티비텐 TV10', 'CC BY 3.0'),
      commonsPhoto('ILLIT Minju at Canada Goose Photo Call.png', '민주 · 포토콜', '2024', '티비텐 TV10', 'CC BY 3.0'),
      commonsPhoto('ILLIT Moka at Canada Goose Photo Call.png', '모카 · 포토콜', '2024', '티비텐 TV10', 'CC BY 3.0'),
      commonsPhoto('ILLIT Wonhee at Canada Goose Photo Call.png', '원희 · 포토콜', '2024', '티비텐 TV10', 'CC BY 3.0'),
      commonsPhoto('ILLIT Iroha at Canada Goose Photo Call.png', '이로하 · 포토콜', '2024', '티비텐 TV10', 'CC BY 3.0'),
      commonsPhoto('241120 ILLIT.jpg', '아일릿 · 2024 단체', '2024', '티비텐 TV10', 'CC BY 3.0'),
      commonsPhoto('250221 ILLIT.png', '아일릿 · 2025 단체', '2025', '티비텐 TV10', 'CC BY 3.0'),
      commonsPhoto('아일릿 (ILLIT) 가요광장 출근길 (1).jpg', '가요광장 · 출근길 01', '2024', '티비텐 TV10', 'CC BY 3.0'),
      commonsPhoto('아일릿 (ILLIT) 가요광장 출근길 (2).jpg', '가요광장 · 출근길 02', '2024', '티비텐 TV10', 'CC BY 3.0'),
      commonsPhoto('07072026 ILLIT MINJU Kerastase PhotoCall 5.png', '민주 · 케라스타즈', '2026', 'K-POPIT 케이팝잇'),
      commonsPhoto('2605206 ILLIT WONHEE CHANEL Photo Call 7.jpg', '원희 · 샤넬 포토콜', '2026', 'K-POPIT 케이팝잇')
    ],
    links: [
      { label: "Instagram", icon: "◎", url: "https://www.instagram.com/illit_official/" },
      { label: "YouTube", icon: "▷", url: "https://www.youtube.com/@ILLIT_official" },
      { label: "X 공식", icon: "𝕏", url: "https://x.com/ILLIT_official" },
      { label: "Weverse", icon: "✦", url: "https://weverse.io/illit" }
    ],
    merch: [
      { title: "Weverse Shop", sub: "아일릿 앨범·공식 굿즈", href: "https://shop.weverse.io/ko/shop/KRW/artists/120" },
      { title: "BELIFT LAB", sub: "공식 앨범 안내", href: "https://beliftlab.com/artist/discography/ILLIT" }
    ],
    music: [
      { title: "BREAK EVEN", date: "2026.10.26", type: "미니 5집", songs: ["Super in Love", "More", "체포하겠어 (You're Under Arrest)", "Pop"], href: "https://beliftlab.com/artist/discography/ILLIT/22" },
      { title: "MAMIHLAPINATAPAI", date: "2026.04.30", type: "미니 4집", songs: ["It's Me", "GRWM (Get Ready With Me)", "paw, paw!", "Mamihlapinatapai", "Love, older you"], href: "https://beliftlab.com/artist/discography/ILLIT/18" },
      { title: "SUPER REAL ME", date: "2024.03.25", type: "미니 1집", songs: ["My World", "Magnetic", "Midnight Fiction", "Lucky Girl Syndrome"], href: "https://beliftlab.com/artist/discography/ILLIT/8" }
    ],
    appearances: [
      { date: "2026-11-15", title: "MMA2026", sub: "서울 고척스카이돔 · 18:00", href: "https://into.melon.com/2026mma" },
      { date: "2026-11-20", title: "2026 MAMA AWARDS", sub: "일본 오사카 · CHAPTER 1", href: "https://www.cj.net/jp/press-release/view/1132" }
    ],
    schedules: [
      { title: "BELIFT LAB 일정", sub: "공식 스케줄", href: "https://beliftlab.com/artist/schedule/ILLIT" },
      { title: "Weverse 공지", sub: "팬 커뮤니티", href: "https://weverse.io/illit/notice" }
    ],
    news: [
      { date: "10.26", tag: "앨범", title: "미니 5집 BREAK EVEN", href: "https://beliftlab.com/artist/discography/ILLIT/22" },
      { date: "공식", tag: "공지", title: "ILLIT 공식 소식", href: "https://weverse.io/illit/notice" }
    ]
  },
  {
    id: "a2omay", name: "A2O MAY", korean: "에이투오 메이", fan: "MAYnia", agency: "A2O ENTERTAINMENT", members: ["CHENYU", "SHIJIE", "QUCHANG", "MICHE", "KAT"],
    accent: "#d13f61", light: "#ffd7d6", dark: "#602034", shape: "✺", status: "BAD HABITS TONITE · 2026",
    image: "https://assets.monstr.dev/media/group/4005a04cdc3c4c829588f35d3397b0d6b94538a2-w480.webp",
    imageCredit: "A2O Entertainment · PR TIMES", imageLink: "https://prtimes.jp/main/html/rd/p/000001831.000055377.html",
    photos: [
      creditedPhoto("https://assets.monstr.dev/media/group/4005a04cdc3c4c829588f35d3397b0d6b94538a2-w480.webp", "Love Got Me Ooh · 단체", "2026", "A2O Entertainment", "https://prtimes.jp/main/html/rd/p/000001831.000055377.html"),
      creditedPhoto("https://assets.monstr.dev/media/media/354c70d0ea9c298f81db0207b87d2ad80a682b48-w480.webp", "FILA FUSION · 단체", "2026", "FILA FUSION × A2O MAY", "https://assets.monstr.dev/media/media/354c70d0ea9c298f81db0207b87d2ad80a682b48-w480.webp", "사진 파일 ↗"),
      creditedPhoto("https://assets.monstr.dev/media/media/b19c24d6b76eb7962384299a5d0b2bcc85576500-w480.webp", "MAYgic Tonite", "2026", "A2O MAY 공식 X", "https://x.com/A2O_MAY"),
      creditedPhoto("https://assets.monstr.dev/media/member/7f994106bc11cb80b5b3672d124f429c2c5cd8ec-w480.webp", "CHENYU · 콘셉트", "2026", "A2O Entertainment", "https://assets.monstr.dev/media/member/7f994106bc11cb80b5b3672d124f429c2c5cd8ec-w480.webp", "사진 파일 ↗"),
      creditedPhoto("https://assets.monstr.dev/media/member/3e12c379ad52370fc20ea78b6f84060fbbfe10c7-w480.webp", "SHIJIE · 콘셉트", "2026", "A2O Entertainment", "https://assets.monstr.dev/media/member/3e12c379ad52370fc20ea78b6f84060fbbfe10c7-w480.webp", "사진 파일 ↗")
    ],
    links: [
      { label: "Instagram", icon: "◎", url: "https://www.instagram.com/a2o.may/" },
      { label: "YouTube", icon: "▷", url: "https://www.youtube.com/@A2OWORLD" },
      { label: "X 공식", icon: "𝕏", url: "https://x.com/A2O_MAY" },
      { label: "A2O 공식", icon: "✦", url: "https://www.a2oentertainment.world/" }
    ],
    merch: [
      { title: "A2O MAY 앨범", sub: "Melon · 음반", href: "https://www.melon.com/artist/detail.htm?artistId=4531270" },
      { title: "A2O 공식", sub: "새 굿즈 공지", href: "https://www.a2oentertainment.world/" }
    ],
    music: [
      { title: "BAD HABITS TONITE", date: "2026.10.18", type: "싱글", songs: ["BAD HABITS TONITE", "I Follow", "BAD HABITS TONITE (Chinese Ver.)", "I Follow (Chinese Ver.)"], href: "https://www.melon.com/album/detail.htm?albumId=14801672" },
      { title: "Love Got Me Ooh", date: "2026.07.17", type: "싱글", songs: ["Love Got Me Ooh"], href: "https://orcd.co/A2OMAY_Love_Got_Me_Ooh" },
      { title: "Under My Skin (A2O)", date: "2024.12.20", type: "데뷔 싱글", songs: ["Under My Skin (A2O) [English Ver.]", "Under My Skin (A2O) [Chinese Ver.]"], href: "https://music.apple.com/us/album/under-my-skin-a2o-single/1791613999" }
    ],
    appearances: [],
    campaigns: [
      { kind: "콜라보", date: "2026.10", title: "FILA FUSION × A2O MAY", sub: "상하이 행사·브랜드 제공 사진 · Hypebeast", href: "https://hypebeast.cn/2026/11/fila-fusion-a2o-may-idol" }
    ],
    schedules: [
      { title: "A2O MAY 공식 X", sub: "행사·활동 공지", href: "https://x.com/A2O_MAY" },
      { title: "A2O 공식", sub: "새 일정 확인", href: "https://www.a2oentertainment.world/" }
    ],
    news: [
      { date: "10.18", tag: "앨범", title: "BAD HABITS TONITE 발매", href: "https://www.melon.com/album/detail.htm?albumId=14801672" },
      { date: "2026.10", tag: "콜라보", title: "FILA FUSION 행사·화보", href: "https://hypebeast.cn/2026/11/fila-fusion-a2o-may-idol" }
    ]
  },
  {
    id: "a2olite", name: "A2O LITE", korean: "에이투오 라이트", fan: "미발표", agency: "A2O ENTERTAINMENT", members: ["YOUNG", "OA", "AYUNE", "AIJING", "HIMEKI", "RADA", "XILI", "VORA", "MERCI"],
    accent: "#7df4ab", light: "#e1fef3", dark: "#132d4c", shape: "✴", status: "NEON · 2026.10.13",
    image: commonsPhoto('A2O Lite on 21102026.png', 'MBC 라디오 · 단체', '2026', 'K-POPIT 케이팝잇').image,
    imageCredit: "K-POPIT · CC BY 4.0", imageLink: "https://commons.wikimedia.org/wiki/File:A2O_Lite_on_21102026.png",
    photos: [
      commonsPhoto('A2O Lite on 21102026.png', 'MBC 라디오 · 단체', '2026', 'K-POPIT 케이팝잇'),
      commonsPhoto('A2O Lite - OA 261001.jpg', 'OA · 포토', '2026', 'K-POPIT 케이팝잇'),
      commonsPhoto('A2O LITE - AIJING 0903.jpg', 'AIJING · 포토', '2026', 'K-POPIT 케이팝잇', 'CC BY-SA 4.0'),
      commonsPhoto('A2O LITE - RADA 0893.jpg', 'RADA · 포토', '2026', 'K-POPIT 케이팝잇', 'CC BY-SA 4.0'),
      commonsPhoto('A2O LITE - VORA 0892.jpg', 'VORA · 포토', '2026', 'K-POPIT 케이팝잇', 'CC BY-SA 4.0'),
      creditedPhoto("https://cdnimg.melon.co.kr/cm2/artistcrop/images/052/17/450/5217450_20261012172332_500.jpg", "NEON · 단체", "2026", "A2O Entertainment · Melon", "https://www.melon.com/artist/detail.htm?artistId=5217450"),
      commonsPhoto('A2O LITE - OA 0900.jpg', 'OA · 포토 02', '2026', 'K-POPIT 케이팝잇'),
      commonsPhoto('A2O LITE - RADA 0894.jpg', 'RADA · 포토 02', '2026', 'K-POPIT 케이팝잇', 'CC BY-SA 4.0'),
      commonsPhoto('A2O LITE - RADA 0896.jpg', 'RADA · 포토 03', '2026', 'K-POPIT 케이팝잇', 'CC BY-SA 4.0'),
      commonsPhoto('A2O LITE - VORA 0895.jpg', 'VORA · 포토 02', '2026', 'K-POPIT 케이팝잇', 'CC BY-SA 4.0')
    ],
    links: [
      { label: "Instagram", icon: "◎", url: "https://www.instagram.com/a2o.lite/" },
      { label: "YouTube", icon: "▷", url: "https://www.youtube.com/@A2OLITE" },
      { label: "X 공식", icon: "𝕏", url: "https://x.com/A2O_LITE" },
      { label: "공식 링크", icon: "✦", url: "https://linktr.ee/a2o.lite" }
    ],
    merch: [
      { title: "NEON", sub: "데뷔 싱글 · 음원", href: "https://www.melon.com/album/detail.htm?albumId=14644795" },
      { title: "Mnet Plus", sub: "팬 커뮤니티·굿즈", href: "https://artist.mnetplus.world/main/stg/a2olite" }
    ],
    music: [
      { title: "NEON", date: "2026.10.13", type: "데뷔 싱글", songs: ["NEON"], href: "https://www.melon.com/album/detail.htm?albumId=14644795" }
    ],
    appearances: [],
    schedules: [
      { title: "Mnet Plus 공식", sub: "출연 일정·공지", href: "https://artist.mnetplus.world/main/stg/a2olite" },
      { title: "A2O 공식 링크", sub: "공식 채널 모음", href: "https://linktr.ee/a2o.lite" }
    ],
    news: [
      { date: "10.14", tag: "기록", title: "NEON · 멜론 TOP100 1위", href: "https://en.yna.co.kr/view/AEN20261015001400315" },
      { date: "10.13", tag: "데뷔", title: "NEON 발매", href: "https://www.melon.com/album/detail.htm?albumId=14644795" }
    ]
  },
  {
    id: "a2osoul", name: "A2O SOUL", korean: "에이투오 소울", fan: "미발표", agency: "A2O ENTERTAINMENT", members: ["MOON", "TAI", "GAKU", "SEE-ONE", "SEOHA", "SONO", "LUCIEN", "ZAI", "AYDEN", "ALURE", "ZET", "SORA", "TEO", "JUNE", "HANSUNG"],
    accent: "#8e85fc", light: "#cbe5ff", dark: "#1e2350", shape: "✷", status: "SUPERSTAR · 2026.11.09",
    image: "https://assets.monstr.dev/media/group/aaa802f2e5fe886835dc4933eef8493812d91c5b-w480.webp",
    imageCredit: "A2O Entertainment · PR TIMES", imageLink: "https://prtimes.jp/main/html/rd/p/000000007.000192898.html",
    photos: [
      creditedPhoto("https://assets.monstr.dev/media/group/aaa802f2e5fe886835dc4933eef8493812d91c5b-w480.webp", "SUPERSTAR · 단체", "2026", "A2O Entertainment", "https://prtimes.jp/main/html/rd/p/000000007.000192898.html"),
      creditedPhoto("https://assets.monstr.dev/media/media/bc930cab6fa911b05649407729dcefbd7d168c8d-w480.webp", "인기가요 · 단체", "2026", "SBS KPOP", "https://x.com/kpop_sbs/status/2114210723551445233"),
      creditedPhoto("https://assets.monstr.dev/media/media/dbfa6b5321c46c9ba887d472aebbf6c4b99bdfb6-w480.webp", "M2 릴레이댄스", "2026", "M2 · A2O SOUL", "https://x.com/M2MPD/status/2116417492256166020"),
      creditedPhoto("https://assets.monstr.dev/media/media/20ee677318e7be3b74412416b8ed705470d87019-w480.webp", "SUPERSTAR · 연습실", "2026", "A2O Entertainment", "https://assets.monstr.dev/media/media/20ee677318e7be3b74412416b8ed705470d87019-w480.webp", "사진 파일 ↗"),
      creditedPhoto("https://cdnimg.melon.co.kr/cm2/artistcrop/images/052/17/448/5217448_20261012183224_500.jpg", "데뷔 · 단체", "2026", "A2O Entertainment · Melon", "https://www.melon.com/artist/detail.htm?artistId=5217448")
    ],
    links: [
      { label: "Instagram", icon: "◎", url: "https://www.instagram.com/a2o.soul/" },
      { label: "YouTube", icon: "▷", url: "https://www.youtube.com/@A2OSOUL" },
      { label: "X 공식", icon: "𝕏", url: "https://x.com/A2O_SOUL" },
      { label: "Mnet Plus", icon: "✦", url: "https://artist.mnetplus.world/main/stg/a2osoul" }
    ],
    merch: [
      { title: "SUPERSTAR", sub: "데뷔 EP · 앨범", href: "https://mnetplusmerch.com/product/a2o-soul-album-pre-order-event-ep-superstar-soul-ver-constellation-ver/1693/category/195/display/1/" },
      { title: "Mnet Plus", sub: "공식 팬 커뮤니티", href: "https://artist.mnetplus.world/main/stg/a2osoul" },
      { title: "SUPERSTAR · 영상통화 이벤트 Ⅱ", sub: "Mnet Plus Merch · 11.10 12:00~11.12 23:59(KST) 구매 응모·포토카드", href: "https://mnetplusmerch.co.kr/product/a2o-soul-group-video-call-event-ep-superstar-soul-ver-constellation-ve/1774/category/195/display/1/" }
    ],
    music: [
      { title: "SUPERSTAR", date: "2026.11.09", type: "데뷔 EP · 더블 타이틀", songs: ["SUPERSTAR", "Dancing in the Dark", "While We’re Young", "Very First Love (첫사랑)", "Moonlight Shadow"], href: "https://www.melon.com/album/detail.htm?albumId=14644792" }
    ],
    appearances: [
      { date: "2026-11-14", title: "SUPERSTAR 공개 팬사인회", sub: "스타필드 수원 · MUSICART", href: "https://musicart.kr/shop/shopdetail.html?branduid=3531976" },
      { date: "2026-11-18", title: "단체 영상통화 팬사인회", sub: "MAKESTAR · 19:00", href: "https://www.makestar.com/product/21876" },
      { date: "2026-11-20", title: "단체 대면 팬사인회", sub: "MAKESTAR · 20:00", href: "https://www.makestar.com/product/21876" },
      { date: "2026-11-21", title: "SUPERSTAR 팬사인회", sub: "WITHMUU · 18:30", href: "https://withmuu.com/goods/event_sale.php?sno=1650" }
    ],
    schedules: [
      { title: "Mnet Plus", sub: "일정·공지", href: "https://artist.mnetplus.world/main/stg/a2osoul" },
      { title: "A2O SOUL 공식 X", sub: "행사·활동 안내", href: "https://x.com/A2O_SOUL" }
    ],
    news: [
      { date: "11.10", tag: "굿즈", title: "SUPERSTAR 영상통화 이벤트 Ⅱ · 11/12 응모 마감", href: "https://mnetplusmerch.co.kr/product/a2o-soul-group-video-call-event-ep-superstar-soul-ver-constellation-ve/1774/category/195/display/1/" },
      { date: "11.09", tag: "뮤직비디오", title: "Dancing in the Dark · 공식 MV 공개", href: "https://www.youtube.com/watch?v=JPJokqIoIJI" },
      { date: "11.09", tag: "데뷔 EP", title: "SUPERSTAR · 5곡 발매", href: "https://www.melon.com/album/detail.htm?albumId=14644792" },
      { date: "10.13", tag: "음원", title: "SUPERSTAR 선공개", href: "https://www.melon.com/artist/detail.htm?artistId=5217448" }
    ]
  }
];
