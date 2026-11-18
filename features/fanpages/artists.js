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
      { title: "2027 시즌그리팅 · PAGES OF YOUTH", sub: "2026.12.22 발매 · 예약·재고는 판매처 확인", href: "https://www.kpopfriends.com/product/리센느-rescene-2027-시즌그리팅-pages-of-youth/7123/category/574/display/1/" },
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
      { date: "2026-11-24", title: "멜론 STAGE 99 팬밋업", sub: "서울 마포구 무신사 개러지 · 추첨 초청 560명 · 응모 종료", href: "https://www.asiae.co.kr/article/2026110409590132572" },
      { date: "2026-11-29", title: "후즈팬 PULSE 대면·영상통화 팬사인회", sub: "대면 14:00 · 장소 및 영상통화 참여 개별 안내 · 응모 종료", href: "https://whosfanstore.zendesk.com/hc/ko/articles/63913860664217--%EB%8B%B9%EC%B2%A8%EC%9E%90-%EB%B0%9C%ED%91%9C-RESCENE-%EB%A6%AC%EC%84%BC%EB%8A%90-4th-Mini-Album-PULSE-%EB%8C%80%EB%A9%B4-%EA%B0%9C%EC%9D%B8-%EC%98%81%EC%83%81%ED%86%B5%ED%99%94-%ED%8C%AC%EC%82%AC%EC%9D%B8%ED%9A%8C-11-29-%EC%9D%B4%EB%B2%A4%ED%8A%B8" },
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
      { date: "11.15", tag: "수상", title: "〈인기가요〉 ‘With’ 1위 · 음악방송 4관왕", href: "https://www.soompi.com/article/1887262wpp/watch-rescene-snags-4th-win-for-with-on-inkigayo-performances-by-bestie-ateez-nct-dream-and-more" },
      { date: "11.14", tag: "수상", title: "MMA2026 글로벌 TOP10·모두의 스타·핫트렌드 3관왕", href: "https://www.xportsnews.com/article/2219598" },
      { date: "11.14", tag: "수상", title: "〈쇼! 음악중심〉 ‘With’ 1위", href: "https://www.soompi.com/article/1886997wpp/watch-rescene-takes-3rd-win-for-with-on-music-core-performances-by-bestie-ateez-nct-dream-and-more" },
      { date: "11.11", tag: "수상", title: "〈쇼챔피언〉 ‘With’ 1위", href: "https://www.soompi.com/article/1886056wpp/watch-rescene-takes-2nd-win-for-with-on-show-champion-performances-by-p1harmony-xlov-and-more" },
      { date: "11.10", tag: "수상", title: "〈더쇼〉 ‘With’ 1위", href: "https://www.soompi.com/article/1885603wpp/watch-rescene-takes-1st-win-for-with-on-the-show" },
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
      { title: "Looks Can Kill · 일본 구매 특전 응모", sub: "일본 구매자 추첨 2차 응모 진행 · 12/19 도쿄 회차 12/6, 2027/1/16~17 회차 1/5 마감 · 공식 조건 확인", href: "https://www.sonymusic.co.jp/artist/IVE/info/588141" },
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
      { date: "2026-11-21", title: "2026 MAMA AWARDS", sub: "교세라 돔 오사카 · CHAPTER 2 · 15:00(JST)", href: "https://www.cj.net/jp/press-release/view/1133" },
      { date: "2026-12-13", title: "뮤직뱅크 글로벌 페스티벌", sub: "도쿄 MUFG 스타디움(국립경기장) · IVE 출연 확정", href: "https://music-bank.jp/" },
      { date: "2026-12-19", title: "Looks Can Kill · 일본 구매자 추첨 이벤트", sub: "도쿄 아리아케 센트럴타워 홀 B · 당첨자 대상 촬영·사인·포스트카드 행사 · 시간은 주최 공지 확인", href: "https://www.sonymusic.co.jp/artist/IVE/info/588141" },
      { date: "2027-01-16", title: "Looks Can Kill · 일본 구매자 추첨 이벤트", sub: "도쿄 포트시티 다케시바 포트홀 · 당첨자 대상 촬영·사인·포스트카드 행사 · 시간은 주최 공지 확인", href: "https://www.sonymusic.co.jp/artist/IVE/info/588141" },
      { date: "2027-01-17", title: "Looks Can Kill · 일본 구매자 추첨 이벤트", sub: "오사카 우메다 크리스털홀 · 당첨자 대상 촬영·사인·포스트카드 행사 · 시간은 주최 공지 확인", href: "https://www.sonymusic.co.jp/artist/IVE/info/588141" }
    ],
    campaigns: [
      { kind: "홍보대사", date: "2026.09.17", title: "UGG 아시아·태평양 앰배서더 · 장원영", sub: "UGG Born to Feel 2026 가을·겨울 캠페인 · Deckers Japan 공식 발표", href: "https://prtimes.jp/main/html/rd/p/000000784.000003434.html" },
      { kind: "홍보대사", date: "2026.08.19", title: "AGE20'S 글로벌 앰배서더 · 레이", sub: "에이지투웨니스 리브랜딩·뷰티 캠페인 · 애경산업 발표", href: "https://biz.heraldcorp.com/article/10844878" },
      { kind: "홍보대사", date: "2026.02.02", title: "메종 발렌티노 · 레이·리즈", sub: "공식 브랜드 앰배서더 임명 · 발렌티노 발표", href: "https://prtimes.jp/main/html/rd/p/000000257.000101366.html" },
      { kind: "광고", date: "2026.03.30", title: "App Store × IVE · Fashion", sub: "일본 App Store 캠페인 음악 · 레이 내레이션", href: "https://www.sonymusic.co.jp/artist/IVE/info/582822" }
    ],
    schedules: [
      { title: "일본 공식 일정", sub: "IVE JAPAN OFFICIAL SITE · SCHEDULE", href: "https://ive-official.jp/mob/news/diarKiji.php?cd=SCHEDULE&site=DIVE" },
      { title: "실시간 일정", sub: "blip", href: "https://blip.kr/artists/IVE/schedule?unitId=85" },
      { title: "공식 커뮤니티", sub: "Berriz", href: "https://link.berriz.in/web/main/IVE" }
    ],
    news: [
      { date: "11.16", tag: "후보", title: "〈BANG BANG〉 2027 그래미 ‘베스트 아시안 팝 퍼포먼스’ 후보", href: "https://www.grammy.com/songs/bang-bang-2/" },
      { date: "11.15", tag: "수상", title: "MMA2026 ‘올해의 베스트송’ 대상 등 총 5관왕", href: "https://www.melon.com/mma/result.htm?mmaYear=2026" },
      { date: "11.07", tag: "영상", title: "〈Looks Can Kill〉 안무 연습 비하인드 공개", href: "https://www.youtube.com/watch?v=sheag2-3h_o" },
      { date: "10.29", tag: "행사", title: "〈Looks Can Kill〉 구매자 추첨 이벤트·특전 일정 발표", href: "https://www.sonymusic.co.jp/artist/IVE/info/588141" },
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
      commonsPhoto('Aespa at Mise-en-Scene event on 19022026 (8).png', '미장센 · 포토월 08', '2026', '티비텐 TV10'),
      commonsPhoto('Aespa - 55580814509.jpg', '시애틀 공연 · 그룹 (원본 AI 보정)', '2026', 'David Lee · AI 보정 원본', 'CC BY 4.0'),
      commonsPhoto('03112026 Aespa NingNing Airport Departure 11.png', '닝닝 · 김포공항 (11.03)', '2026', 'K-POPIT 케이팝잇', 'CC BY 4.0')
    ],
    links: [
      { label: "Instagram", icon: "◎", url: "https://www.instagram.com/aespa_official/" },
      { label: "YouTube", icon: "▷", url: "https://www.youtube.com/@aespa" },
      { label: "X 공식", icon: "𝕏", url: "https://x.com/aespa_official" },
      { label: "Weverse", icon: "✦", url: "https://weverse.io/aespa/feed" }
    ],
    merch: [
      { title: "데뷔 6주년 공식 MD · 플리스 재킷 세트", sub: "SMTOWN &STORE 예약 · 11.17 10:00~11.22 23:59(KST) · 재고는 판매처 확인", href: "https://www.smtownandstore.com/product/aespa-6th-anniversary-pre-order-fleece-jacket-set/29758/category/646/display/1/" },
      { title: "Weverse Shop", sub: "공식 굿즈", href: "https://shop.weverse.io/ko/shop/KRW/artists/133" },
      { title: "SMTOWN SHOP", sub: "앨범·MD", href: "https://global.shop.smtown.com/collections/aespa" },
      { title: "2027 시즌그리팅 Kit", sub: "공식 예약 상품 · Weverse Shop", href: "https://shop.weverse.io/en/shop/USD/artists/133/sales/69859" },
      { title: "2027 시즌그리팅 Set", sub: "공식 예약 상품 · Weverse Shop", href: "https://shop.weverse.io/en/shop/USD/artists/133/sales/69861" },
      { title: "KISS N TELL", sub: "일본 미니 1집 · 공식 CD 안내", href: "https://aespa-official.jp/discography/kissntell/" },
      { title: "KISS N TELL · Happy Holiday 응모", sub: "지정 판매처 구매 시 사인회 응모 코드 · 11.16~11.25(JST) 접수", href: "https://aespa-official.jp/news/happyholiday2026/" }
    ],
    music: [
      { title: "Santa Baby (with Eartha Kitt)", date: "2026.11.13", type: "협업 디지털 싱글", songs: ["Santa Baby"], href: "https://www.yna.co.kr/amp/view/AKR20261113047000005" },
      { title: "SYNK : COMPLaeXITY", date: "2026.09.14", type: "스페셜 디지털 싱글 · 멤버 솔로 4곡", songs: ["16 Bit (KARINA Solo)", "Saddle Up (WINTER Solo)", "BYEB4HELLO (GISELLE Solo)", "I Love You But I Gotta Let You Go (NINGNING Solo)"], href: "https://music.apple.com/us/album/synk-complaexity-2026-special-digital-single-ep/6808550171" },
      { title: "KISS N TELL", date: "2026.07.24", type: "일본 미니 1집", songs: ["KISS N TELL", "Orbit Pop", "Fangirl", "ATTITUDE", "Done with Rules", "In Halo"], href: "https://aespa-official.jp/discography/kissntell/" },
      { title: "LEMONADE", date: "2026.05.29", type: "정규 2집", songs: ["WDA (Whole Different Animal) (Feat. G-DRAGON)", "LEMONADE", "SHAKIN‘", "Can‘t Help Myself", "Camouflage", "Bite", "Switchblade (Feat. Ty Dolla $ign)", "Roll", "My Plan", "’Til We Die"], href: "https://aespa-official.jp/discography/lemonade/" },
      { title: "Rich Man", date: "2025.09.05", type: "미니 6집", songs: ["Rich Man", "Drift", "Bubble", "To The Girls"], href: "https://aespa-official.jp/discography/richman/" },
      { title: "Whiplash", date: "2024.10.21", type: "미니 5집", songs: ["Whiplash", "Kill It", "Flights, Not Feelings"], href: "https://aespa-official.jp/discography/whiplash/" }
    ],
    appearances: [
      { date: "2026-11-27", title: "저스트 메이크업 2 첫 공개 · 윈터 MC 출연", sub: "쿠팡플레이 · 17:00(KST) · 윈터·태연·나연·임윤아·장도연 5MC", href: "https://enews.imbc.com/News/ViewAmp/525108" },
      { date: "2026-11-28", title: "2026 aespa FAN MEETING · 1회", sub: "고려대학교 화정체육관 · 18:00(KST) · 멜론티켓", href: "https://weverse.io/aespa/notice/40306" },
      { date: "2026-11-29", title: "2026 aespa FAN MEETING · 2회", sub: "고려대학교 화정체육관 · 16:00(KST) · 온라인 생중계 동시 진행", href: "https://weverse.io/aespa/notice/40306" },
      { date: "2026-12-09", title: "2026 FNS 가요제 · 제2야", sub: "후지TV · 18:30~21:54(JST) 생방송 출연", href: "https://aespa-official.jp/news/fns02/" },
      { date: "2026-12-10", title: "KISS N TELL Happy Holiday · 사인회", sub: "일본 도쿄도 내 · 멤버 전원 참여 · 시간·장소는 당첨자 별도 안내 · 11.16~11.25 응모(JST)", href: "https://aespa-official.jp/news/happyholiday2026/" },
      { date: "2026-12-12", title: "뮤직뱅크 글로벌 페스티벌", sub: "도쿄 MUFG 스타디움(국립경기장) · 17:00 예정(JST)", href: "https://music-bank.jp/" },
      { date: "2027-03-06", title: "2027 aespa 일본 돔 투어 · 도쿄 1회", sub: "도쿄돔 · 18:30(JST) 공연 시작 · MY-J 선예매 2026.11.16~11.29(추첨)", href: "https://aespa-official.jp/news/dometour2027-fc/" },
      { date: "2027-03-07", title: "2027 aespa 일본 돔 투어 · 도쿄 2회", sub: "도쿄돔 · 16:00(JST) 공연 시작 · MY-J 선예매 2026.11.16~11.29(추첨)", href: "https://aespa-official.jp/news/dometour2027-fc/" },
      { date: "2027-04-03", title: "2027 aespa 일본 돔 투어 · 오사카 1회", sub: "교세라돔 오사카 · 18:30(JST) 공연 시작 · MY-J 선예매 2026.11.16~11.29(추첨)", href: "https://aespa-official.jp/news/dometour2027-fc/" },
      { date: "2027-04-04", title: "2027 aespa 일본 돔 투어 · 오사카 2회", sub: "교세라돔 오사카 · 16:00(JST) 공연 시작 · MY-J 선예매 2026.11.16~11.29(추첨)", href: "https://aespa-official.jp/news/dometour2027-fc/" }
    ],
    campaigns: [
      { kind: "콜라보", date: "2026.11.13", title: "Eartha Kitt × aespa · Santa Baby", sub: "원곡 보컬과 협업한 디지털 싱글 · Primary Wave Music / SM", href: "https://www.yna.co.kr/amp/view/AKR20261113047000005" },
      { kind: "콜라보", date: "2026.11.13", title: "☆Taku Takahashi (m-flo) × aespa", sub: "〈KISS N TELL〉 리믹스 협업 발표 · 11월 20일 공개 예정", href: "https://aespa-official.jp/news/kissntell-remix/" },
      { kind: "콜라보", date: "2026.11.13", title: "Setlog × aespa", sub: "〈KISS N TELL〉 리믹스 사전 체험 · 기간 한정 영상 효과", href: "https://aespa-official.jp/news/kissntell-remix/" },
      { kind: "홍보대사", date: "2026.09.09", title: "MARK & LONA · 카리나", sub: "2026 가을·겨울 컬렉션 공식 브랜드 앰배서더 활동", href: "https://aespa-official.jp/news/mark-lona-2026/" }
    ],
    schedules: [
      { title: "공식 일정", sub: "일본 공식 사이트", href: "https://aespa-official.jp/schedule/" },
      { title: "공식 뉴스", sub: "일본 공식 사이트", href: "https://aespa-official.jp/news/" },
      { title: "공식 공지", sub: "Weverse", href: "https://weverse.io/aespa/notice" }
    ],
    news: [
      { date: "11.17", tag: "굿즈", title: "데뷔 6주년 기념 공식 MD 예약 판매 · 11월 22일 마감", href: "https://www.smtownandstore.com/product/aespa-6th-anniversary-pre-order-fleece-jacket-set/29758/category/646/display/1/" },
      { date: "11.17", tag: "방송", title: "윈터, 쿠팡플레이 〈저스트 메이크업 2〉 MC 합류 · 11월 27일 공개", href: "https://enews.imbc.com/News/ViewAmp/525108" },
      { date: "11.16", tag: "공연", title: "2027년 3~4월 도쿄·오사카 돔 투어 4회 확정 · MY-J 선예매 시작", href: "https://aespa-official.jp/news/dometour2027-fc/" },
      { date: "11.14", tag: "수상", title: "MMA2026 글로벌-K 아티스트 대상·글로벌 TOP10 2관왕", href: "https://www.melon.com/mma/result.htm?mmaYear=2026" },
      { date: "11.13", tag: "음악", title: "Eartha Kitt와 협업한 〈Santa Baby〉 싱글 발매", href: "https://www.yna.co.kr/amp/view/AKR20261113047000005" },
      { date: "11.13", tag: "음악", title: "〈KISS N TELL〉 ☆Taku Takahashi 리믹스 11월 20일 발매 예고", href: "https://aespa-official.jp/news/kissntell-remix/" },
      { date: "11.13", tag: "행사", title: "12월 10일 도쿄 사인회 확정 · 11월 16~25일 응모", href: "https://aespa-official.jp/news/happyholiday2026/" },
      { date: "11.13", tag: "기록", title: "〈LEMONADE〉 뮤직비디오 1억 조회수 돌파", href: "https://www.soompi.com/article/1886736wpp/aespas-lemonade-becomes-their-12th-mv-to-hit-100-million-views" },
      { date: "11.10", tag: "팬미팅", title: "11월 29일 팬미팅 온라인 생중계·시청권 안내", href: "https://aespa-official.jp/news/fanmeeting2026-streaming/" },
      { date: "11.03", tag: "방송", title: "12월 9일 후지TV FNS 가요제 출연 발표", href: "https://aespa-official.jp/news/fns02/" },
      { date: "07.24", tag: "음악", title: "일본 미니 1집 〈KISS N TELL〉 발매", href: "https://aespa-official.jp/news/kissntell-release/" },
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
      { title: "2027 시즌그리팅 · FIM IN BLOOM", sub: "글로벌 예약 2026.11.17 11:00~12.07 23:59 KST · 12.08 출시 · 수량 소진 시 조기 종료", href: "https://shop.weverse.io/ko/shop/KRW/artists/50/notices/14945" },
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
      { date: "2026-11-21", title: "2026 MAMA AWARDS", sub: "일본 오사카 · CHAPTER 2", href: "https://www.cj.net/jp/press-release/view/1132" },
      { date: "2026-11-27", title: "PUREFLOW pt.1 · 싱가포르 팬사인회", sub: "14:30 SGT · House of K-pop 주관 추첨 행사 · 11.17 응모 마감 · 장소는 주최 안내 확인", href: "https://houseofkpop.com/products/singapore-fan-sign-event-le-sserafim-2nd-studio-album-pureflow-pt-1-compact-ver" },
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
      { kind: "광고", date: "2026.09.07", title: "카즈하 × 시세이도 마끼아쥬", sub: "일본 화장품 브랜드 Maquillage 공식 뮤즈 · 디지털 광고·공식 SNS", href: "https://www.le-sserafim.jp/news/83d065b424d1" },
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
      { date: "2026.11.16", tag: "굿즈", title: "2027 시즌그리팅 FIM IN BLOOM 11.17 예약 시작 · 12.07 마감, 12.08 출시", href: "https://shop.weverse.io/ko/shop/KRW/artists/50/notices/14945" },
      { date: "2026.11.13", tag: "팬사인회", title: "11.27 싱가포르 PUREFLOW 앨범 팬사인회 응모 안내", href: "https://houseofkpop.com/products/singapore-fan-sign-event-le-sserafim-2nd-studio-album-pureflow-pt-1-compact-ver" },
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
      { title: "NAYEON · NA-sty", sub: "11.20 한국 발매 · 카세트 2종 · 일본 특전 시리얼 등록 11.16 18:00~12.25 18:00(JST) · 재고는 공식몰 확인", href: "https://www.twicejapan.com/news/detail/2059" },
      { title: "THIS IS FOR · 서울 피날레 라이브 LP", sub: "2026.10.16 발매 · 2LP · JYP JAPAN 공식 판매처", href: "https://jypj-store.com/collections/twice-official-goods/products/tw26-tff-0001" },
      { title: "#BEST 2015-2025 · 한정 BOX", sub: "2026.12.16 발매 예정 · 수량·재고는 공식 판매처 확인", href: "https://jypj-store.com/collections/twice-official-goods/products/tw26-bes-0003" },
      { title: "THIS IS FOR · MUFG STADIUM 라이브 Blu-ray/DVD", sub: "2026.12.02 발매 예정 · 일본 공식 디스코그래피", href: "https://www.twicejapan.com/discography/detail/92/" },
      { title: "TWICE OFFICIAL", sub: "공식 스토어 · FANS SHOP", href: "https://app.fans/shop/twice" },
      { title: "JYP FANS", sub: "커뮤니티", href: "https://app.fans/community/twice" }
    ],
    music: [
      { title: "THIS IS FOR WORLD TOUR FINALE in SEOUL - LIVE", date: "2026.10.16", type: "서울 피날레 라이브 음반 · 26곡", songs: ["FOUR", "THIS IS FOR", "Strategy", "MAKE ME GO", "SET ME FREE"], href: "https://music.apple.com/us/album/this-is-for-world-tour-finale-in-seoul-live/6812503580" },
      { title: "#BEST 2015-2025", date: "2026.08.26", type: "일본 베스트 앨범 · 4CD", songs: ["Like OOH-AHH", "CHEER UP", "TT", "Feel Special", "ME + YOU"], href: "https://www.twicejapan.com/discography/detail/91/" },
      { title: "MISAMO · PLAY", date: "2026.02.04", type: "일본 정규 1집 · 통상반 12곡(구성판별 차이)", songs: ["Confetti", "Hmm", "Not a Goodbye", "Deep Eden", "Red Diamond", "Catch My Eye", "Kitty (MOMO Solo)", "Ma Cherry (SANA Solo)", "Turning Tables (MINA Solo)", "Identity", "Do not touch", "Message"], href: "https://wmg.jp/twice/discography/32400" },
      { title: "TEN: The Story Goes On", date: "2025.10.10", type: "데뷔 10주년 스페셜 앨범", songs: ["ME+YOU", "MEEEEEE", "FIX A DRINK", "CHESS"], href: "https://twice.jype.com/discography?AmSeq=1&PgIndex=1" },
      { title: "THIS IS FOR", date: "2025.07.11", type: "정규 4집", songs: ["THIS IS FOR", "FOUR", "OPTIONS", "MARS"], href: "https://twice.jype.com/discography/7lpxlcye" },
      { title: "STRATEGY", date: "2024.12.06", type: "미니 14집", songs: ["Strategy (feat. Megan Thee Stallion)", "Kiss My Troubles Away", "Sweetest Obsession"], href: "https://twice.jype.com/discography/1xokcjbo" },
      { title: "With YOU-th", date: "2024.02.23", type: "미니 13집", songs: ["ONE SPARK", "I GOT YOU"], href: "https://twice.jype.com/discography/jfzzhl4x" }
    ],
    appearances: [
      { date: "2026-11-20", title: "나연 · NA-sty Spotify 리스닝 파티", sub: "17:30 KST · 나연 참여 · 일부 지역 Spotify Premium 이용자 대상", href: "https://x.com/JYPETWICE/status/2121588975634952562" },
      { date: "2026-11-20", title: "나연 · NA-sty 싱글 발매", sub: "JYP · 한국 정식 발매일 (예약 공지와 구별)", href: "https://www.twicejapan.com/news/detail/2059" },
      { date: "2026-11-21", title: "2026 MAMA AWARDS", sub: "나연 솔로 출연 · 일본 오사카", href: "https://www.cj.net/jp/press-release/view/1132" },
      { date: "2026-11-22", title: "나연 · NA-sty 오사카 구매자 특전회", sub: "WITHMUU JAPAN 주최 · 일본 오사카 · 당첨자에게 장소 별도 안내", href: "https://x.com/withmuu_jp/status/2120761807858241963" },
      { date: "2026-11-27", title: "정연 · tvN 그냥사람친구 첫 방송", sub: "20:35 KST · 정연·주헌 등 출연 · tvN", href: "https://sports.khan.co.kr/article/202611041439003" },
      { date: "2026-11-29", title: "MISAMO · K-WONDER 콘서트 1회차", sub: "13:00 대만 현지(14:00 KST) · 가오슝 아레나 · SHOW Office 주최 · 예매·변경은 공식 판매처 확인", href: "https://ticketplus.com.tw/activity/f79e13ad9885c42f0f8103d9716e9b15" },
      { date: "2026-11-29", title: "MISAMO · K-WONDER 콘서트 2회차", sub: "18:00 대만 현지(19:00 KST) · 가오슝 아레나 · SHOW Office 주최 · 예매·변경은 공식 판매처 확인", href: "https://ticketplus.com.tw/activity/f79e13ad9885c42f0f8103d9716e9b15" },
      { date: "2026-11-30", title: "쯔위 · OWNDAYS OFF STAGE WITH TZUYU", sub: "싱가포르 ION Orchard 1층 아트리움 · 당첨자 대상 촬영 행사 · 11.16~25 공식 구매 응모, 시간은 주최 측 확인", href: "https://www.owndays.com/sg/en/news/ambassador_tzuyu" },
      { date: "2026-12-12", title: "뮤직뱅크 글로벌 페스티벌", sub: "MISAMO·나연 공연, 사나 MC · 도쿄 MUFG 스타디움 · 현지 17:00 개막 예정", href: "https://music-bank.jp/" },
      { date: "2027-01-23", title: "나연 · NA-sty 발매 기념 밋앤그릿", sub: "도쿄 · 추첨 당첨자 대상 사인·2샷 촬영·배웅회 · 정확한 장소·시각은 당첨자 안내", href: "https://www.twicejapan.com/news/detail/2066" }
    ],
    campaigns: [
      { kind: "홍보대사", date: "2026.11.16", title: "쯔위 × OWNDAYS 동남아 지역 브랜드 홍보대사", sub: "싱가포르·대만 등 아시아 지역 안경 브랜드 캠페인 · 11.30 싱가포르 행사 예정 · 응모·제품 조건은 공식 사이트 확인", href: "https://www.owndays.com/sg/en/news/ambassador_tzuyu" },
      { kind: "홍보대사", date: "2026.04.08", title: "MISAMO × ReFa MUSE", sub: "모모·사나·미나 · 일본 헤어케어 브랜드 홍보대사 · 11.13 신규 광고 영상 공개", href: "https://www.refa.net/news/260408.html" },
      { kind: "콜라보", date: "2026.10.28", title: "나연 × CHAGEE 필리핀", sub: "11.14 첫 플래그십 개점 기념 팬 행사 · 포토카드 구매 응모는 11.11 종료", href: "https://thelookout.com.ph/article/nayeon-of-twice-returns-to-manila-for-chagees-first-philippine-flagship-store-opening" },
      { kind: "광고", date: "2026.01.07", title: "나연·모모·지효·쯔위 × Victoria’s Secret PINK", sub: "2026 발렌타인 Wink 컬렉션 캠페인 모델 · 시즌 협업", href: "https://www.victoriassecret.com/us/pink/new-arrivals/trending-now" },
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
      { date: "11.17", tag: "활동", title: "나연, NA-sty 제작 과정·BABY ANGEL 소개 · Spotify 영상 팟캐스트 첫 화 공개", href: "https://sports.khan.co.kr/en/article/202611171831007" },
      { date: "11.16", tag: "협업", title: "쯔위, OWNDAYS 아시아 지역 홍보대사 발표 · 11.30 싱가포르 행사 예고", href: "https://www.owndays.com/sg/en/news/ambassador_tzuyu" },
      { date: "11.16", tag: "영상", title: "MISAMO × ReFa MUSE 새 메이킹 영상 공개", href: "https://www.youtube.com/watch?v=LFE1pgcdc18" },
      { date: "11.14", tag: "행사", title: "나연 NA-sty · 11.20 17:30 Spotify 공식 리스닝 파티 발표", href: "https://x.com/JYPETWICE/status/2121588975634952562" },
      { date: "11.13", tag: "광고", title: "MISAMO × ReFa MUSE · 헤어케어 새 공식 광고 영상 공개", href: "https://prtimes.jp/main/html/rd/p/000001140.000029736.html" },
      { date: "11.13", tag: "굿즈", title: "나연 ‘NA-sty’ 공식 특전 포토카드 2종 공개 · 2027.01.23 팬 이벤트 세부 안내", href: "https://www.twicejapan.com/news/detail/2066" },
      { date: "11.10", tag: "공지", title: "나연 'NA-sty' 팬 이벤트 장소·응모 안내 정정", href: "https://www.twicejapan.com/news/detail/2065" },
      { date: "11.06", tag: "음반", title: "나연 'NA-sty' 11.20 발매 · 카세트 2종 예약", href: "https://www.twicejapan.com/news/detail/2059" },
      { date: "11.06", tag: "공연", title: "MISAMO, 11.29 대만 K-WONDER 가오슝 콘서트 오후 1시 추가 공연 발표", href: "https://ticketplus.com.tw/activity/f79e13ad9885c42f0f8103d9716e9b15" },
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
      commonsPhoto('29102026 ILLIT TOP TEN AWARDS.png', '2026 TTA 여자 아이돌 그룹 1위', '2026', 'K-POPIT 케이팝잇', 'CC BY 4.0'),
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
      { title: "BREAK EVEN 공식 MD", sub: "2026.10.26부터 공식 판매 · 한정 수량·재고는 판매처 확인", href: "https://shop.weverse.io/en/shop/JPY/artists/120/notices/14674" },
      { title: "BREAK EVEN · Little Mimi Ver.", sub: "2026.12.30 발매 예정 · 11.05부터 예약판매 · 재고는 판매처 확인", href: "https://shop.weverse.io/en/shop/KRW/artists/120/sales/71786" },
      { title: "DEARLIT 공식 캐릭터 MD", sub: "2026.09.02부터 한정 수량 판매 · 재고 확인 필요", href: "https://shop.weverse.io/ko/shop/KRW/artists/120/notices/14153" },
      { title: "Weverse Shop", sub: "아일릿 앨범·공식 굿즈", href: "https://shop.weverse.io/ko/shop/KRW/artists/120" },
      { title: "BELIFT LAB", sub: "공식 앨범 안내", href: "https://beliftlab.com/artist/discography/ILLIT" }
    ],
    music: [
      { title: "You're Under Arrest (Remixes)", date: "2026.11.06", type: "리믹스 싱글", songs: ["You're Under Arrest", "You're Under Arrest (Kids Remix)", "You're Under Arrest (Whistle Remix)", "You're Under Arrest (Club Remix)", "You're Under Arrest (Hyper Remix)", "You're Under Arrest (Sped Up)", "You're Under Arrest (Slowed + Reverb)"], href: "https://weverse.io/illit/notice/40642" },
      { title: "BREAK EVEN", date: "2026.10.26", type: "미니 5집", songs: ["Super in Love", "More", "체포하겠어 (You're Under Arrest)", "Pop"], href: "https://beliftlab.com/artist/discography/ILLIT/22" },
      { title: "MAMIHLAPINATAPAI", date: "2026.04.30", type: "미니 4집", songs: ["It's Me", "GRWM (Get Ready With Me)", "paw, paw!", "Mamihlapinatapai", "Love, older you"], href: "https://beliftlab.com/artist/discography/ILLIT/18" },
      { title: "I Got Your Back", date: "2026.07.29", type: "일본 싱글 2집 · CD(디지털 07.26)", songs: ["I Got Your Back (Feat. JISOO, MOMOKA of HANA)", "Sunday Morning", "I Got Your Back (Korean Ver. · CD 선공개)"], href: "https://illit-official.jp/news/22aaf80abbe2" },
      { title: "NOT CUTE ANYMORE", date: "2025.11.24", type: "싱글 1집", songs: ["NOT CUTE ANYMORE", "NOT ME"], href: "https://beliftlab.com/artist/discography/ILLIT/16" },
      { title: "bomb", date: "2025.06.16", type: "미니 3집", songs: ["little monster", "빌려온 고양이 (Do the Dance)", "jellyous", "oops!", "밤소풍 (bamsopoong)"], href: "https://beliftlab.com/artist/discography/ILLIT/15" },
      { title: "I'LL LIKE YOU", date: "2024.10.21", type: "미니 2집", songs: ["I'll Like You", "Cherish (My Love)", "IYKYK (If You Know You Know)", "Pimple", "Tick-Tack"], href: "https://beliftlab.com/artist/discography/ILLIT/11" },
      { title: "SUPER REAL ME", date: "2024.03.25", type: "미니 1집", songs: ["My World", "Magnetic", "Midnight Fiction", "Lucky Girl Syndrome"], href: "https://beliftlab.com/artist/discography/ILLIT/8" }
    ],
    appearances: [
      { date: "2026-11-20", title: "2026 MAMA AWARDS", sub: "일본 오사카 · CHAPTER 1 · 출연·편성 변경은 공식 확인", href: "https://www.cj.net/jp/press-release/view/1132", timeZone: "Asia/Tokyo" },
      { date: "2026-11-28", title: "NTV 베스트 아티스트", sub: "일본 NTV 음악 특집 · 방송 시간·내용은 공식 편성 확인", href: "https://www.atstar1.com/news/articleView.html?idxno=6040730", timeZone: "Asia/Tokyo" },
      { date: "2026-12-02", title: "2026 FNS 가요제", sub: "일본 후지TV 음악 방송 · 방송 시간은 공식 편성 확인", href: "https://www.atstar1.com/news/articleView.html?idxno=6040730", timeZone: "Asia/Tokyo" },
      { date: "2026-12-23", title: "PRESS START❤ ENCORE in JAPAN", sub: "18:30 · 일본 치바 LaLa arena TOKYO-BAY · 주최 HYBE JAPAN · 예매는 공식 안내", href: "https://www.hybejapan.events/illit/press_start_encore", timeZone: "Asia/Tokyo" },
      { date: "2026-12-24", title: "PRESS START❤ ENCORE in JAPAN", sub: "18:30 · 일본 치바 LaLa arena TOKYO-BAY · 예매는 공식 안내", href: "https://www.hybejapan.events/illit/press_start_encore", timeZone: "Asia/Tokyo" },
      { date: "2026-12-26", title: "PRESS START❤ ENCORE in JAPAN", sub: "17:00 · 일본 치바 LaLa arena TOKYO-BAY · 예매는 공식 안내", href: "https://www.hybejapan.events/illit/press_start_encore", timeZone: "Asia/Tokyo" },
      { date: "2026-12-27", title: "PRESS START❤ ENCORE in JAPAN", sub: "17:00 · 일본 치바 LaLa arena TOKYO-BAY · 예매는 공식 안내", href: "https://www.hybejapan.events/illit/press_start_encore", timeZone: "Asia/Tokyo" },
      { date: "2026-12-31", title: "제77회 NHK 홍백가합전", sub: "일본 NHK 연말 음악방송 · 3년 연속 출연 · 방송 시간은 공식 편성 확인", href: "https://www.yna.co.kr/view/AKR20261113101400005", timeZone: "Asia/Tokyo" }
    ],
    campaigns: [
      { kind: "홍보대사", date: "2026.07.03", title: "농협경제지주 × ILLIT · 쌀 소비 촉진", sub: "첫 쌀 소비 촉진 홍보대사 · Like me, like 米 : It\'s 米 캠페인", href: "https://www.yna.co.kr/view/AKR20260703051000005" },
      { kind: "광고", date: "2026.03", title: "FILA", sub: "그룹 스포츠 브랜드 광고 모델 · 빌리프랩 발표", href: "https://www.tenasia.co.kr/article/2026031916524" },
      { kind: "콜라보", date: "2026.03", title: "Rockfish Weatherwear × ILLIT", sub: "2026.03.03 글로벌 협업 컬렉션 출시", href: "https://www.tenasia.co.kr/article/2026031916524" },
      { kind: "홍보대사", date: "2026.09", title: "민주 × Glint by VDIVOV", sub: "멤버 민주 · 뷰티 브랜드 앰배서더 · 09.29 브랜드 발표", href: "https://prtimes.jp/main/html/rd/p/000000035.000064439.html" }
    ],
    schedules: [
      { title: "일본 앙코르 공연", sub: "HYBE JAPAN · 12월 치바 공연·공식 티켓 안내", href: "https://www.hybejapan.events/illit/press_start_encore" },
      { title: "BELIFT LAB 일정", sub: "공식 스케줄", href: "https://beliftlab.com/artist/schedule/ILLIT" },
      { title: "Weverse 공지", sub: "팬 커뮤니티", href: "https://weverse.io/illit/notice" }
    ],
    news: [
      { date: "11.16", tag: "수상", title: "11.15 MMA2026 톱10·글로벌 톱10·베스트 퍼포먼스 여자·글로벌 임팩트 4관왕", href: "https://www.osen.co.kr/article/G1112910990" },
      { date: "11.13", tag: "방송", title: "12.31 NHK 제77회 홍백가합전 3년 연속 출연 발표", href: "https://www.yna.co.kr/view/AKR20261113101400005" },
      { date: "11.06", tag: "수상", title: "뮤직뱅크 ‘체포하겠어’ 1위 · 9,803점", href: "https://www.soompi.com/article/1884749wpp/watch-nmixx-takes-1st-win-for-birthday-wish-on-music-bank-performances-by-ateez-illit-and-more-2" },
      { date: "11.06", tag: "음악", title: "‘You're Under Arrest (Remixes)’ 7곡 발매", href: "https://weverse.io/illit/notice/40642" },
      { date: "10.30", tag: "수상", title: "제15회 TTA 여자 아이돌 그룹 부문 1위", href: "https://www.tenasia.co.kr/article/2026103060504" },
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
      { title: "PAPARAZZI ARRIVE · CD 3종", sub: "MAKESTAR 공식 판매 · 실물 발매 2025.12.03 · 포토북·포토카드 포함", href: "https://www.makestar.com/product/14722" },
      { title: "A2O MAY 음원·음반", sub: "Apple Music · 공식 발매 목록", href: "https://music.apple.com/us/artist/a2o-may/1790290148" },
      { title: "A2O 공식", sub: "새 굿즈 공지", href: "https://www.a2oentertainment.world/" }
    ],
    music: [
      { title: "BAD HABITS TONITE", date: "2026.10.18", type: "싱글 앨범 · 4곡 · 타이틀 BAD HABITS TONITE", songs: ["BAD HABITS TONITE", "I Follow", "BAD HABITS TONITE (Chinese Ver.)", "I Follow (Chinese Ver.)"], href: "https://music.apple.com/us/album/bad-habits-tonite-ep/6822765669" },
      { title: "Love Got Me Ooh", date: "2026.07.17", type: "EP · 4곡", songs: ["Love Got Me Ooh", "Rain On My Parade", "Love Got Me Ooh (Chinese Ver.)", "Rain On My Parade (Chinese Ver.)"], href: "https://music.apple.com/us/album/love-got-me-ooh-ep/6788713890" },
      { title: "PAPARAZZI ARRIVE", date: "2025.10.24", type: "첫 EP · 14곡", songs: [
        "PAPARAZZI ARRIVE (English Ver.)",
        "B.B.B (Bigger Badder Better) [feat. A2O LTG] (English Ver.)",
        "BOSS (English Ver.)",
        "Under My Skin (A2O) (English Ver.)",
        "PAPARAZZI ARRIVE (Chinese Ver.)",
        "B.B.B (Bigger Badder Better) [feat. A2O LTG] (Chinese Ver.)",
        "BOSS (Chinese Ver.)",
        "Under My Skin (A2O) (Chinese Ver.)",
        "SWEAT (MICHE & KAT) (English Edit)",
        "SWEAT (MICHE & KAT) (Spanish Edit)",
        "MELODY (CHENYU & SHIJIE & QUCHANG)",
        "Someone You Loved",
        "Black Sheep",
        "Trip"
      ], href: "https://music.apple.com/us/album/paparazzi-arrive/1843467024" },
      { title: "B.B.B (Bigger Badder Better) (feat. A2O LTG)", date: "2025.08.15", type: "디지털 싱글 · 2곡", songs: ["B.B.B (Bigger Badder Better) [feat. A2O LTG] (English Ver.)", "B.B.B (Bigger Badder Better) [feat. A2O LTG] (Chinese Ver.)"], href: "https://music.apple.com/us/album/b-b-b-bigger-badder-better-feat-a2o-ltg-single/1832034060" },
      { title: "BOSS", date: "2025.04.25", type: "디지털 싱글 · 2곡", songs: ["BOSS (English Version)", "BOSS (Chinese Version)"], href: "https://music.apple.com/us/album/boss-single/1808057841" },
      { title: "Under My Skin (A2O)", date: "2024.12.20", type: "데뷔 싱글", songs: ["Under My Skin (A2O) [English Ver.]", "Under My Skin (A2O) [Chinese Ver.]"], href: "https://music.apple.com/us/album/under-my-skin-a2o-single/1791613999" }
    ],
    appearances: [
      { date: "2026-11-27", title: "《打歌2026》 출연 예정", sub: "공식 팬클럽 11.16 일정 공지 · 방송 시각·장소 미발표 · 최종 편성 확인 필요", href: "https://www.sina.cn/news/detail/5365998939017912.html" },
      { date: "2026-12-18", title: "2026 KBS 가요대축제", sub: "19:00 KST · 서울 KBS 아레나 · 11.13 출연 발표 · KBS 주최", href: "https://www.soompi.com/article/1886817wpp/2026-kbs-song-festival-announces-artist-lineup" }
    ],
    campaigns: [
      { kind: "콜라보", date: "2026.11.13", title: "TASAKI · Ready To Open 주얼리 전시 참석", sub: "상하이 고급 주얼리 행사 · TASAKI 공식 11.15 확인 · 홍보대사 계약 발표 아님", href: "https://www.sina.cn/news/detail/5365317909088145.html" },
      { kind: "콜라보", date: "2026.10.29", title: "FILA FUSION × A2O MAY · OOTidol", sub: "상하이 IDOL 다운 컬렉션 행사·런웨이 (10.29~11.01) · Hypebeast", href: "https://hypebeast.cn/2026/11/fila-fusion-a2o-may-idol" }
    ],
    schedules: [
      { title: "A2O MAY 공식 X", sub: "행사·활동 공지", href: "https://x.com/A2O_MAY" },
      { title: "A2O 공식", sub: "새 일정 확인", href: "https://www.a2oentertainment.world/" }
    ],
    news: [
      { date: "2026.11.16", tag: "행사", title: "11월 27일 《打歌2026》 출연 예정 · 공식 팬클럽 공지", href: "https://www.sina.cn/news/detail/5365998939017912.html" },
      { date: "2026.11.15", tag: "브랜드", title: "TASAKI, A2O MAY의 주얼리 행사 참석 공식 확인", href: "https://www.sina.cn/news/detail/5365317909088145.html" },
      { date: "2026.11.13", tag: "방송", title: "12월 18일 KBS 가요대축제 출연 명단 발표", href: "https://www.soompi.com/article/1886817wpp/2026-kbs-song-festival-announces-artist-lineup" },
      { date: "2026.11.02", tag: "콜라보", title: "FILA FUSION 행사·런웨이 보도 · 행사 10.29~11.01", href: "https://www.sina.cn/news/detail/5360779742414008.html" },
      { date: "2026.10.23", tag: "방송", title: "장쑤TV Music Show 2026 · BAD HABITS TONITE 무대", href: "https://www.youtube.com/watch?v=a2JXTXnqfZc" },
      { date: "2026.10.18", tag: "앨범", title: "BAD HABITS TONITE 발매", href: "https://www.melon.com/album/detail.htm?albumId=14801672" }
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
      commonsPhoto('A2O LITE - OA 0900.jpg', 'OA · 포토 02', '2026', 'K-POPIT 케이팝잇', 'CC BY-SA 4.0'),
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
      { title: "A2O LITE 0TH OFFICIAL MEMBERSHIP", sub: "공식 디지털 멤버십 · 12.11 23:59(KST) 모집 마감 · 조건과 혜택은 공지 확인", href: "https://artist.mnetplus.world/main/stg/a2olite/contents/6ac6f8919e9dbc2c2299b753" }
    ],
    music: [
      { title: "NEON", date: "2026.10.13", type: "데뷔 싱글", songs: ["NEON"], href: "https://www.melon.com/album/detail.htm?albumId=14644795" }
    ],
    appearances: [
      { date: "2026-12-18", title: "2026 KBS 가요대축제", sub: "서울 KBS 아레나 · 19:00(KST) · 11.13 출연 발표", href: "https://www.soompi.com/article/1886817wpp/2026-kbs-song-festival-announces-artist-lineup" },
      { date: "2026-12-25", title: "2026 SBS 가요대전 · DAY 2", sub: "경기 고양 킨텍스 · A2O LITE 출연 · 방청·방송 시각은 SBS 공식 공지 확인", href: "https://news.sbs.co.kr/news/endPage.do?news_id=N1008837439" },
      { date: "2027-01-15", title: "D AWARDS 2027 in PARIS", sub: "DAY 1 · 프랑스 파리 Plenitude Arena · 공연 시각 추후 발표", href: "https://d-awards.world/" }
    ],
    campaigns: [
      { kind: "콜라보", date: "2026.11.18", title: "하퍼스 바자 × 폴로 랄프 로렌 화보", sub: "2026년 12월호 BAZAAR STAR 별책 · 11.21 발간 · 공식 첫 패션 화보, 홍보대사 발표와 별개", href: "https://www.harpersbazaar.co.kr/article/1913190" }
    ],
    schedules: [
      { title: "Mnet Plus 공식", sub: "출연 일정·공지", href: "https://artist.mnetplus.world/main/stg/a2olite" },
      { title: "A2O 공식 링크", sub: "공식 채널 모음", href: "https://linktr.ee/a2o.lite" }
    ],
    news: [
      { date: "2026.11.18", tag: "화보", title: "첫 패션 화보 〈NEON AND BEYOND〉 공개 · 하퍼스 바자 12월호 별책 11.21 발간", href: "https://www.harpersbazaar.co.kr/article/1913190" },
      { date: "2026.11.13", tag: "영상", title: "A2O WORLD · NEON INFINITE 뮤직비디오 공개", href: "https://www.youtube.com/watch?v=G_ej20-QWng" },
      { date: "2026.11.13", tag: "행사", title: "12월 18일 KBS 가요대축제 출연 확정", href: "https://www.soompi.com/article/1886817wpp/2026-kbs-song-festival-announces-artist-lineup" },
      { date: "2026.11.11", tag: "차트", title: "NEON · 써클 디지털·스트리밍·글로벌 K팝 차트 3관왕", href: "https://www.soompi.com/article/1886133wpp/ive-riize-and-illit-top-circle-weekly-charts-a2o-earns-triple-crown" },
      { date: "2026.11.08", tag: "수상", title: "NEON · 인기가요 트리플 크라운·음악방송 통산 11관왕", href: "https://www.soompi.com/article/1885054wpp/watch-a2o-lite-takes-11th-win-and-triple-crown-for-neon-on-inkigayo-performances-by-blackpinks-jisoo-and-more" },
      { date: "10.29", tag: "차트", title: "NEON · 빌보드 Global 200 8위·Global Excl. U.S. 3위", href: "https://prtimes.jp/main/html/rd/p/000000009.000192898.html" },
      { date: "10.28", tag: "행사", title: "D AWARDS 2027 파리 1월 15일 출연 확정", href: "https://d-awards.world/" },
      { date: "10.23", tag: "수상", title: "NEON · 더쇼·쇼챔피언·엠카 3관왕", href: "https://prtimes.jp/main/html/rd/p/000000008.000192898.html" },
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
      { title: "SUPERSTAR", sub: "데뷔 EP · 사전예약 10/21~11/08 종료", href: "https://mnetplusmerch.com/product/a2o-soul-album-pre-order-event-ep-superstar-soul-ver-constellation-ver/1693/category/195/display/1/" },
      { title: "SUPERSTAR · CARABINER Ver.", sub: "공식 유통 실물 음반 · 뮤직아트 · 11/10 출시", href: "https://musicart.kr/shop/shopdetail.html?GfDT=bmp5W11M&branduid=3531929&current_category=014&mcode=000&scode=&search=&sort=regdate&type=P&xcode=014" },
      { title: "SUPERSTAR · 무신사 특전", sub: "뮤직플랜트 공식 유통 음반 · 특전 11/15 23:59 종료 · 판매 상태는 링크 확인", href: "https://www.musinsa.com/products/7641862" },
      { title: "Mnet Plus", sub: "공식 팬 커뮤니티", href: "https://artist.mnetplus.world/main/stg/a2osoul" },
      { title: "SUPERSTAR · 영상통화 이벤트 Ⅱ", sub: "Mnet Plus Merch · 11.10 12:00~11.12 23:59(KST) 구매 응모 종료·포토카드", href: "https://mnetplusmerch.co.kr/product/a2o-soul-group-video-call-event-ep-superstar-soul-ver-constellation-ve/1774/category/195/display/1/" },
      { title: "SUPERSTAR · WITHMUU 팬사인회 특전", sub: "11.14~11.16 23:59(KST) 응모 · 포토카드 15종 중 랜덤 1매 · 판매 조건 공식 확인", href: "https://link.withmuu.com/s9e3EU" },
      { title: "SUPERSTAR · 애플뮤직 팬사인회 특전", sub: "11.22 영상통화·대면 행사 · 11.14 응모 종료 · 음반·포토카드 구성 공식 확인", href: "https://en.applemusic.co.kr/Product/Detail/view/pid/123700/cid/1632" }
    ],
    music: [
      { title: "SUPERSTAR", date: "2026.11.09", type: "데뷔 EP · 더블 타이틀 · 실물 발매 11.10", songs: ["SUPERSTAR", "Dancing in the Dark", "While We’re Young", "Very First Love (첫사랑)", "Moonlight Shadow"], href: "https://www.melon.com/album/detail.htm?albumId=14644792" }
    ],
    appearances: [
      { date: "2026-11-16", title: "아리랑TV SHOW K-POP 사전녹화", sub: "공식 팬클럽 참여 공지 · 시간·장소는 A2O SOUL 공식 공지 확인", href: "https://artist.mnetplus.world/main/stg/a2osoul/contents/6af88433fcbfd2033a1104ee" },
      { date: "2026-11-16", title: "SUPERSTAR 대형 패널 전시 마지막 날", sub: "일본 타워레코드 시부야점 1F · 11/10~16 · 영업시간 내", href: "https://towershibuya.jp/news/2026/11/03/236821" },
      { date: "2026-11-17", title: "SBS Life 더쇼 사전녹화", sub: "Dancing in the Dark · 상세 시간·참여 규정은 공식 공지 확인", href: "https://artist.mnetplus.world/main/stg/a2osoul/contents/6af969c70a97884ab9090a8e" },
      { date: "2026-11-18", title: "단체 영상통화 팬사인회", sub: "MAKESTAR · 19:00", href: "https://www.makestar.com/product/21876" },
      { date: "2026-11-20", title: "단체 대면 팬사인회", sub: "MAKESTAR · 20:00", href: "https://www.makestar.com/product/21876" },
      { date: "2026-11-21", title: "SUPERSTAR 팬사인회", sub: "WITHMUU · 18:30", href: "https://withmuu.com/goods/event_sale.php?sno=1650" },
      { date: "2026-11-22", title: "SUPERSTAR 그룹 영상통화 팬사인회", sub: "애플뮤직 · 18:00 KST · 응모 종료(11.14)", href: "https://en.applemusic.co.kr/Product/Detail/view/pid/123700/cid/1632" },
      { date: "2026-11-22", title: "SUPERSTAR 대면 팬사인회", sub: "애플뮤직 · 19:00 KST · 응모 종료(11.14)", href: "https://jp.applemusic.co.kr/Product/Detail/view/pid/123698/cid/568" },
      { date: "2026-11-25", title: "SUPERSTAR 단체 영상통화 팬사인회", sub: "WITHMUU · 19:00 KST · 응모 11.14~11.16 23:59", href: "https://link.withmuu.com/s9e3EU" },
      { date: "2026-11-27", title: "SUPERSTAR 대면 팬사인회", sub: "WITHMUU · 20:00 KST · 응모 11.14~11.16 23:59", href: "https://link.withmuu.com/s9e3EU" },
      { date: "2026-11-30", title: "SUPERSTAR 패널 전시 마지막 날", sub: "일본 타워레코드 시부야점 5F · 입고일부터 11/30까지", href: "https://towershibuya.jp/news/2026/11/03/236821" }
    ],
    schedules: [
      { title: "Mnet Plus", sub: "일정·공지", href: "https://artist.mnetplus.world/main/stg/a2osoul" },
      { title: "A2O SOUL 공식 X", sub: "행사·활동 안내", href: "https://x.com/A2O_SOUL" }
    ],
    news: [
      { date: "11.15", tag: "방송", title: "SBS 인기가요 · Dancing in the Dark 무대 공개", href: "https://www.youtube.com/watch?v=so6VpcUmQGk" },
      { date: "11.14", tag: "팬이벤트", title: "WITHMUU 11/25 영상통화·11/27 대면 팬사인회 발표 · 응모 11/16 마감", href: "https://link.withmuu.com/s9e3EU" },
      { date: "11.13", tag: "보도", title: "첫 EP SUPERSTAR · 뉴 신스웨이브 음악 조명", href: "https://m.tf.co.kr/read/entertain/2388281.htm" },
      { date: "11.10", tag: "굿즈", title: "SUPERSTAR 영상통화 이벤트 Ⅱ · 11/12 응모 마감", href: "https://mnetplusmerch.co.kr/product/a2o-soul-group-video-call-event-ep-superstar-soul-ver-constellation-ve/1774/category/195/display/1/" },
      { date: "11.09", tag: "뮤직비디오", title: "Dancing in the Dark · 공식 MV 공개", href: "https://www.youtube.com/watch?v=JPJokqIoIJI" },
      { date: "11.09", tag: "데뷔 EP", title: "SUPERSTAR · 5곡 발매", href: "https://www.melon.com/album/detail.htm?albumId=14644792" },
      { date: "11.03", tag: "전시", title: "타워레코드 시부야 SUPERSTAR 기념 패널 전시 · 11/30까지", href: "https://towershibuya.jp/news/2026/11/03/236821" },
      { date: "10.29", tag: "팬이벤트", title: "Mnet Plus Merch 11/15 단체 영상통화·대면 팬사인회 발표", href: "https://mnetplusmerch.com/article/event/8/8892/" },
      { date: "10.13", tag: "음원", title: "SUPERSTAR 선공개", href: "https://www.melon.com/artist/detail.htm?artistId=5217448" }
    ]
  }
];
