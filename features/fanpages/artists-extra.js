/* 21 additional fan spaces, checked 2026-11-11.
   Visual palettes are fan-made interpretations, not official group colors.
   The single lead photo per group comes from Wikimedia Commons with attribution. */
(() => {
  'use strict';
  // Checked against the actual album, artist shop and official notice/calendar pages
  // on 2026-11-11. A profile/home page is not a substitute for a resource destination.
  const officialResources = {
    kissoflife: {
      album: { href: 'https://s2ent.co.kr/36/?bmode=view&idx=16134650&q=YToyOntzOjEyOiJrZXl3b3JkX3R5cGUiO3M6MzoiYWxsIjtzOjQ6InBhZ2UiO2k6Mjt9&t=board' },
      merch: { title: 'KISS OF LIFE 일본 공식 굿즈', sub: 'Believe Music Store · 가격·재고는 판매처 확인', href: 'https://believemusicstore.com/?cbid=2987983&csid=0&mode=cate' },
      schedule: { title: '일본 방송·미디어 일정', sub: 'KISS OF LIFE 일본 공식 사이트', href: 'https://kissoflife.jp/page/media.html' },
      news: { title: 'KISS OF LIFE 일본 공식 소식', href: 'https://kissoflife.jp/page/index.html' }
    },
    kiiikiii: {
      album: { href: 'https://www.starship-ent.com/board/newrelease/637' },
      merch: { title: 'KiiiKiii 공식 상품', sub: '스타쉽 스퀘어 · KiiiKiii 상품 검색', href: 'https://starship-square.com/product/search.html?keyword=KiiiKiii' },
      schedule: { title: 'Berriz 공식 일정', sub: 'KiiiKiii 월별 활동 달력', href: 'https://berriz.in/ko/kiiikiii/calendar/' },
      news: { title: 'KiiiKiii Berriz 공식 공지', href: 'https://berriz.in/ko/kiiikiii/notice/' }
    },
    blackpink: {
      album: { href: 'https://ygfamily.com/en/artists/blackpink/discography/1651' },
      merch: { title: 'BLACKPINK 공식 상품', sub: 'YG SELECT · BLACKPINK 상품 검색', href: 'https://www.ygselect.com/product/search.html?keyword=BLACKPINK' },
      schedule: { title: 'BLACKPINK 공식 공연 안내', sub: 'YG · 투어·공연 정보', href: 'https://www.ygfamily.com/en/artists/blackpink/concert' },
      news: { tag: '로그인', title: 'BLACKPINK Weverse 공식 공지', href: 'https://weverse.io/blackpink/notice' }
    },
    stayc: {
      album: { href: 'https://www.highup-ent.com/stayc/star-to-a-young-culture/' },
      merch: { title: 'STAYC 공식 상품', sub: 'Weverse Shop · 앨범·굿즈 목록', href: 'https://shop.weverse.io/ko/shop/KRW/artists/34' },
      schedule: { title: '공연·활동 공지', sub: 'STAYC Weverse · 로그인·커뮤니티 가입 후 확인', href: 'https://weverse.io/stayc/notice' },
      news: { tag: '로그인', title: 'STAYC Weverse 공식 공지', href: 'https://weverse.io/stayc/notice' }
    },
    idle: {
      album: { href: 'https://music.apple.com/us/album/i-am-ep/1378887583', source: 'Apple Music' },
      merch: { title: 'i-dle 공식 상품', sub: 'CUBEE · i-dle 상품 목록', href: 'https://www.cubee.co.kr/product/list.html?cate_no=160' },
      schedule: { title: '일본 공식 일정', sub: 'i-dle 일본 공식 사이트 · 활동 일정 목록', href: 'https://i-dle.cubeent.co.jp/?post_type=schedule' },
      news: { title: 'i-dle 일본 공식 소식', href: 'https://i-dle.cubeent.co.jp/news/' }
    },
    bts: {
      album: { href: 'https://shop.weverse.io/ko/shop/KRW/artists/2/sales/15', source: 'Weverse Shop 음반 상세' },
      merch: { title: 'BTS 공식 상품', sub: 'Weverse Shop · 앨범·굿즈 목록', href: 'https://shop.weverse.io/ko/shop/KRW/artists/2' },
      schedule: { title: '공연·활동 공지', sub: 'BTS Weverse · 로그인·커뮤니티 가입 후 확인', href: 'https://weverse.io/bts/notice' },
      news: { tag: '로그인', title: 'BTS Weverse 공식 공지', href: 'https://weverse.io/bts/notice' }
    },
    seventeen: {
      album: { href: 'https://shop.weverse.io/ko/shop/KRW/artists/7/sales/16096', source: 'Weverse Shop 음반 상세' },
      merch: { title: 'SEVENTEEN 공식 상품', sub: 'Weverse Shop · 앨범·굿즈 목록', href: 'https://shop.weverse.io/ko/shop/KRW/artists/7' },
      schedule: { title: '공연·활동 공지', sub: 'SEVENTEEN Weverse · 로그인·커뮤니티 가입 후 확인', href: 'https://weverse.io/seventeen/notice' },
      news: { tag: '로그인', title: 'SEVENTEEN Weverse 공식 공지', href: 'https://weverse.io/seventeen/notice' }
    },
    straykids: {
      album: { href: 'https://straykids.jype.com/discography/vuykzg89' },
      merch: { title: 'Stray Kids 공식 상품', sub: 'FANS SHOP · Stray Kids 상품 목록', href: 'https://app.fans/shop/straykids' },
      schedule: { title: 'Stray Kids 공식 일정', sub: 'JYP · 월별 활동 달력', href: 'https://straykids.jype.com/schedule' },
      news: { title: 'Stray Kids JYP 공식 공지', href: 'https://straykids.jype.com/notice' }
    },
    txt: {
      album: { href: 'https://ibighit.com/legacy/txt/the_dream_chapter-star-ko.html' },
      merch: { title: 'TXT 공식 상품', sub: 'Weverse Shop · 앨범·굿즈 목록', href: 'https://shop.weverse.io/ko/shop/KRW/artists/3' },
      schedule: { title: '공연·활동 공지', sub: 'TXT Weverse · 로그인·커뮤니티 가입 후 확인', href: 'https://weverse.io/txt/notice' },
      news: { tag: '로그인', title: 'TXT Weverse 공식 공지', href: 'https://weverse.io/txt/notice' }
    },
    enhypen: {
      album: { href: 'https://beliftlab.com/artist/discography/ENHYPEN/1' },
      merch: { title: 'ENHYPEN 공식 상품', sub: 'Weverse Shop · ENCHIN 상품 목록', href: 'https://shop.weverse.io/ko/shop/KRW/artists/10?categoryId=7935' },
      schedule: { title: 'ENHYPEN 공식 일정', sub: 'BELIFT LAB · 활동 달력', href: 'https://beliftlab.com/artist/schedule/ENHYPEN' },
      news: { tag: '로그인', title: 'ENHYPEN Weverse 공식 공지', href: 'https://weverse.io/enhypen/notice' }
    },
    riize: {
      album: { href: 'https://riizeofficial.jp/discography/the-1st-single-album-get-a-guitar/' },
      merch: { title: 'RIIZE 공식 상품', sub: 'SMTOWN GLOBAL SHOP · RIIZE 상품 목록', href: 'https://global.shop.smtown.com/collections/riize' },
      schedule: { title: '일본 공연·활동 공지', sub: 'RIIZE 일본 공식 사이트 · 공연·방송 관련 공지', href: 'https://riizeofficial.jp/news/' },
      news: { title: 'RIIZE 일본 공식 소식', href: 'https://riizeofficial.jp/news/' }
    },
    boynextdoor: {
      album: { href: 'https://kozofficial.com/artist/discography/BOYNEXTDOOR/23' },
      merch: { title: 'BOYNEXTDOOR 공식 상품', sub: 'Weverse Shop · 앨범·굿즈 목록', href: 'https://shop.weverse.io/ko/shop/KRW/artists/112' },
      schedule: { title: '공연·활동 공지', sub: 'BOYNEXTDOOR Weverse · 로그인·커뮤니티 가입 후 확인', href: 'https://weverse.io/boynextdoor/notice' },
      news: { tag: '로그인', title: 'BOYNEXTDOOR Weverse 공식 공지', href: 'https://weverse.io/boynextdoor/notice' }
    },
    tws: {
      album: { href: 'https://shop.weverse.io/ko/shop/KRW/artists/165/sales/22961', source: 'Weverse Shop 음반 상세' },
      merch: { title: 'TWS 공식 상품', sub: 'Weverse Shop · 앨범·굿즈 목록', href: 'https://shop.weverse.io/ko/shop/KRW/artists/165' },
      schedule: { title: '공연·활동 공지', sub: 'TWS Weverse · 로그인·커뮤니티 가입 후 확인', href: 'https://weverse.io/tws/notice' },
      news: { tag: '로그인', title: 'TWS Weverse 공식 공지', href: 'https://weverse.io/tws/notice' }
    },
    nctdream: {
      album: { href: 'https://music.apple.com/us/album/chewing-gum-single/1147458439', source: 'Apple Music' },
      merch: { title: 'NCT DREAM 공식 상품', sub: 'SMTOWN GLOBAL SHOP · NCT DREAM 상품 목록', href: 'https://global.shop.smtown.com/collections/nct-dream' },
      schedule: { title: '공연·활동 공지', sub: 'NCT DREAM Weverse · 로그인·커뮤니티 가입 후 확인', href: 'https://weverse.io/nctdream/notice' },
      news: { tag: '로그인', title: 'NCT DREAM Weverse 공식 공지', href: 'https://weverse.io/nctdream/notice' }
    },
    ateez: {
      album: { href: 'https://ateez-official.jp/musics/7674' },
      merch: { title: 'ATEEZ 일본 공식 굿즈 안내', sub: '일본 공식 사이트 · 굿즈 통신판매 안내', href: 'https://ateez-official.jp/contents/539062' },
      schedule: { title: '일본 공식 일정', sub: 'ATEEZ 일본 공식 사이트 · 활동 달력', href: 'https://ateez-official.jp/vertical_calendar' },
      news: { title: 'ATEEZ 일본 공식 소식', href: 'https://ateez-official.jp/contents/news' }
    },
    treasure: {
      album: { href: 'https://www.ygfamily.com/en/artists/treasure/discography/423' },
      merch: { title: 'TREASURE 공식 상품', sub: 'YG SELECT · TREASURE 상품 검색', href: 'https://www.ygselect.com/product/search.html?keyword=TREASURE' },
      schedule: { title: 'TREASURE 공식 공연 안내', sub: 'YG · 투어·공연 정보', href: 'https://www.ygfamily.com/en/artists/treasure/concert' },
      news: { tag: '로그인', title: 'TREASURE Weverse 공식 공지', href: 'https://weverse.io/treasure/notice' }
    },
    nctwish: {
      album: { href: 'https://music.apple.com/us/album/wish-ep/1732218887', source: 'Apple Music' },
      merch: { title: 'NCT WISH 공식 상품', sub: 'SMTOWN GLOBAL SHOP · NCT WISH 상품 목록', href: 'https://global.shop.smtown.com/collections/nct-wish' },
      schedule: { title: '공연·활동 공지', sub: 'NCT WISH Weverse · 로그인·커뮤니티 가입 후 확인', href: 'https://weverse.io/nctwish/notice' },
      news: { tag: '로그인', title: 'NCT WISH Weverse 공식 공지', href: 'https://weverse.io/nctwish/notice' }
    },
    andteam: {
      album: { href: 'https://www.andteam-official.jp/news/owsyjh', source: '공식 발매·트랙 안내' },
      merch: { title: '&TEAM 공식 상품', sub: 'Weverse Shop · 앨범·굿즈 목록', href: 'https://shop.weverse.io/ko/shop/USD/artists/75' },
      schedule: { title: '일본 공식 사이트 일정', sub: '&TEAM 공식 사이트 · 활동 달력', href: 'https://www.andteam-official.jp/schedule' },
      news: { title: '&TEAM 일본 공식 소식', href: 'https://www.andteam-official.jp/news' }
    }
  };
  const artistFrom = (entry) => {
    const image = commonsPhoto(entry.photo, entry.photoLabel || '단체', entry.photoYear, entry.credit, entry.license);
    const resources = officialResources[entry.id] || {};
    return {
      id: entry.id,
      name: entry.name,
      korean: entry.korean,
      category: entry.category,
      fan: entry.fan,
      agency: entry.agency,
      members: entry.members,
      accent: entry.accent,
      light: entry.light,
      dark: entry.dark,
      theme: { bg: entry.bg, night: Boolean(entry.night) },
      shape: entry.shape,
      status: 'DEBUT · ' + entry.debut.slice(0, 4),
      debut: entry.debut,
      debutWork: entry.debutWork,
      concept: entry.concept,
      checkedAt: entry.checkedAt || '2026.11.11',
      basicProfile: true,
      image: image.image,
      imageCredit: image.credit + ' · ' + image.license,
      imageLink: image.href,
      photos: [image, ...(entry.morePhotos || [])],
      links: [
        { label: '공식 사이트', icon: '✦', url: entry.official },
        { label: 'YouTube', icon: '▷', url: entry.youtube }
      ],
      merch: entry.merch || (resources.merch ? [resources.merch] : []),
      music: entry.music || (resources.album ? [
        { title: entry.debutWork, date: entry.debut, type: '데뷔 음반·싱글' + (resources.album.source ? ' · ' + resources.album.source : ''), songs: entry.songs, href: resources.album.href }
      ] : []),
      appearances: entry.appearances || [],
      schedules: entry.schedules || (resources.schedule ? [resources.schedule] : []),
      news: entry.news || (resources.news ? [{ date: '공식', tag: '소식', ...resources.news }] : []),
      campaigns: entry.campaigns || [],
      official: entry.official
    };
  };

  const additionalArtists = [
    {
      id: 'nmixx', name: 'NMIXX', korean: '엔믹스', category: 'girl', fan: 'NSWER', agency: 'JYP Entertainment',
      members: ['릴리', '해원', '설윤', '배이', '지우', '규진'],
      debut: '2022.02.22', debutWork: 'AD MARE', songs: ['O.O', '占 (TANK)'],
      concept: '새로운 조합으로 넓혀 가는 NMIXX의 음악 세계.',
      official: 'https://nmixx.jype.com/', youtube: 'https://www.youtube.com/@NMIXXOfficial',
      photo: 'Nmixx in Frankfurt 20260324 (1).jpg', photoLabel: '프랑크푸르트 공연', photoYear: '2026', credit: 'PFNKa', license: 'CC BY 4.0',
      morePhotos: [
        commonsPhoto('20260320 NMIXX Amsterdam concert 01.jpg', '암스테르담 월드투어 무대', '2026', 'Robbie Klinkenberg', 'CC BY 4.0'),
        commonsPhoto('20260320 NMIXX Amsterdam concert 12.jpg', '암스테르담 공연 현장', '2026', 'Robbie Klinkenberg', 'CC BY 4.0')
      ],
      music: [
        { title: 'Strange Muse', date: '2026.10.19', type: '미니 6집 · 타이틀 긴 소원 (Birthday Wish)', songs: ['긴 소원 (Birthday Wish)', 'Kerosene', 'RudE TaLK', '너는 달 (Sing to the Moon) (LILY, HAEWON)', "Hot 'n Unbothered (SULLYOON, BAE)", '휙 (WHIP) (JIWOO, KYUJIN)'], href: 'https://nmixx.jype.com/discography/vmgvjirm' },
        { title: 'Heavy Serenade', date: '2026.05.11', type: '미니 5집 · 타이틀 Heavy Serenade', songs: ['Crescendo', 'Heavy Serenade', 'IDESERVEIT', 'Different Girl', 'Superior', 'LOUD'], href: 'https://nmixx.jype.com/discography/dru5zt6g' },
        { title: 'AD MARE', date: '2022.02.22', type: '데뷔 싱글 · 타이틀 O.O', songs: ['O.O', '占 (TANK)'], href: 'https://nmixx.jype.com/discography/514qe3en' }
      ],
      appearances: [
        { date: '2026-11-27', title: '첫 월드투어 ZERO FRONTIER 피날레', sub: '인천 인스파이어 아레나 · 19:00 · JYP 주최', href: 'https://nol.yanolja.com/ticket/products/26013946' },
        { date: '2026-11-28', title: '첫 월드투어 ZERO FRONTIER 피날레', sub: '인천 인스파이어 아레나 · 17:00 · JYP 주최', href: 'https://nol.yanolja.com/ticket/products/26013946' },
        { date: '2026-11-29', title: '첫 월드투어 ZERO FRONTIER 피날레', sub: '인천 인스파이어 아레나 · 16:00 · JYP 주최', href: 'https://nol.yanolja.com/ticket/products/26013946' },
        { date: '2026-11-29', title: '피날레 CGV 라이브뷰잉', sub: '국내 CGV · 인천 공연 실시간 중계 · 11.11 예매 시작', href: 'https://www.newspim.com/news/view/20261026001185' },
        { date: '2026-12-09', title: '일본 첫 베스트 앨범 N=MIXX 발매', sub: '일본 정식 발매 예정 · 공식 일본 사이트', href: 'https://nmixxjapan.com/s/222o/page/best_album_n_mixx' },
        { date: '2026-12-12', title: '일본 데뷔 쇼케이스 N=MIXX', sub: '일본 아이치 · 쿠로코군 홀 · 18:00 · 워너뮤직 재팬 주최', href: 'https://nmixxjapan.com/s/222o/page/Japan_debut_showcase' },
        { date: '2026-12-13', title: '일본 데뷔 쇼케이스 N=MIXX', sub: '일본 아이치 · 쿠로코군 홀 · 17:00 · 워너뮤직 재팬 주최', href: 'https://nmixxjapan.com/s/222o/page/Japan_debut_showcase' }
      ],
      news: [
        { date: '2026.10.26', tag: '공연', title: '11.29 CGV 피날레 생중계 확정 · 11.11 예매 시작', href: 'https://www.newspim.com/news/view/20261026001185' },
        { date: '2026.10.19', tag: '컴백', title: '미니 6집 Strange Muse · 긴 소원 (Birthday Wish) 발매', href: 'https://nmixx.jype.com/notice/fsigcq5u' },
        { date: '2026.09.19', tag: '수상', title: '더팩트 뮤직 어워즈 올해의 사운드 대상 수상', href: 'https://www.soompi.com/article/1871808wpp/winners-of-2026-the-fact-music-awards' },
        { date: '발매 예정', tag: '소식', title: '일본 첫 베스트 앨범 N=MIXX, 12월 9일 발매 안내', href: 'https://nmixxjapan.com/s/222o/page/best_album_n_mixx' }
      ],
      merch: [
        { title: 'Strange Muse 공식 앨범', sub: 'JYP JAPAN · 포맷·재고·특전은 판매처에서 확인', href: 'https://jypj-store.com/collections/nmixx-music' },
        { title: 'NMIXX OFFICIAL LIGHT STICK VER.2', sub: 'JYP JAPAN · 공식 응원봉', href: 'https://jypj-store.com/collections/nmixx-official-goods' },
        { title: 'Strange Muse 팝업 공식 포토카드', sub: 'MAKESTAR · 예약 판매 10.28~11.03 종료 · 11.12 발매 예정', href: 'https://www.makestar.com/product/21421' }
      ],
      schedules: [
        { title: 'JYP 공식 NMIXX 일정', sub: '공식 활동 달력', href: 'https://nmixx.jype.com/schedule' },
        { title: '인천 피날레 공식 예매', sub: 'NOL 티켓 · 변경·취소 규정 확인', href: 'https://nol.yanolja.com/ticket/products/26013946' }
      ],
      campaigns: [
        { kind: '광고', date: '2026.09.01', title: 'MAKE UP FOR EVER × NMIXX', sub: '아티스트 컬러글로우 립밤 공식 캠페인', href: 'https://prtimes.jp/main/html/rd/p/000000124.000019175.html' },
        { kind: '홍보대사', date: '2026.06.11', title: '주한영국대사관 Girls Can Dream', sub: '꿈꾸는 소녀에게 불가능은 없다 · 캠페인 홍보대사', href: 'https://www.bntnews.co.kr/article/view/bnt202606120142' }
      ],
      accent: '#3478ba', light: '#dcefff', dark: '#23436a', bg: '#f1f8ff', shape: '✳'
    },
    {
      id: 'babymonster', name: 'BABYMONSTER', korean: '베이비몬스터', category: 'girl', fan: 'MONSTIEZ', agency: 'YG Entertainment',
      members: ['루카', '파리타', '아사', '아현', '라미', '로라', '치키타'],
      debut: '2024.04.01', debutWork: 'BABYMONS7ER', songs: ['SHEESH', 'LIKE THAT'],
      concept: '2023년 BATTER UP을 발표하고, 2024년 4월 일곱 멤버로 정식 데뷔한 YG의 걸그룹.',
      official: 'https://ygfamily.com/ko/artists/babymonster/profile', youtube: 'https://www.youtube.com/@BABYMONSTER',
      photo: 'BabyMonster Promoting drip on 2024112.png', photoLabel: 'DRIP 활동', photoYear: '2024', credit: 'SBS Radio', license: 'CC BY 3.0',
      morePhotos: [
        commonsPhoto('BABYMONSTER in Seattle.jpg', '시애틀 월드투어 공연', '2025', 'David Lee', 'CC BY 4.0'),
        commonsPhoto('Rora at Babymonster World Tour in Jakarta 2026.jpg', '로라 · 자카르타 투어', '2026', 'Izzatfikry99', 'CC BY-SA 4.0'),
        commonsPhoto('Adidas Orchard Ignition Event X Babymonster - Chiquita 30082026.jpg', '치키타 · 아디다스 행사', '2026', 'Asalover2004', 'CC BY-SA 4.0')
      ],
      music: [
        { title: 'DESERVE', date: '2026.10.23', type: '디지털 싱글', songs: ['DESERVE'], href: 'https://www.ygfamily.com/jp/artists/babymonster/discography/1673' },
        { title: 'SUGAR HONEY ICE TEA', date: '2026.06.08', type: '디지털 싱글', songs: ['SUGAR HONEY ICE TEA'], href: 'https://www.ygfamily.com/en/artists/babymonster/discography/1664' },
        { title: '춤 (CHOOM)', date: '2026.05.04', type: '미니 3집 · 타이틀 CHOOM', songs: ['MOON', 'CHOOM', 'I LIKE IT', 'LOCKED IN'], href: 'https://www.ygfamily.com/en/artists/babymonster/discography/1656' },
        { title: 'WE GO UP', date: '2025.10.10', type: '미니 2집 · 타이틀 WE GO UP', songs: ['WE GO UP', 'PSYCHO', 'SUPA DUPA LUV', 'WILD'], href: 'https://www.ygfamily.com/en/artists/babymonster/discography/1644' },
        { title: 'HOT SAUCE', date: '2025.07.01', type: '디지털 싱글', songs: ['HOT SAUCE'], href: 'https://ygfamily.com/en/artists/babymonster/discography/1628' },
        { title: 'DRIP', date: '2024.11.01', type: '정규 1집 · 더블 타이틀 DRIP / CLIK CLAK', songs: ['CLIK CLAK', 'DRIP', 'Love, Maybe', 'Really Like You', 'BILLIONAIRE', 'Love In My Heart', 'Woke Up In Tokyo (RUKA & ASA)', 'FOREVER', 'BATTER UP (Remix)'], href: 'https://ygfamily.com/en/artists/babymonster/discography/1615' },
        { title: 'FOREVER', date: '2024.07.01', type: '디지털 싱글', songs: ['FOREVER'], href: 'https://ygfamily.com/en/artists/babymonster/discography/1606' },
        { title: 'BABYMONS7ER', date: '2024.04.01', type: '7인조 정식 데뷔 미니 앨범 · 타이틀 SHEESH', songs: ['MONSTERS (Intro)', 'SHEESH', 'LIKE THAT', 'Stuck In The Middle (7 ver.)', 'BATTER UP (7 ver.)', 'DREAM', 'Stuck In The Middle (Remix)'], href: 'https://ygfamily.com/en/artists/babymonster/discography/1594' },
        { title: 'Stuck In The Middle', date: '2024.02.01', type: '선공개 싱글', songs: ['Stuck In The Middle'], href: 'https://ygfamily.com/en/artists/babymonster/discography/1591' },
        { title: 'BATTER UP', date: '2023.11.27', type: '첫 디지털 싱글', songs: ['BATTER UP'], href: 'https://www.ygfamily.com/en/artists/babymonster/discography/1578' }
      ],
      appearances: [
        { date: '2026-11-14', title: 'CHOOM 월드투어 · 쿠알라룸푸르', sub: '말레이시아 Unifi Arena · 현지 17:00', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-11-18', title: 'MTV JAPAN BABYMONSTER VideoSelects 재방송', sub: '일본 MTV · 21:00~22:00 (현지 시간)', href: 'https://www.sonymusic.co.jp/artist/BABYMONSTER/info/587656' },
        { date: '2026-11-20', title: '2026 MAMA AWARDS', sub: '일본 오사카 교세라 돔 · 공식 일정 18:00', href: 'https://ygfamily.com/ko/artists/babymonster/schedule' },
        { date: '2026-11-21', title: 'CHOOM 월드투어 · 타이베이', sub: '대만 Taipei Arena · 현지 19:30', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-11-22', title: 'CHOOM 월드투어 · 타이베이', sub: '대만 Taipei Arena · 현지 18:00', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-11-28', title: 'CHOOM 월드투어 · 싱가포르', sub: 'Singapore Indoor Stadium · 현지 18:00', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-11-29', title: 'CHOOM 월드투어 · 싱가포르 추가 공연', sub: 'Singapore Indoor Stadium · 현지 18:00', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-12-02', title: '2026 FNS 가요제 제1야 · 첫 출연', sub: '후지TV 계열 방송 · 18:30~23:18 방송 시간(개별 출연 시간 미공개)', href: 'https://yg-babymonster-official.jp/news/media/2830/' },
        { date: '2026-12-08', title: 'CHOOM 월드투어 · 오클랜드', sub: '뉴질랜드 Spark Arena · 시간은 예매처 확인', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-12-11', title: 'CHOOM 월드투어 · 멜버른', sub: '호주 Rod Laver Arena · 시간은 예매처 확인', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-12-13', title: 'CHOOM 월드투어 · 시드니', sub: '호주 Afterpay Arena · 시간은 예매처 확인', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-12-22', title: 'MTV JAPAN BEST ARTIST COLLECTION · BABYMONSTER', sub: '일본 MTV · 21:00~22:00 (현지 방송 시간)', href: 'https://yg-babymonster-official.jp/news/media/2834/' },
        { date: '2027-01-08', title: 'CHOOM 월드투어 · 홍콩', sub: 'AsiaWorld-Arena · 현지 20:00', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2027-01-09', title: 'CHOOM 월드투어 · 홍콩', sub: 'AsiaWorld-Arena · 현지 18:00', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2027-01-10', title: 'CHOOM 월드투어 · 홍콩', sub: 'AsiaWorld-Arena · 현지 18:00', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2027-04-11', title: '코첼라 밸리 뮤직 앤드 아츠 페스티벌', sub: '미국 캘리포니아 인디오 · 공연 시간 미공개', href: 'https://ygfamily.com/en/news/report/7601' },
        { date: '2027-04-18', title: '코첼라 밸리 뮤직 앤드 아츠 페스티벌', sub: '미국 캘리포니아 인디오 · 공연 시간 미공개', href: 'https://ygfamily.com/en/news/report/7601' }
      ],
      schedules: [
        { title: 'YG 공식 월드투어 일정·예매', sub: '도시별 장소·현지 시간·변경사항', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { title: 'YG 공식 공연 공지', sub: '현지 예매 규정·추가 회차 안내', href: 'https://ygfamily.com/ko/artists/babymonster/notice' },
        { title: '일본 공식 미디어·일정', sub: '일본 방송·발매 일정', href: 'https://yg-babymonster-official.jp/schedule' }
      ],
      news: [
        { date: '2026.11.13', tag: '방송', title: 'MTV JAPAN 12월 22일 BEST ARTIST COLLECTION 특집 방송 확정', href: 'https://yg-babymonster-official.jp/news/media/2834/' },
        { date: '2026.11.11', tag: '공연', title: '2027년 코첼라 4월 11·18일 출연 확정 (YG 발표)', href: 'https://ygfamily.com/en/news/report/7601' },
        { date: '2026.11.03', tag: '방송', title: '12월 2일 후지TV 2026 FNS 가요제 제1야 첫 출연 발표', href: 'https://yg-babymonster-official.jp/news/media/2830/' },
        { date: '2026.10.28', tag: '발매', title: '12월 23일 일본 투어 실황 Blu-ray·라이브 CD·음원 발매 예고', href: 'https://yg-babymonster-official.jp/news/release/2820/' },
        { date: '2026.10.23', tag: '컴백', title: '디지털 싱글 DESERVE · 공식 MV 공개', href: 'https://www.sonymusic.co.jp/artist/BABYMONSTER/info/587905' },
        { date: '2026.10.15', tag: '방송', title: '11.12·11.18 일본 MTV 뮤직비디오 특집 방송 안내', href: 'https://www.sonymusic.co.jp/artist/BABYMONSTER/info/587656' },
        { date: '2026.09.25', tag: '협업', title: '루카·아사, 일본 패션 브랜드 SNIDEL 홍보대사 선정', href: 'https://prtimes.jp/main/html/rd/p/000004511.000018505.html' }
      ],
      merch: [
        { title: 'CHOOM 일본 투어 실황 LIVE Blu-ray', sub: '12.23 발매 예정 · BLACK/WHITE 초회 한정판 및 일반판 · 구매·특전은 공식 안내 확인', href: 'https://yg-babymonster-official.jp/news/release/2820/' },
        { title: 'CHOOM 일본 투어 LIVE ALBUM CD', sub: '12.23 발매 예정 · 라이브 23트랙 · 디지털 음원도 같은 날 발매 예정', href: 'https://yg-babymonster-official.jp/news/release/2820/' },
        { title: 'DESERVE 공식 MD 예약 판매', sub: 'YG SELECT · 11.06 11:00 시작 · 한정 수량, 품절 여부 판매처 확인', href: 'https://www.ygselect.com/article/event/12/657823/' },
        { title: '춤 (CHOOM) 공식 앨범', sub: 'YG SELECT · Crimson / Metallic / Prism 구성 · 재고는 판매처 확인', href: 'https://ygselect.com/product/babymonster-3rd-mini-album-%EC%B6%A4-choom-crimson-metallic-prism-ver/12957/' },
        { title: 'BABYMONSTER 공식 응원봉', sub: 'YG SELECT · 판매·재입고 상태는 판매처 확인', href: 'https://www.ygselect.com/product/babymonster-official-light-stick/10557/category/32/display/1/' }
      ],
      campaigns: [
        { kind: '콜라보', date: '2026.09.16', title: 'BABYMONSTER × SESAME STREET', sub: '공식 협업 굿즈 · 9.17 1차, 10.16 2차 온라인 판매 시작', href: 'https://yg-babymonster-official.jp/news/goods/2734/' },
        { kind: '콜라보', date: '2026.08.30', title: 'adidas × Mercedes-AMG F1 · Orchard Ignition', sub: '싱가포르 adidas × F1 협업 행사에 초청 아티스트로 참여', href: 'https://cnalifestyle.channelnewsasia.com/entertainment/babymonster-adidas-orchard-ignition-singapore-2026-587441' },
        { kind: '홍보대사', date: '2026.09.24', title: '루카·아사 × SNIDEL', sub: '일본 패션 브랜드 홍보대사 · 브랜드 공식 발표', href: 'https://prtimes.jp/main/html/rd/p/000004511.000018505.html' },
        { kind: '광고', date: '2025.02.13', title: 'BANILA CO × BABYMONSTER', sub: '바닐라코 브랜드 모델·메이크업 캠페인 (2025년 발표)', href: 'https://www.wwdjapan.com/articles/2035672' }
      ],
      accent: '#d13f5c', light: '#ffe3e8', dark: '#702f45', bg: '#fff5f5', shape: '✴'
    },

    {
      id: 'hearts2hearts', name: 'Hearts2Hearts', korean: '하츠투하츠', category: 'girl', fan: 'S2U', agency: 'SM Entertainment',
      members: ['지우', '카르멘', '유하', '스텔라', '주은', '에이나', '이안', '예온'],
      debut: '2025.02.24', debutWork: 'The Chase', songs: ['The Chase', 'Butterflies'],
      concept: '서로 다른 마음을 이어 하나의 하모니를 만드는 여덟 멤버.',
      official: 'https://hearts2heartsofficial.jp/', youtube: 'https://www.youtube.com/@hearts2hearts.official',
      photo: '260221 HEARTS2HEARTS @ 2026 Fanmeeting HEARTS2HOUSE.jpg', photoLabel: 'HEARTS2HOUSE 팬미팅', photoYear: '2026', credit: 'sublimitas viii', license: 'CC BY-SA 4.0',
      morePhotos: [
        commonsPhoto('20260221 HEARTS2HEARTS @ 2026 Fanmeeting HEARTS2HOUSE.jpg', 'HEARTS2HOUSE 팬미팅 · 단체', '2026', 'sublimitas viii', 'CC BY-SA 4.0'),
        commonsPhoto('20260827 HEARTS2HEARTS Ian @ K-World Dream Awards (1).jpg', 'K-World Dream Awards · 이안', '2026', 'sublimitas viii', 'CC BY-SA 4.0')
      ],
      music: [
        { title: 'Next Chapter', date: '2026.10.16', type: '스페셜 싱글 · Arena of Valor 10주년 협업', songs: ['Next Chapter'], href: 'https://music.apple.com/us/album/next-chapter-single/6821845774' },
        { title: 'Candy Box Lover', date: '2026.10.11', type: '디지털 싱글', songs: ['Candy Box Lover'], href: 'https://music.apple.com/us/album/candy-box-lover-single/6819981721' },
        { title: 'ICONIC HEART (Korean Ver.)', date: '2026.10.05', type: '디지털 싱글 · 일본 데뷔곡 한국어판', songs: ['ICONIC HEART (Korean Ver.)'], href: 'https://hearts2heartsofficial.jp/news/20261005/' },
        { title: 'Moonride', date: '2026.09.09', type: '디지털 싱글 · Kia 협업', songs: ['Moonride'], href: 'https://music.apple.com/us/album/moonride-single/6807315056' },
        { title: 'ICONIC HEART', date: '2026.08.12', type: '일본 데뷔 싱글 · CD 발매일 (음원 8.10)', songs: ['ICONIC HEART', 'Lemon Tang (Japanese Ver.)', 'RUDE! (Japanese Ver.)'], href: 'https://hearts2heartsofficial.jp/discography/iconic-heart_umstore/' },
        { title: 'Lemon Tang', date: '2026.06.22', type: '미니 2집 · 타이틀 Lemon Tang', songs: ['Lemon Tang', '15-LOVE', '처음투성이 (Baby Steps)', 'heart emoji (♡)', 'Secret Recipe', 'RUDE!'], href: 'https://music.apple.com/us/album/lemon-tang-the-2nd-mini-album-ep/6779521284' },
        { title: 'RUDE!', date: '2026.02.20', type: '디지털 싱글', songs: ['RUDE!'], href: 'https://music.apple.com/us/album/rude-single/1875146814' },
        { title: 'FOCUS', date: '2025.10.20', type: '미니 1집 · 타이틀 FOCUS', songs: ['FOCUS', 'Apple Pie', 'Pretty Please', 'Flutter', 'Blue Moon', 'STYLE'], href: 'https://www.youtube.com/watch?v=Ur7aK4FvK-U' },
        { title: 'The Chase', date: '2025.02.24', type: '데뷔 싱글', songs: ['The Chase', 'Butterflies'], href: 'https://www.youtube.com/watch?v=kxUA2wwYiME' }
      ],
      appearances: [
        { date: '2026-11-20', title: '2026 MAMA AWARDS Chapter 1 출연', sub: '일본 오사카 교세라 돔 · 18:00 시상식 · CJ ENM 주최', href: 'https://cjnews.cj.net/2026-mama-awards-a-to-z%EF%BD%9C%EC%B6%9C%EC%97%B0%EC%A7%84%EB%B6%80%ED%84%B0-%ED%8A%B9%EB%B3%84-%EB%AC%B4%EB%8C%80%EA%B9%8C%EC%A7%80-%ED%95%9C%EB%88%88%EC%97%90-%EB%AA%A8%EC%95%84%EB%B3%B4%EA%B8%B0/' },
        { date: '2026-11-22', title: '일본 첫 팬 이벤트 READY! S2U', sub: '도쿄 아리아케 아레나 · 18:00 시작 (17:00 입장)', href: 'https://hearts2heartsofficial.jp/news/2026081203/' },
        { date: '2026-11-23', title: '일본 첫 팬 이벤트 READY! S2U', sub: '도쿄 아리아케 아레나 · 16:00 시작 (15:00 입장)', href: 'https://hearts2heartsofficial.jp/news/2026081203/' },
        { date: '2026-11-28', title: 'Winter Special Live at UNIVERSAL STUDIOS JAPAN', sub: '오사카 USJ 그래머시 파크 · 11:00 시작 (09:45 입장) · 주최 USJ', href: 'https://hearts2heartsofficial.jp/news/20260925/' }
      ],
      schedules: [{ title: '일본 공식 일정·공지', sub: '팬 이벤트·공연·발매·변경 확인', href: 'https://hearts2heartsofficial.jp/news/' }],
      news: [
        { date: '2026.11.06', tag: '굿즈', title: 'READY! S2U 공식 MD 공개 · 온라인 11.12 20:00 판매 시작', href: 'https://hearts2heartsofficial.jp/news/20261106/' },
        { date: '2026.11.02', tag: '굿즈', title: '공식 응원봉·미니 응원봉 키링 일본 판매 안내 (11.05 시작)', href: 'https://hearts2heartsofficial.jp/news/20261102/' },
        { date: '2026.10.16', tag: '음악', title: '게임 Arena of Valor 10주년 협업곡 Next Chapter 공개', href: 'https://music.apple.com/us/album/next-chapter-single/6821845774' },
        { date: '2026.11.10', tag: '공연', title: 'CJ ENM 공식 안내 · 11.20 MAMA AWARDS Chapter 1 출연', href: 'https://cjnews.cj.net/2026-mama-awards-a-to-z%EF%BD%9C%EC%B6%9C%EC%97%B0%EC%A7%84%EB%B6%80%ED%84%B0-%ED%8A%B9%EB%B3%84-%EB%AC%B4%EB%8C%80%EA%B9%8C%EC%A7%80-%ED%95%9C%EB%88%88%EC%97%90-%EB%AA%A8%EC%95%84%EB%B3%B4%EA%B8%B0/' },
        { date: '2026.09.25', tag: '공연', title: '11.28 유니버설 스튜디오 재팬 특별 공연 발표', href: 'https://hearts2heartsofficial.jp/news/20260925/' },
        { date: '2026.08.12', tag: '공연', title: '11.22~23 일본 첫 팬 이벤트 READY! S2U 개최 발표', href: 'https://hearts2heartsofficial.jp/news/2026081203/' }
      ],
      merch: [
        { title: 'READY! S2U 일본 팬 이벤트 공식 MD', sub: '아크릴 키링·파카·토트백 등 · 온라인 판매 11.12 20:00부터', href: 'https://hearts2heartsofficial.jp/news/20261106/' },
        { title: 'Hearts2Hearts 공식 응원봉·미니 키링', sub: 'SMTOWN 일본 공식 스토어 · 11.05 20:00(JST) 판매 시작 · 11.11 이후 주문은 공연 전 배송 미보장 · 재고 확인', href: 'https://hearts2heartsofficial.jp/news/20261102/' },
        { title: 'ICONIC HEART 일본 싱글 CD', sub: 'UNIVERSAL MUSIC STORE 한정판·초회판·통상판', href: 'https://hearts2heartsofficial.jp/discography/iconic-heart_umstore/' },
        { title: 'Lemon Tang 일본 공식 한정판', sub: 'Summer Kit 및 일본 전용판 · 가격·재고는 공식 판매처 확인', href: 'https://hearts2heartsofficial.jp/discography/lemon-tang_summer-kit/' }
      ],
      campaigns: [
        { kind: '콜라보', date: '2026.10.16', title: 'Arena of Valor × Hearts2Hearts', sub: '게임 10주년 특별 싱글 Next Chapter', href: 'https://www.youtube.com/watch?v=lu9GinsuyUQ' },
        { kind: '광고', date: '2026.09.21', title: '클라렌 × Hearts2Hearts', sub: '콘택트렌즈 브랜드 모델 · 리브랜딩 캠페인', href: 'https://www.sentv.co.kr/article/view/sentv202609210130' },
        { kind: '콜라보', date: '2026.09.09', title: 'Kia RV Black Edition × Moonride', sub: '기아 협업 디지털 싱글·프로모션', href: 'https://music.apple.com/us/album/moonride-single/6807315056' }
      ],
      accent: '#9074db', light: '#efe5ff', dark: '#594782', bg: '#faf6ff', shape: '♡'
    },
    {
      id: 'kissoflife', name: 'KISS OF LIFE', korean: '키스오브라이프', category: 'girl', fan: 'KISSY', agency: 'S2 Entertainment',
      members: ['쥴리', '나띠', '벨', '하늘'],
      debut: '2023.07.05', debutWork: 'KISS OF LIFE', songs: ['쉿 (Shhh)', '안녕, 네버랜드'],
      concept: '쥴리·나띠·벨·하늘 네 멤버가 각자의 개성과 목소리로 펼치는 음악과 퍼포먼스.',
      official: 'https://kissoflife.jp/', youtube: 'https://www.youtube.com/@KISSOFLIFE_official',
      photo: 'KISS OF LIFE at Music Bank (4K) 20240705 02.png', photoLabel: '뮤직뱅크 출근길', photoYear: '2024', credit: '티비텐 TV10', license: 'CC BY 3.0',
      morePhotos: [
        commonsPhoto('28082026 Kiss of Life Newsis Hallyu Expo 1.png', '2026 뉴시스 한류엑스포 · 단체', '2026', 'K-POPIT 케이팝잇', 'CC BY 4.0'),
        commonsPhoto('28082026 Belle Newsis Hallyu Expo 1.png', '벨 · 2026 한류엑스포', '2026', 'K-POPIT 케이팝잇', 'CC BY 4.0')
      ],
      music: [
        { title: 'SWEAT -JAPANESE EP-', date: '2026.09.16', type: '일본 미니 2집 · 타이틀 SWEAT (Japanese Ver.)', songs: ['SWEAT (Japanese Ver.)', 'Was It You', 'BREAK IT', 'Who is she (Japanese Ver.)', 'Igloo (Remix)', 'BREAK IT (English Ver.)'], href: 'https://prtimes.jp/main/html/rd/p/000005074.000019470.html' },
        { title: 'SWEAT', date: '2026.08.04', type: '싱글 · 타이틀 SWEAT', songs: ['SWEAT', 'WHAT!'], href: 'https://music.apple.com/us/album/sweat-single/6792701507' },
        { title: 'Who is she', date: '2026.04.06', type: '싱글 · 타이틀 Who is she', songs: ['Who is she', "Don't mind me"], href: 'https://music.apple.com/us/album/who-is-she-single/1886385269' },
        { title: 'KISS OF LIFE', date: '2023.07.05', type: '데뷔 미니 1집 · 타이틀 쉿 (Shhh)', songs: ['쉿 (Shhh)', '안녕, 네버랜드', 'Sugarcoat (NATTY)', 'Countdown (BELLE)', 'Kitty Cat (JULIE)', 'Play Love Games (HANEUL)'], href: 'https://music.apple.com/us/album/kiss-of-life-ep/1694699906' }
      ],
      appearances: [
        { date: '2026-12-05', title: '2026 Asia Artist Awards (AAA)', sub: '대만 가오슝 국가체육장 · 공식 12/5 출연진 · 현지 17:00 본 행사', href: 'https://www.asiaartistawards.com/en/news/3225' }
      ],
      schedules: [
        { title: '일본 컬럼비아 공식 일정', sub: '방송·행사·활동 및 변경 공지', href: 'https://columbia.jp/artist-info/kissoflife/calendar/' },
        { title: '일본 공식 공연·행사', sub: '컬럼비아 공식 공연·발매 이벤트 안내', href: 'https://columbia.jp/artist-info/kissoflife/live/' }
      ],
      news: [
        { date: '2026.10.23', tag: '시상식', title: '12.05 가오슝 AAA 공식 출연 명단 발표', href: 'https://www.asiaartistawards.com/en/news/3225' },
        { date: '2026.10.12', tag: '무대', title: 'THE FIRST TAKE에서 SWEAT 일본어 버전 라이브 공개', href: 'https://columbia.jp/artist-info/kissoflife/media/94488.html' },
        { date: '2026.08.27', tag: '음반', title: '일본 미니 2집 SWEAT -JAPANESE EP- 발매 발표 · 9.16 발매', href: 'https://prtimes.jp/main/html/rd/p/000005074.000019470.html' },
        { date: '2026.08.04', tag: '컴백', title: '싱글 SWEAT 발표 · 공식 MV 공개', href: 'https://www.youtube.com/watch?v=eTvUZymLyGY' }
      ],
      merch: [
        { title: 'SWEAT -JAPANESE EP- TYPE-A·B', sub: '일본 컬럼비아 공식 CD·트레이딩카드 구성 · 재고는 판매처 확인', href: 'https://columbia.jp/artist-info/kissoflife/discography/album.html' },
        { title: 'SWEAT -JAPANESE EP- 통상판', sub: '일본 컬럼비아 공식 CD · 판매 여부·가격은 판매처 확인', href: 'https://columbia.jp/artist-info/kissoflife/discography/album.html' }
      ],
      campaigns: [
        { kind: '콜라보', date: '2026.07.04', title: 'DIGIMON BEATBREAK × BREAK IT', sub: '일본 TV 애니메이션 엔딩 테마 음원 협업', href: 'https://prtimes.jp/main/html/rd/p/000005074.000019470.html' }
      ],
      accent: '#b74472', light: '#ffe4ed', dark: '#68314e', bg: '#fff4f7', shape: '✿'
    },
    {
      id: 'kiiikiii', name: 'KiiiKiii', korean: '키키', category: 'girl', fan: 'TiiiKiii', agency: 'STARSHIP Entertainment',
      members: ['지유', '이솔', '수이', '하음', '키야'],
      debut: '2025.03.24', debutWork: 'UNCUT GEM', songs: ['I DO ME', 'BTG'],
      concept: '틀에 얽매이지 않는 감각과 자유로운 에너지.',
      official: 'https://www.starship-ent.com/musician/kiiikiii', youtube: 'https://www.youtube.com/@KiiiKiii_starship',
      photo: 'KiiiKiii in August 2026.png', photoLabel: '2026년 단체', photoYear: '2026', credit: 'K-POPIT 케이팝잇', license: 'CC BY 4.0',
      music: [
        { title: 'WhyKiiiKiii', date: '2026.08.10', type: '미니 3집 · 타이틀 Pop Off Pop Off', songs: ['Ever2Late!', 'Hey Hi', 'Pop Off Pop Off', 'SWEET SOUR', 'Candy Pink Magic Hole Flip Phone (나 어떡해)', 'Blue Hour'], href: 'https://music.apple.com/us/album/whykiiikiii-ep/6796609538' },
        { title: 'Delulu Pack', date: '2026.01.26', type: '미니 2집 · 타이틀 404 (New Era)', songs: ['Delulu', '404 (New Era)', 'UNDERDOGS', '멍냥 (MUNGNYANG)', 'Dizzy', 'To Me From Me (Prod. TABLO)'], href: 'https://music.apple.com/us/album/delulu-pack-ep/1866860579' },
        { title: 'To Me From Me (Prod. TABLO)', date: '2025.11.04', type: '디지털 싱글', songs: ['To Me From Me (Prod. TABLO)'], href: 'https://music.apple.com/us/album/to-me-from-me-single/1848046045' },
        { title: 'DANCING ALONE', date: '2025.08.06', type: '디지털 싱글', songs: ['DANCING ALONE', '딸기게임 (Strawberry Cheesegame)'], href: 'https://music.apple.com/us/album/dancing-alone-single/1830522219' },
        { title: 'UNCUT GEM', date: '2025.03.24', type: '데뷔 미니 1집 · I DO ME / BTG 수록', songs: ['DEBUT SONG', 'GROUNDWORK', 'I DO ME', 'THERE THEY GO', 'BTG', '한 개뿐인 (ONE OFF)'], href: 'https://music.apple.com/us/album/uncut-gem-ep/1800872866' }
      ],
      appearances: [
        { date: '2026-11-15', title: 'MMA2026 · Music Day', sub: '서울 고척스카이돔 · 11월 15일 · 카카오엔터테인먼트 발표', href: 'https://newsroom.kakaoent.com/news/mma2026-welcomes-more-k-pop-heavyweights/' },
        { date: '2026-11-21', title: '2026 MAMA AWARDS · CHAPTER 2', sub: '일본 오사카 교세라돔 · CJ ENM 공식 출연 발표', href: 'https://www.cj.net/jp/press-release/view/1132' }
      ],
      schedules: [
        { title: '공식 활동·공지', sub: 'KiiiKiii 공식 사이트', href: 'https://kiiikiii.kr/' },
        { title: 'MMA2026 안내', sub: '11.15 Music Day · 주최사 보도자료', href: 'https://newsroom.kakaoent.com/news/mma2026-welcomes-more-k-pop-heavyweights/' },
        { title: '2026 MAMA 출연 공지', sub: '11.21 CHAPTER 2 · 주최사', href: 'https://www.cj.net/jp/press-release/view/1132' }
      ],
      news: [
        { date: '2026.10.15', tag: '공연', title: '2026 MAMA AWARDS 11.21 출연 확정', href: 'https://www.cj.net/jp/press-release/view/1132' },
        { date: '2026.10.14', tag: '공연', title: 'MMA2026 Music Day 11.15 출연 확정', href: 'https://newsroom.kakaoent.com/news/mma2026-welcomes-more-k-pop-heavyweights/' },
        { date: '2026.08.10', tag: '앨범', title: '미니 3집 WhyKiiiKiii · Pop Off Pop Off 발매', href: 'https://music.apple.com/us/album/whykiiikiii-ep/6796609538' }
      ],
      merch: [
        { title: 'WhyKiiiKiii · AMENITIES ver.', sub: '스타쉽스퀘어 공식 앨범 · 재고는 판매처에서 확인', href: 'https://starship-square.com/product/amenities-ver-kiiikiii-ep-whykiiikiii/2061/category/58/display/1/' },
        { title: 'Delulu Pack · Headphone ver.', sub: '스타쉽스퀘어 공식 앨범 · 재고는 판매처에서 확인', href: 'https://starship-square.com/product/headphone-ver-kiiikiii-the-2nd-ep-delulu-pack/1874/' },
        { title: 'WhyKiiiKiii · SNAPSHOT 한정반', sub: '스타쉽스퀘어 · 예약판매 8.03~8.12 종료', href: 'https://starship-square.com/product/snapshot-ver-kiiikiii-ep-whykiiikiii-%ED%95%9C%EC%A0%95%EB%B0%98/2074/category/58/display/1/' }
      ],
      campaigns: [
        { kind: '홍보대사', date: '2026.01.21', title: '서울시 2026 서울색·서울빛 홍보대사', sub: '모닝옐로우 · 서울시 공식 위촉', href: 'https://mediahub.seoul.go.kr/archives/2016856' },
      ],
      accent: '#4c95c2', light: '#daf5ff', dark: '#315e7b', bg: '#f0fbff', shape: '✺'
    },
    {
      id: 'blackpink', name: 'BLACKPINK', korean: '블랙핑크', category: 'girl', fan: 'BLINK', agency: 'YG Entertainment',
      members: ['지수', '제니', '로제', '리사'],
      debut: '2016.08.08', debutWork: 'SQUARE ONE', songs: ['WHISTLE', 'BOOMBAYAH'],
      concept: '블랙과 핑크, 서로 다른 매력이 공존하는 무대.',
      official: 'https://ygfamily.com/ko/artists/blackpink/profile', youtube: 'https://www.youtube.com/@BLACKPINK',
      photo: '20240809 Blackpink Pink Carpet 09.png', photoLabel: '핑크 카펫', photoYear: '2024', credit: 'K-POPIT 케이팝잇', license: 'CC BY 3.0',
      morePhotos: [
        commonsPhoto('20240809 Blackpink Pink Carpet 07.png', '영화 핑크 카펫 · 단체', '2024', 'K-POPIT 케이팝잇', 'CC BY 3.0'),
        commonsPhoto('20240809 Blackpink Pink Carpet 12.png', '영화 핑크 카펫 · 현장', '2024', 'K-POPIT 케이팝잇', 'CC BY 3.0')
      ],
      music: [
        { title: 'DEADLINE', date: '2026.02.27', type: '미니 3집 · 타이틀 GO', songs: ['JUMP', 'GO', 'Me and my', 'Champion', 'Fxxxboy'], href: 'https://ygfamily.com/en/artists/blackpink/discography/1651' },
        { title: '뛰어 (JUMP)', date: '2025.07.11', type: '디지털 싱글 · DEADLINE 선공개', songs: ['JUMP'], href: 'https://ygfamily.com/en/artists/blackpink/discography/1632' },
        { title: 'BORN PINK', date: '2022.09.16', type: '정규 2집 · 타이틀 Shut Down', songs: ['Pink Venom', 'Shut Down', 'Typa Girl', 'Yeah Yeah Yeah', 'Hard to Love', 'The Happiest Girl', 'Tally', 'Ready For Love'], href: 'https://ygfamily.com/en/artists/blackpink/discography/255' },
        { title: 'THE ALBUM', date: '2020.10.02', type: '정규 1집 · 타이틀 Lovesick Girls', songs: ['How You Like That', 'Ice Cream (with Selena Gomez)', 'Pretty Savage', 'Bet You Wanna (Feat. Cardi B)', 'Lovesick Girls', 'Crazy Over You', 'Love To Hate Me', 'You Never Know'], href: 'https://ygfamily.com/en/artists/blackpink/discography/249' },
        { title: 'SQUARE ONE', date: '2016.08.08', type: '데뷔 싱글', songs: ['WHISTLE', 'BOOMBAYAH'], href: 'https://ygfamily.com/en/artists/blackpink/discography/228' }
      ],
      appearances: [],
      schedules: [
        { title: 'YG BLACKPINK 공식 공연 안내', sub: '투어 이력·새 공연 발표 확인', href: 'https://ygfamily.com/en/artists/blackpink/concert' },
        { title: 'YG BLACKPINK 공식 공지', sub: '행사·예매·변경 사항', href: 'https://ygfamily.com/ko/artists/blackpink/notice' }
      ],
      news: [
        { date: '2026.08.08', tag: '활동', title: '데뷔 10주년 기념 공식 영상 공개', href: 'https://www.youtube.com/watch?v=k--lCrP69hg' },
        { date: '2026.02.27', tag: '컴백', title: '미니 3집 DEADLINE · 타이틀 GO 발매', href: 'https://ygfamily.com/en/artists/blackpink/discography/1651' },
        { date: '2026.02.21', tag: '기록', title: '공식 YouTube 아티스트 채널 최초 1억 구독자 기록', href: 'https://en.yna.co.kr/view/AEN20260221002851320' }
      ],
      merch: [
        { title: 'DEADLINE 공식 앨범 BLACK Ver.', sub: 'YG SELECT · 포토북·포토카드 수록 · 재고는 판매처 확인', href: 'https://ygselect.com/product/blackpink-3rd-mini-album-deadline-black-ver/12808/' },
        { title: 'DEADLINE 공식 앨범 PINK Ver.', sub: 'YG SELECT · 포토북·포토카드 수록 · 재고는 판매처 확인', href: 'https://ygselect.com/product/blackpink-3rd-mini-album-deadline-pink-ver/12809/' },
        { title: 'DEADLINE MOOD LIGHT Ver.', sub: 'YG SELECT · 앨범·무드등 구성 · 재고는 판매처 확인', href: 'https://www.ygselect.com/product/blackpink-3rd-mini-album-deadline-mood-light-ver/12813/' }
      ],
      campaigns: [
        { kind: '콜라보', date: '2026.02.26', title: '국립중앙박물관 × BLACKPINK × Spotify', sub: 'DEADLINE 발매 기념 박물관 오디오 도슨트·리스닝존 · 2.26~3.08 종료', href: 'https://weverse.io/blackpink/notice/33735' }
      ],
      accent: '#ff82b4', light: '#482938', dark: '#fff2f7', bg: '#180f18', night: true, shape: '♥'
    },
    {
      id: 'stayc', name: 'STAYC', korean: '스테이씨', category: 'girl', fan: 'SWITH', agency: 'High Up Entertainment',
      members: ['수민', '시은', '아이사', '세은', '윤', '재이'],
      debut: '2020.11.12', debutWork: 'Star To A Young Culture', songs: ['SO BAD', 'LIKE THIS'],
      concept: '선명한 개성과 상큼한 멜로디를 담는 여섯 멤버.',
      official: 'https://www.highup-ent.com/', youtube: 'https://www.youtube.com/@STAYC',
      photo: 'STAYC Metamorphic Showcase 240701.jpg', photoLabel: 'Metamorphic 쇼케이스', photoYear: '2024', credit: 'K-POPIT 케이팝잇 · 원저작 티비텐 TV10', license: 'CC BY 3.0',
      music: [
        { title: '2:LOVE', date: '2026.06.16', type: '싱글 6집 · 타이틀 2 L0VE', songs: ['2 L0VE', 'WHERE YOU AT?', 'SORRY', 'BEAT MY LOVE'], href: 'https://www.highup-ent.com/stayc/2love/' },
        { title: 'STAY ALIVE', date: '2026.02.11', type: '일본 정규 1집 · CD 17곡', songs: ["MWUAH", "I WANT IT (Japanese Ver.)", "BEBE (Japanese Ver.)", "POPPY", "Teddy Bear (Japanese Ver.)", "ASAP (Japanese Ver.)", "LIT", "STEREOTYPE (Japanese Ver.)", "Tell Me Now", "Satellite", "Lover, Killer", "Say My Name", "MEOW", "GPT (Japanese Ver.)", "Bubble (Japanese Ver.)", "Cheeky Icy Thang (Japanese Ver.)", "Stay WITH me (Japanese Ver.)"], href: 'https://www.universal-music.co.jp/stayc/news/2025-11-11/' },
        { title: 'I WANT IT', date: '2025.07.23', type: '스페셜 싱글 · 타이틀 I WANT IT', songs: ['I WANT IT', 'BOY', '반칙 (Honestly)'], href: 'https://www.highup-ent.com/stayc/i-want-it/' },
        { title: 'Star To A Young Culture', date: '2020.11.12', type: '데뷔 싱글 · 타이틀 SO BAD', songs: ['SO BAD', 'LIKE THIS'], href: 'https://www.highup-ent.com/stayc/star-to-a-young-culture/' }
      ],
      news: [
        { date: '2026.06.16', tag: '음악', title: '싱글 6집 2:LOVE 발매 · 타이틀 2 L0VE', href: 'https://www.highup-ent.com/stayc/2love/' },
        { date: '2025.11.11', tag: '앨범', title: '일본 정규 1집 STAY ALIVE 상세 발표 · 2026.02.11 발매', href: 'https://www.universal-music.co.jp/stayc/news/2025-11-11/' },
        { date: '공식', tag: '로그인', title: 'STAYC Weverse 공식 공지', href: 'https://weverse.io/stayc/notice' }
      ],
      merch: [
        { title: 'STAYC 공식 상품', sub: 'Weverse Shop · 앨범·굿즈 목록', href: 'https://shop.weverse.io/ko/shop/KRW/artists/34' },
        { title: 'STAY ALIVE 일본 정규 1집 CD', sub: 'UNIVERSAL MUSIC STORE · 통상반 · 스토어 한정 구매 특전 종료 · 재고는 판매처 확인', href: 'https://store-annex.universal-music.co.jp/product/upch29482/' }
      ],
      campaigns: [
      ],
      accent: '#e4897b', light: '#ffe7df', dark: '#865366', bg: '#fff8f3', shape: '✾'
    },
    {
      id: 'idle', name: 'i-dle', korean: '아이들', category: 'girl', fan: 'NEVERLAND', agency: 'CUBE Entertainment',
      members: ['미연', '민니', '소연', '우기', '슈화'],
      debut: '2018.05.02', debutWork: 'I am', songs: ['LATATA', '달라($$$)', 'MAZE', "DON'T TEXT ME", '알고 싶어 (What’s in your house?)', '들어줘요 (Hear me)'],
      concept: '2018년 LATATA로 데뷔한 다섯 멤버의 셀프 프로듀싱 그룹. 2025년부터 i-dle이라는 이름으로 활동.',
      official: 'https://i-dle.cubeent.co.jp/profile/', youtube: 'https://www.youtube.com/@official_i_dle',
      photo: '(G)I-DLE Airport Departure 2024.png', photoLabel: '2024년 공항 단체', photoYear: '2024', credit: 'K-POPIT 케이팝잇', license: 'CC BY 3.0',
      music: [
        { title: 'We made', date: '2026.07.06', type: '미니 9집 · 타이틀 Gimme Dat Love', songs: ['Mono (Feat. skaiwater)', 'Gimme Dat Love', 'Morning', 'Crow', 'Love Is Pain'], href: 'https://i-dle.cubeent.co.jp/discography/2929/' },
        { title: 'i-dle', date: '2025.10.03', type: '일본 미니 1집 · 타이틀 どうしよっかな', songs: ['どうしよっかな', 'Invincible', '愛せなかった世界へ永遠にじゃあね', '傷つくのは嫌いだから', 'Queencard (Japanese ver.)'], href: 'https://i-dle.cubeent.co.jp/discography/2530/' },
        { title: 'We are', date: '2025.05.19', type: '미니 8집 · 타이틀 Good Thing', songs: ['Good Thing', 'Girlfriend', 'Love Tease', 'Chain', 'Unstoppable', 'If You Want'], href: 'https://i-dle.cubeent.co.jp/discography/2324/' },
        { title: 'I am', date: '2018.05.02', type: '데뷔 미니 1집 · 타이틀 LATATA', songs: ['LATATA', '달라($$$)', 'MAZE', "DON'T TEXT ME", '알고 싶어 (What’s in your house?)', '들어줘요 (Hear me)'], href: 'https://i-dle.cubeent.co.jp/discography/329/' }
      ],
      appearances: [
        { date: '2026-11-13', title: '소연 · 일본 라디오 K TRACKS', sub: '닛폰방송 · 21:30~21:50 (일본 현지) · 방송사 주관', href: 'https://i-dle.cubeent.co.jp/news/' },
        { date: '2026-11-16', title: '소연 · 일본 라디오 K TRACKS', sub: '시코쿠방송 · 23:40~24:00 (일본 현지) · 방송사 주관', href: 'https://i-dle.cubeent.co.jp/news/' }
      ],
      schedules: [
        { title: '일본 공식 일정', sub: '발매·방송·행사 및 변경 확인', href: 'https://i-dle.cubeent.co.jp/schedule/' },
        { title: '큐브 일본 공식 소식', sub: '일정·방송 공지 원문', href: 'https://i-dle.cubeent.co.jp/news/' }
      ],
      news: [
        { date: '2026.11.02', tag: '방송', title: '소연, 11.13·11.16 일본 라디오 K TRACKS 출연 안내', href: 'https://i-dle.cubeent.co.jp/news/' },
        { date: '2026.10.28', tag: '인터뷰', title: '소연 Rolling Stone JAPAN 인터뷰 소개', href: 'https://i-dle.cubeent.co.jp/news/' },
        { date: '2026.06.17', tag: '음반', title: '미니 9집 We made 발매·일본 공식 수입반 안내', href: 'https://i-dle.cubeent.co.jp/news/2858/' }
      ],
      merch: [
        { title: 'We made 공식 앨범', sub: 'Weverse Shop · Mono/Crow 버전·포토카드 구성 · 재고는 판매처 확인', href: 'https://shop.weverse.io/en/shop/USD/artists/113/notices/13359' },
        { title: 'We made 일본 공식 수입반', sub: 'UNIVERSAL MUSIC · Mono/Crow/POCAALBUM 버전 · 재고·특전은 판매처 확인', href: 'https://www.universal-music.co.jp/i-dle/news/2026-06-17-2/' }
      ],
      campaigns: [
        { kind: '광고', date: '2026.05.05', title: '패밀리마트 × i-dle', sub: '2026.05.05~11 일본 점포 FamiMa TV·매장 안내 방송 · 기간 종료', href: 'https://i-dle.cubeent.co.jp/news/2772/' }
      ],
      accent: '#9567d1', light: '#ebdeff', dark: '#594077', bg: '#faf5ff', shape: '✦'
    },
    {
      id: 'bts', name: 'BTS', korean: '방탄소년단', category: 'boy', fan: 'ARMY', agency: 'BIGHIT MUSIC',
      members: ['RM', '진', '슈가', '제이홉', '지민', '뷔', '정국'],
      debut: '2013.06.13', debutWork: '2 COOL 4 SKOOL', songs: ['No More Dream', 'We Are Bulletproof Pt.2'],
      concept: '음악과 이야기를 통해 전 세계 아미와 연결되는 일곱 멤버.',
      official: 'https://ibighit.com/ko/bts/profile/', youtube: 'https://www.youtube.com/@BTS',
      photo: 'BTS during a White House press conference May 31, 2022 (cropped).jpg', photoLabel: '백악관 기자회견', photoYear: '2022', credit: 'The White House', license: 'Public domain',
      music: [
        {
          "title": "ARIRANG",
          "date": "2026.03.20",
          "type": "정규 5집 · 타이틀 SWIM",
          "songs": [
            "Body to Body",
            "Hooligan",
            "Aliens",
            "FYA",
            "2.0",
            "No. 29",
            "SWIM",
            "Merry Go Round",
            "NORMAL",
            "Like Animals",
            "they don't know 'bout us",
            "One More Night",
            "Please",
            "Into the Sun"
          ],
          "href": "https://ibighit.com/ko/bts/discography/detail/arirang"
        },
        {
          "title": "2 COOL 4 SKOOL",
          "date": "2013.06.13",
          "type": "데뷔 싱글 · 타이틀 No More Dream",
          "songs": [
            "We Are Bulletproof Pt.2",
            "No More Dream",
            "좋아요 (Like)"
          ],
          "href": "https://bts.ibighit.com/kor/discography/detail/2_cool_4_school.html"
        }
      ],
      appearances: [
        {
          "date": "2026-11-19",
          "title": "BTS WORLD TOUR ARIRANG · 가오슝",
          "sub": "가오슝 국립경기장 · Live Nation · 19:00 (현지)",
          "href": "https://tixcraft.com/activity/detail/26_btskns"
        },
        {
          "date": "2026-11-21",
          "title": "BTS WORLD TOUR ARIRANG · 가오슝",
          "sub": "가오슝 국립경기장 · Live Nation · 19:00 (현지)",
          "href": "https://tixcraft.com/activity/detail/26_btskns"
        },
        {
          "date": "2026-11-22",
          "title": "BTS WORLD TOUR ARIRANG · 가오슝",
          "sub": "가오슝 국립경기장 · Live Nation · 19:00 (현지)",
          "href": "https://tixcraft.com/activity/detail/26_btskns"
        },
        {
          "date": "2026-12-03",
          "title": "BTS WORLD TOUR ARIRANG · 방콕",
          "sub": "라자망갈라 국립경기장 · Live Nation · 현지 공연 시각은 예매처 확인",
          "href": "https://btsworldtourofficial.com/"
        },
        {
          "date": "2026-12-05",
          "title": "BTS WORLD TOUR ARIRANG · 방콕",
          "sub": "라자망갈라 국립경기장 · Live Nation · 현지 공연 시각은 예매처 확인",
          "href": "https://btsworldtourofficial.com/"
        },
        {
          "date": "2026-12-06",
          "title": "BTS WORLD TOUR ARIRANG · 방콕",
          "sub": "라자망갈라 국립경기장 · Live Nation · 현지 공연 시각은 예매처 확인",
          "href": "https://btsworldtourofficial.com/"
        },
        {
          "date": "2026-12-12",
          "title": "BTS WORLD TOUR ARIRANG · 쿠알라룸푸르",
          "sub": "TM 스타디움 나시오날 · Live Nation · 현지 공연 시각은 예매처 확인",
          "href": "https://btsworldtourofficial.com/"
        },
        {
          "date": "2026-12-13",
          "title": "BTS WORLD TOUR ARIRANG · 쿠알라룸푸르",
          "sub": "TM 스타디움 나시오날 · Live Nation · 현지 공연 시각은 예매처 확인",
          "href": "https://btsworldtourofficial.com/"
        },
        {
          "date": "2026-12-17",
          "title": "BTS WORLD TOUR ARIRANG · 싱가포르",
          "sub": "내셔널 스타디움 · Live Nation · 현지 공연 시각은 예매처 확인",
          "href": "https://btsworldtourofficial.com/"
        },
        {
          "date": "2026-12-19",
          "title": "BTS WORLD TOUR ARIRANG · 싱가포르",
          "sub": "내셔널 스타디움 · Live Nation · 현지 공연 시각은 예매처 확인",
          "href": "https://btsworldtourofficial.com/"
        },
        {
          "date": "2026-12-20",
          "title": "BTS WORLD TOUR ARIRANG · 싱가포르",
          "sub": "내셔널 스타디움 · Live Nation · 현지 공연 시각은 예매처 확인",
          "href": "https://btsworldtourofficial.com/"
        },
        {
          "date": "2026-12-22",
          "title": "BTS WORLD TOUR ARIRANG · 싱가포르",
          "sub": "내셔널 스타디움 · Live Nation · 현지 공연 시각은 예매처 확인",
          "href": "https://btsworldtourofficial.com/"
        },
        {
          "date": "2026-12-26",
          "title": "BTS WORLD TOUR ARIRANG · 자카르타",
          "sub": "겔로라 붕 카르노 주경기장 · Live Nation · 현지 공연 시각은 예매처 확인",
          "href": "https://btsworldtourofficial.com/"
        },
        {
          "date": "2026-12-27",
          "title": "BTS WORLD TOUR ARIRANG · 자카르타",
          "sub": "겔로라 붕 카르노 주경기장 · Live Nation · 현지 공연 시각은 예매처 확인",
          "href": "https://btsworldtourofficial.com/"
        },
        {
          "date": "2026-12-29",
          "title": "BTS WORLD TOUR ARIRANG · 자카르타",
          "sub": "겔로라 붕 카르노 주경기장 · Live Nation · 현지 공연 시각은 예매처 확인",
          "href": "https://btsworldtourofficial.com/"
        }
      ],
      news: [
        {
          "date": "2026.07.18",
          "tag": "기록",
          "title": "NORMAL 뮤직비디오, Spotify 공개 첫날 K-pop 영상 스트리밍 기록",
          "href": "https://newsroom.spotify.com/2026-07-18/bts-music-video-normal/"
        },
        {
          "date": "2026.03.20",
          "tag": "컴백",
          "title": "정규 5집 ARIRANG 발매 · 타이틀 SWIM",
          "href": "https://ibighit.com/ko/bts/discography/detail/arirang"
        },
        {
          "date": "2026.01.13",
          "tag": "공연",
          "title": "2026~27 BTS WORLD TOUR 발표 · 공식 일정 확인",
          "href": "https://www.metlifestadium.com/news/detail/bts-announces-world-tour-to-play-metlife-stadium"
        }
      ],
      schedules: [
        {
          "title": "BTS WORLD TOUR ARIRANG 공식 일정",
          "sub": "도시·날짜·예매처 · 2026~2027",
          "href": "https://btsworldtourofficial.com/"
        },
        {
          "title": "BTS Weverse 공식 공지",
          "sub": "공연·활동 공지 · 일부 로그인 필요",
          "href": "https://weverse.io/bts/notice"
        }
      ],
      merch: [
        {
          "title": "ARIRANG 공식 MD",
          "sub": "Weverse · 일부 공지 로그인 필요 · 재고는 판매처 확인",
          "href": "https://weverse.io/bts/notice/34135"
        },
        {
          "title": "BTS 공식 응원봉 VER.4",
          "sub": "Weverse · 2026년 3월 공식 판매 안내",
          "href": "https://shop.weverse.io/en/shop/USD/artists/2/notices/12504"
        }
      ],
      campaigns: [
        {
          "kind": "콜라보",
          "date": "2026.03",
          "title": "BTS × MU:DS 박물관 문화상품",
          "sub": "국립박물관문화재단 협업 MD · Weverse 공식 판매 안내",
          "href": "https://weverse.io/bts/notice/34135"
        }
      ],
      accent: '#875dca', light: '#eadfff', dark: '#52367b', bg: '#f7f2ff', shape: '✧'
    },
    {
      id: 'seventeen', name: 'SEVENTEEN', korean: '세븐틴', category: 'boy', fan: 'CARAT', agency: 'PLEDIS Entertainment',
      members: ['에스쿱스', '정한', '조슈아', '준', '호시', '원우', '우지', '디에잇', '민규', '도겸', '승관', '버논', '디노'],
      debut: '2015.05.26', debutWork: '17 CARAT', songs: ['아낀다 (Adore U)', '20'],
      checkedAt: '2026.11.12',
      concept: '보컬·퍼포먼스·힙합 유닛이 함께 빚는 팀워크.',
      official: 'https://www.pledis.co.kr/', youtube: 'https://www.youtube.com/@pledis17',
      photo: 'Seventeen Carat Land 24.jpg', photoLabel: 'CARAT LAND', photoYear: '2025', credit: 'SEVENTEEN', license: 'CC BY 3.0',
      morePhotos: [
        commonsPhoto('Right Here tour Seventeen.jpg', 'RIGHT HERE 투어 · 2025', '2025', 'Seventeen', 'CC BY 3.0'),
        commonsPhoto('Seventeen Right Here Japan.png', 'RIGHT HERE 일본 공연 · 2024 · 크롭·선명도 보정', '2024', 'Pledis Entertainment', 'CC BY 3.0')
      ],
      music: [
        { title: 'DREAMSCAPE (정한×조슈아 · JxJ)', date: '2026.10.19', type: '유닛 미니 1집 · 타이틀 12 o’clock',
          songs: ['Like you', '12 o’clock', 'Outside', 'One plus one', 'Not personal (JOSHUA Solo)', '컬러링 (JEONGHAN Solo)', 'No looking back'],
          href: 'https://www.pledis.co.kr/en/artist/detail/seventeen/discography/?albumType=ALL' },
        { title: 'V8 (디에잇×버논)', date: '2026.06.29', type: '유닛 미니 1집 · 타이틀 singasong',
          songs: ['Friend', 'BEAT', 'singasong', 'mia (Vernon Solo)', 'coloring', 'girlsnboys', '8DM (THE 8 Solo)', 'rat race'],
          href: 'https://music.apple.com/us/album/v8/6780313409' },
        { title: 'HAPPY BURSTDAY', date: '2025.05.26', type: '정규 5집 · 타이틀 THUNDER',
          songs: ['HBD', 'THUNDER', 'Bad Influence (Prod. by Pharrell Williams)', 'Skyfall (THE 8 Solo)', 'Fortunate Change (JOSHUA Solo)', '99.9% (WONWOO Solo)', 'Raindrops (SEUNGKWAN Solo)', 'Damage (HOSHI Solo) (feat. Timbaland)', 'Shake It Off (MINGYU Solo)', 'Happy Virus (DK Solo)', 'Destiny (WOOZI Solo)', 'Shining Star (Vernon Solo)', 'Gemini (JUN Solo)', 'Trigger (DINO Solo)', 'Coincidence (JEONGHAN Solo)', 'Jungle (S.COUPS Solo)'],
          href: 'https://www.seventeen-17.jp/posts/discography/incaiv' },
        { title: '17 CARAT', date: '2015.05.26', type: '데뷔 미니 1집 · 타이틀 아낀다',
          songs: ['Shining Diamond', '아낀다 (Adore U)', 'Ah Yeah', 'Jam Jam', '20'],
          href: 'https://www.seventeen-17.jp/posts/discography/insmxq' }
      ],
      appearances: [
        { date: '2026-11-21', title: '정한×조슈아 JOURNEY INTO [DREAMING] · 일본 공연',
          sub: '베루나 돔(사이타마) · 17:00 (일본 현지) · PLEDIS / 공식 일본 팬클럽 · 티켓 변경은 공식 사이트 확인',
          href: 'https://www.seventeen-17.jp/posts/schedule/ztckpb' },
        { date: '2026-11-22', title: '정한×조슈아 JOURNEY INTO [DREAMING] · 일본 공연',
          sub: '베루나 돔(사이타마) · 17:00 (일본 현지) · 공식 라이브뷰잉 별도 진행',
          href: 'https://www.seventeen-17.jp/posts/schedule/ztckpb' },
        { date: '2026-11-22', title: '정한×조슈아 일본 돔 공연 · 영화관 생중계',
          sub: '일본 전국 및 해외 일부 극장 · 17:00 (일본 현지) · 극장·예매는 공식 안내 확인',
          href: 'https://www.seventeen-17.jp/posts/information/vzovft' },
        { date: '2026-11-27', endDate: '2026-12-10', title: 'HYBE CINE FEST 2026 · SEVENTEEN 월드투어 공연 영상',
          sub: '일본 전국 영화관 · 11월 27일~12월 10일 한정 상영 · 상영 시간은 극장별 확인',
          href: 'https://www.seventeen-17.jp/posts/information/mcdmdc' },
        { date: '2026-12-02', title: '정한×조슈아 DREAMSCAPE · 프리미엄 사인회',
          sub: '도쿄 내 비공개 장소 · 당첨자 대상 · 상세 시간·장소는 당첨자 개별 안내',
          href: 'https://www.seventeen-17.jp/posts/schedule/fwczng' },
        { date: '2026-12-05', title: '정한×조슈아 DREAMSCAPE · 온라인 개별 대화 행사',
          sub: '당첨자 대상 온라인 행사 · 시간은 당첨자 개별 안내 · 신규 응모 기간 종료',
          href: 'https://www.seventeen-17.jp/posts/schedule/yaprrj' },
        { date: '2026-12-11', title: '정한×조슈아 JOURNEY INTO [DREAMING] · 마카오 공연',
          sub: '갤럭시 아레나 · 20:00 (마카오 현지) · PLEDIS·HYBE 등 주최 · 11.12 일반예매', href: 'https://www.galaxymacau.com/zh-hant/offers/entertainment/jeonghan-x-joshua-journey-dreaming-macau/' },
        { date: '2026-12-12', title: '정한×조슈아 JOURNEY INTO [DREAMING] · 마카오 공연',
          sub: '갤럭시 아레나 · 19:00 (마카오 현지) · PLEDIS·HYBE 등 주최', href: 'https://www.galaxymacau.com/zh-hant/offers/entertainment/jeonghan-x-joshua-journey-dreaming-macau/' }
      ],
      schedules: [
        { title: 'SEVENTEEN 일본 공식 일정', sub: '방송·공연·발매 달력', href: 'https://www.seventeen-17.jp/posts/schedule' },
        { title: 'PLEDIS · SEVENTEEN 공지', sub: '일정 변경·예매 및 공식 알림 · 로그인 후 확인', href: 'https://weverse.io/seventeen/notice' }
      ],
      news: [
        { date: '2026.11.11', tag: '공연', title: '정한×조슈아 일본 공연 공식 티켓 쉐어링 개시', href: 'https://www.seventeen-17.jp/posts/information/gnelcq' },
        { date: '2026.11.10', tag: '팬 행사', title: '11월 21·22일 일본 공연장 CARAT 공식 팬클럽 부스 안내', href: 'https://www.seventeen-17.jp/posts/information/deipgt' },
        { date: '2026.10.19', tag: '음악', title: '정한×조슈아 유닛 JxJ 미니 1집 DREAMSCAPE 발매 · 로그인 후 확인', href: 'https://weverse.io/seventeen/notice/39436/' }
      ],
      merch: [
        { title: '정한×조슈아 일본 공연 공식 팝업 스토어',
          sub: '2026.11.06~11.23 · SHIBUYA TSUTAYA B1F · 공식 MD · 품목별 판매 시작일 상이 · 입장 예약 대상 시간은 공식 안내 확인',
          href: 'https://www.seventeen-17.jp/posts/information/cbaizr' },
        { title: 'THE 8 생일 기념 공식 굿즈 ver.6', sub: '젓가락 세트 · 2026.11.06 예약 개시 · 재고·종료 여부는 위버스샵 확인', href: 'https://www.seventeen-17.jp/posts/information/mwgnvy' },
        { title: 'JxJ DREAMSCAPE 공식 MD', sub: '포토카드 홀더·키링·포스터·파우치 등 · 수량·재고는 위버스샵 확인', href: 'https://www.seventeen-17.jp/posts/information/kfxdkv' },
        { title: 'SEVENTEEN 공식 상품 목록', sub: 'Weverse Shop · 앨범·응원봉·공식 MD · 가격·재고 확인', href: 'https://shop.weverse.io/ko/shop/KRW/artists/7' }
      ],
      campaigns: [
        { kind: '홍보대사', date: '2024.06.26', title: '유네스코 청년 친선대사', sub: 'UNESCO 첫 청년 친선대사로 임명 · Going Together 청년 지원 협력', href: 'https://www.unesco.org/en/articles/unesco-and-k-pop-group-seventeen-announce-1-million-grant-scheme-youth-well-being-and-creativity' },
        { kind: '콜라보', date: '2025.06.11', title: 'SEVENTEEN × sacai · Bad Influence 의상', sub: '뮤직비디오 협업 의상 제작 · 자선 경매 수익 UNESCO 기부 안내', href: 'https://www.billboard-japan.com/d_news/detail/150491/2' }
      ],
      accent: '#88a9d8', light: '#dfeeff', dark: '#466386', bg: '#f7faff', shape: '◇'
    },
    {
      id: 'straykids', name: 'Stray Kids', korean: '스트레이 키즈', category: 'boy', fan: 'STAY', agency: 'JYP Entertainment',
      members: ['방찬', '리노', '창빈', '현진', '한', '필릭스', '승민', '아이엔'],
      debut: '2018.03.25', debutWork: 'I am NOT', songs: ['District 9', 'Mirror'],
      concept: '직접 만드는 음악과 에너지 넘치는 퍼포먼스.',
      official: 'https://straykids.jype.com/', youtube: 'https://www.youtube.com/@StrayKids',
      photo: 'Stray Kids at the 40th Golden Disc Awards, January 10, 2026 (1).png', photoLabel: '골든디스크 시상식', photoYear: '2026', credit: 'K-POPIT 케이팝잇', license: 'CC BY 4.0',
      accent: '#ee686b', light: '#4b252d', dark: '#fff1f2', bg: '#191117', night: true, shape: '⚡'
    },
    {
      id: 'txt', name: 'TXT', korean: '투모로우바이투게더', category: 'boy', fan: 'MOA', agency: 'BIGHIT MUSIC',
      members: ['수빈', '연준', '범규', '태현', '휴닝카이'],
      debut: '2019.03.04', debutWork: '꿈의 장: STAR', songs: ['어느날 머리에서 뿔이 자랐다 (CROWN)', 'Blue Orangeade'],
      concept: '다섯 멤버가 함께 그려 나가는 성장과 판타지.',
      checkedAt: '2026.11.12',
      official: 'https://ibighit.com/ko/txt/profile/', youtube: 'https://www.youtube.com/@TXT_bighit',
      photo: 'Tomorrow X Together at a Dior event, April 18, 2025.png', photoLabel: '디올 행사', photoYear: '2025', credit: 'K-POPIT 케이팝잇', license: 'CC BY 3.0',
      morePhotos: [
        commonsPhoto('HueningKai at Ferragamo photocall, August 2026 (1).jpg', '휴닝카이 · 페라가모 행사', '2026', 'K-POPIT 케이팝잇', 'CC BY 4.0'),
        commonsPhoto('투모로우바이투게더 (TOMORROW X TOGETHER) TXT @ 190315 뮤직뱅크 출근길 01.png', '데뷔 활동 · 뮤직뱅크', '2019', 'Nine Stars', 'CC BY 3.0')
      ],
      music: [
        { title: '7TH YEAR: 가시덤불에 잠시 바람이 멈췄을 때', date: '2026.04.13', type: '미니 8집 · 타이틀 하루에 하루만 더 (Stick With You)', songs: ['Bed of Thorns', '하루에 하루만 더 (Stick With You)', 'Take Me to Nirvana (feat. Vinida Weng)', 'So What', '21st Century Romance', '다음의 다음 (Dream of Mine)'], href: 'https://ibighit.com/ko/txt/discography/detail/7th_year' },
        { title: '꿈의 장: STAR', date: '2019.03.04', type: '데뷔 미니앨범 · 타이틀 어느날 머리에서 뿔이 자랐다 (CROWN)', songs: ['Blue Orangeade', '어느날 머리에서 뿔이 자랐다 (CROWN)', 'Our Summer', 'Cat & Dog', '별의 낮잠'], href: 'https://ibighit.com/legacy/txt/the_dream_chapter-star-ko.html' }
      ],
      appearances: [
        { date: '2026-11-13', title: 'STEAL THE WIND 서울 월드투어 첫날', sub: '19:00 · 서울 KSPO DOME · BIGHIT MUSIC·HYBE 주최 · 온라인 생중계', href: 'https://weverse.io/txt/notice/39106' },
        { date: '2026-11-14', title: 'STEAL THE WIND 서울 월드투어', sub: '18:00 · 서울 KSPO DOME · BIGHIT MUSIC·HYBE 주최 · 온라인 생중계', href: 'https://weverse.io/txt/notice/39106' },
        { date: '2026-11-15', title: 'STEAL THE WIND 서울 월드투어', sub: '17:00 · 서울 KSPO DOME · BIGHIT MUSIC·HYBE 주최 · 온라인 생중계', href: 'https://weverse.io/txt/notice/39106' },
        { date: '2026-11-16', title: '미니 9집 PERFECT STORM 정식 발매 예정', sub: '18:00 KST 음반·음원 발매 예정 · 세부 정보는 공식 공지 확인', href: 'https://weverse.io/txt/notice/40097' },
        { date: '2026-11-18', title: 'PERFECT STORM WITHMUU 팬사인회', sub: '21:00 KST · 당첨자 대상 · 응모 종료 · 장소·변경은 주최 측 확인', href: 'https://weverse.io/txt/notice/40680' },
        { date: '2026-11-20', title: 'STEAL THE WIND 마카오 추가 공연', sub: '20:00 현지시간 · 마카오 GALAXY ARENA · BIGHIT MUSIC·HYBE·iMe 주최', href: 'https://weverse.io/txt/notice/39469' },
        { date: '2026-11-21', title: 'STEAL THE WIND 마카오 월드투어', sub: '19:00 현지시간 · 마카오 GALAXY ARENA · BIGHIT MUSIC·HYBE·iMe 주최', href: 'https://www.galaxymacau.com/offers/entertainment/tomorrow-x-together-world-tour-macau-2026/' },
        { date: '2026-11-22', title: 'STEAL THE WIND 마카오 월드투어', sub: '17:00 현지시간 · 마카오 GALAXY ARENA · BIGHIT MUSIC·HYBE·iMe 주최', href: 'https://www.galaxymacau.com/offers/entertainment/tomorrow-x-together-world-tour-macau-2026/' },
        { date: '2026-11-27', title: 'PERFECT STORM 오프라인 팬사인회', sub: '20:00 KST · Weverse 당첨자 대상 · 세부 장소는 당첨자 안내', href: 'https://weverse.io/txt/notice/40006' },
        { date: '2026-11-27', title: 'PERFECT STORM 영상통화 팬사인회', sub: '22:00 KST · Weverse 당첨자 대상 · 구매·응모 조건 공식 공지 참조', href: 'https://weverse.io/txt/notice/40006' },
        { date: '2026-12-19', title: 'STEAL THE WIND 후쿠오카 월드투어', sub: '17:00 현지시간 · 일본 미즈호 PayPay 돔 후쿠오카 · HYBE JAPAN 공식 안내', href: 'https://www.hybejapan-concert.com/statics/txt_steal_the_wind_in_japan' },
        { date: '2026-12-20', title: 'STEAL THE WIND 후쿠오카 월드투어', sub: '16:00 현지시간 · 일본 미즈호 PayPay 돔 후쿠오카 · HYBE JAPAN 공식 안내', href: 'https://www.hybejapan-concert.com/statics/txt_steal_the_wind_in_japan' },
        { date: '2027-01-07', title: 'STEAL THE WIND 도쿄 월드투어', sub: '18:00 현지시간 · 일본 도쿄 돔 · HYBE JAPAN 공식 안내', href: 'https://www.hybejapan-concert.com/statics/txt_steal_the_wind_in_japan' },
        { date: '2027-01-08', title: 'STEAL THE WIND 도쿄 월드투어', sub: '18:00 현지시간 · 일본 도쿄 돔 · HYBE JAPAN 공식 안내', href: 'https://www.hybejapan-concert.com/statics/txt_steal_the_wind_in_japan' },
        { date: '2027-01-30', title: 'STEAL THE WIND 오사카 월드투어', sub: '17:00 현지시간 · 일본 교세라 돔 오사카 · HYBE JAPAN 공식 안내', href: 'https://www.hybejapan-concert.com/statics/txt_steal_the_wind_in_japan' },
        { date: '2027-01-31', title: 'STEAL THE WIND 오사카 월드투어', sub: '16:00 현지시간 · 일본 교세라 돔 오사카 · HYBE JAPAN 공식 안내', href: 'https://www.hybejapan-concert.com/statics/txt_steal_the_wind_in_japan' },
        { date: '2027-02-20', title: 'STEAL THE WIND 나고야 월드투어', sub: '17:00 현지시간 · 일본 반테린 돔 나고야 · HYBE JAPAN 공식 안내', href: 'https://www.hybejapan-concert.com/statics/txt_steal_the_wind_in_japan' },
        { date: '2027-02-21', title: 'STEAL THE WIND 나고야 월드투어', sub: '17:00 현지시간 · 일본 반테린 돔 나고야 · HYBE JAPAN 공식 안내', href: 'https://www.hybejapan-concert.com/statics/txt_steal_the_wind_in_japan' }
      ],
      schedules: [
        { title: 'BIGHIT 공식 TXT 월드투어 일정', sub: 'STEAL THE WIND · 일정·장소·예매 변경 확인', href: 'https://ibighit.com/en/txt/tour/' },
        { title: 'TXT Weverse 공식 공지', sub: '공연·팬사인회·음반 행사 · 로그인 필요할 수 있음', href: 'https://weverse.io/txt/notice' },
        { title: '서울 공연 온라인 생중계', sub: '11.13~15 실시간 공연 및 11.20~22 지연 스트리밍', href: 'https://concerts.weverse.io/events/txt_steal_the_wind_seoul' }
      ],
      news: [
        { date: '2026.11.11', tag: '팬 행사', title: '일본 투어 8회 공연 종료 후 당첨자 하이터치 행사 확정 · 응모 11.11~11.17, 11.25~12.01', href: 'https://txt-official.jp/news/02e45668dca1' },
        { date: '2026.11.09', tag: '팬 행사', title: '일본 후쿠오카·도쿄·오사카·아이치 공연 사운드체크 추첨 행사 안내', href: 'https://txt-official.jp/news/061bdc0cc1e4' },
        { date: '2026.11.09', tag: '이벤트', title: '일본 4개 도시 THE MAGIC WORLD 랜턴 행사 예정 · 시간·세부 장소 추후 공지', href: 'https://txt-official.jp/news/64e2fa6963fc' },
        { date: '2026.11.04', tag: '굿즈', title: 'STEAL THE WIND 월드투어 공식 MD 11.05 판매 시작 안내 · 재고는 위버스샵 확인', href: 'https://shop.weverse.io/en/shop/USD/artists/3/notices/14842' },
        { date: '2026.10.20', tag: '컴백', title: '11월 16일 미니 9집 PERFECT STORM 발매 예정 · 위버스 공지 로그인 후 확인', href: 'https://weverse.io/txt/notice/40097' }
      ],
      merch: [
        { title: 'PERFECT STORM 미니 9집 공식 예약 음반', sub: '위버스샵 · 2026.10.20~11.15 예약 · 11.16 발매 예정 · 가격·재고는 판매처 확인', href: 'https://shop.weverse.io/en/shop/USD/artists/3/notices/14652' },
        { title: 'STEAL THE WIND 월드투어 공식 MD', sub: '위버스샵 · 11.05 판매 시작 · 한정 수량·품절 여부는 판매처 확인', href: 'https://shop.weverse.io/en/shop/USD/artists/3/notices/14842' },
        { title: 'STEAL THE WIND MD 2차 예약', sub: '위버스샵 · 2026.11.06~11.16 14:00 예약 · 2027.01.12 발송 시작 예정', href: 'https://shop.weverse.io/en/shop/USD/artists/3/notices/14875' },
        { title: 'TXT 공식 상품 전체 목록', sub: 'Weverse Shop · 앨범·응원봉·MD · 가격·재고는 판매처 확인', href: 'https://shop.weverse.io/ko/shop/KRW/artists/3' }
      ],
      campaigns: [
        { kind: '홍보대사', date: '2023.08.10', title: 'Dior · TXT 그룹 글로벌 앰배서더 위촉', sub: '2023년 공식 발표 · 현재 계약 상태는 별도 확인 필요', href: 'https://prtimes.jp/main/html/rd/p/000001217.000008795.html' }
      ],
      accent: '#299da9', light: '#d9fbf4', dark: '#28656e', bg: '#f3fffc', shape: '✳'
    },
    {
      id: 'enhypen', name: 'ENHYPEN', korean: '엔하이픈', category: 'boy', fan: 'ENGENE', agency: 'BELIFT LAB',
      members: ['정원', '제이', '제이크', '성훈', '선우', '니키'],
      debut: '2020.11.30', debutWork: 'BORDER : DAY ONE', songs: ['Given-Taken', 'Let Me In (20 CUBE)'],
      concept: '서로 다른 세계를 음악으로 잇는 여섯 멤버.',
      checkedAt: '2026.11.12',
      official: 'https://beliftlab.com/artist/profile/ENHYPEN?lang=ko', youtube: 'https://www.youtube.com/@ENHYPENOFFICIAL',
      photo: 'Enhypen, June 2026.jpg', photoLabel: '2026년 단체', photoYear: '2026', credit: 'K-POPIT', license: 'CC BY 4.0',
      morePhotos: [
        commonsPhoto('Enhypen at Golden disc awards.png', '2026 골든디스크 · 당시 7인 단체', '2026', '티비텐 TV10', 'CC BY 3.0')
      ],
      music: [
        { title: 'THE SIN : BLISS', date: '2026.08.21', type: '미니 8집 · 타이틀 Bloody Paradise', songs: ['Two Fools', 'Breaking News', 'Stuck', 'Bad For You', 'Remnants of Love', 'Bloody Paradise', 'The Final Moment', 'Checkmate', 'Highlight', 'The Veiled Truth'], href: 'https://beliftlab.com/artist/discography/ENHYPEN/20' },
        { title: 'THE SIN : VANISH', date: '2026.01.16', type: '미니 7집 · 타이틀 Knife', songs: ['The Beginning', 'No Way Back (feat. So!YoON!)', 'The Fugitives', 'Knife', 'Stealer', 'The Voice', 'Witnesses', 'Big Girls Don\'t Cry', 'Lost Island', 'Sleep Tight', 'The Beyond'], href: 'https://beliftlab.com/artist/discography/ENHYPEN/17' },
        { title: 'BORDER : DAY ONE', date: '2020.11.30', type: '데뷔 미니앨범 · 타이틀 Given-Taken', songs: ['Given-Taken', 'Let Me In (20 CUBE)'], href: 'https://beliftlab.com/artist/discography/ENHYPEN/1' }
      ],
      appearances: [
        { date: '2026-11-13', title: 'BLOOD SAGA 월드투어 공연 영상 일본 극장 상영 시작', sub: '11.13~11.26 · 일본 전국 영화관 · 한정 입장 선물 안내 · 상영·예매는 공식 사이트 확인', href: 'https://enhypen-jp.weverse.io/news/78707bf51814' },
        { date: '2026-11-20', endDate: '2026-12-02', title: 'BLOOD SAGA 도쿄 팝업스토어 개막', sub: '11.20~12.02 · 도쿄 시부야구 제9SY 빌딩 1층 · 11:00~19:00 (JST) · 입장 예약·판매 상태는 공식 공지 확인', href: 'https://enhypen-jp.weverse.io/news/dd0bec9156a4' },
        { date: '2026-11-20', title: 'THE SIN : PARALLEL WORLD 디지털 싱글 발매 예정', sub: '14:00 한국시간 · 디지털 음원·미국 싱글 CD · 실물 발매일과 구분', href: 'https://weverse.io/enhypen/notice/40374' },
        { date: '2026-11-23', title: 'THE SIN : PARALLEL WORLD 실물 싱글 앨범 발매 예정', sub: '12:00 한국시간 · 스핀오프 싱글 실물 발매 · 변경은 공식 공지 확인', href: 'https://weverse.io/enhypen/notice/40374' },
        { date: '2026-12-01', title: 'BLOOD SAGA 일본 투어 · 도쿄 1일차', sub: '도쿄돔 · 18:30 공연 시작 (JST) · 공식 투어·예매 안내', href: 'https://enhypen-jp.weverse.io/schedule/cb268ca1962b' },
        { date: '2026-12-02', title: 'BLOOD SAGA 일본 투어 · 도쿄 2일차', sub: '도쿄돔 · 16:00 공연 시작 (JST) · 공식 투어·예매 안내', href: 'https://enhypen-jp.weverse.io/schedule/911292cae943' },
        { date: '2026-12-13', title: '일본 도쿄 미트앤그리트 · 개별 사인회', sub: '도쿄 빅사이트 남3홀 · 응모 당첨자 대상 · 상세 시간 추후 공지', href: 'https://www.universal-music.co.jp/enhypen/news/2026-10-29/' },
        { date: '2026-12-17', title: 'PARALLEL WORLD 발매 기념 온라인 2샷 행사', sub: '20:30경 일본 현지시간 · 당첨자 대상 · WithLIVE · 시간 변경 가능', href: 'https://enhypen-jp.weverse.io/news/cdaa6da839b4' },
        { date: '2026-12-18', endDate: '2026-12-27', title: 'BLOOD SAGA 나고야 팝업스토어 개막', sub: '12.18~12.27 · 나고야 PARCO 남관 10층 · 10:00~20:00 (JST)', href: 'https://enhypen-jp.weverse.io/news/dd0bec9156a4' },
        { date: '2026-12-21', title: 'PARALLEL WORLD 발매 기념 온라인 2샷·토크 행사', sub: '20:30경 일본 현지시간 · 당첨자 대상 · WithLIVE · 시간 변경 가능', href: 'https://enhypen-jp.weverse.io/news/cdaa6da839b4' },
        { date: '2026-12-26', title: 'BLOOD SAGA 일본 투어 · 나고야 1일차', sub: '반테린돔 나고야 · 17:00 공연 시작 (JST) · 공식 투어·예매 안내', href: 'https://enhypen-jp.weverse.io/schedule/44ef1a8867ab' },
        { date: '2026-12-27', title: 'BLOOD SAGA 일본 투어 · 나고야 2일차', sub: '반테린돔 나고야 · 16:00 공연 시작 (JST) · 공식 투어·예매 안내', href: 'https://enhypen-jp.weverse.io/schedule/ca435a996f7d' },
        { date: '2027-01-29', endDate: '2027-02-07', title: 'BLOOD SAGA 후쿠오카 팝업스토어 개막', sub: '01.29~02.07 · 후쿠오카 솔라리아플라자 1층 · 평일 11:00~20:00 / 주말 10:00~20:00 (JST)', href: 'https://enhypen-jp.weverse.io/news/dd0bec9156a4' },
        { date: '2027-02-06', title: 'BLOOD SAGA 일본 투어 · 후쿠오카 1일차', sub: '미즈호 PayPay돔 후쿠오카 · 17:00 공연 시작 (JST) · 공식 투어·예매 안내', href: 'https://enhypen-jp.weverse.io/schedule/1c542b061fc8' },
        { date: '2027-02-07', title: 'BLOOD SAGA 일본 투어 · 후쿠오카 2일차', sub: '미즈호 PayPay돔 후쿠오카 · 16:00 공연 시작 (JST) · 공식 투어·예매 안내', href: 'https://enhypen-jp.weverse.io/schedule/1c542b061fc8' },
        { date: '2027-02-11', endDate: '2027-02-21', title: 'BLOOD SAGA 오사카 팝업스토어 개막', sub: '02.11~02.21 · 오사카 시로구치 빌딩 1~2층 · 11:00~19:00 (JST)', href: 'https://enhypen-jp.weverse.io/news/dd0bec9156a4' },
        { date: '2027-02-19', title: 'BLOOD SAGA 일본 투어 · 오사카 1일차', sub: '교세라돔 오사카 · 18:00 공연 시작 (JST) · 공식 투어·예매 안내', href: 'https://enhypen-jp.weverse.io/schedule/16851d04963f' },
        { date: '2027-02-20', title: 'BLOOD SAGA 일본 투어 · 오사카 2일차', sub: '교세라돔 오사카 · 16:00 공연 시작 (JST) · 공식 투어·예매 안내', href: 'https://enhypen-jp.weverse.io/schedule/16851d04963f' }
      ],
      schedules: [
        { title: 'BELIFT LAB 공식 일정', sub: '공연·활동 달력 및 변경 안내', href: 'https://beliftlab.com/artist/schedule/ENHYPEN' },
        { title: 'ENHYPEN 일본 공식 소식', sub: '발매·팬 이벤트·공연 안내', href: 'https://enhypen-jp.weverse.io/news/' },
        { title: 'ENHYPEN Weverse 공식 공지', sub: '팬사인회·앨범 공지 · 로그인 필요할 수 있음', href: 'https://weverse.io/enhypen/notice' }
      ],
      news: [
        { date: '2026.11.08', tag: '팬 행사', title: '12월 17·21일 일본 온라인 팬 이벤트 공지', href: 'https://enhypen-jp.weverse.io/news/cdaa6da839b4' },
        { date: '2026.11.06', tag: '공연', title: '11월 13~26일 BLOOD SAGA 일본 극장 상영·입장 선물 안내', href: 'https://enhypen-jp.weverse.io/news/78707bf51814' },
        { date: '2026.11.04', tag: '공연', title: 'BLOOD SAGA 일본 4도시 투어 팝업스토어 일정·장소 발표', href: 'https://enhypen-jp.weverse.io/news/dd0bec9156a4' },
        { date: '2026.10.26', tag: '음악', title: 'THE SIN : PARALLEL WORLD 발매 발표 · 디지털 11.20 / 실물 11.23 · Weverse 로그인 필요할 수 있음', href: 'https://weverse.io/enhypen/notice/40374' },
        { date: '2026.10.19', tag: '굿즈', title: '공식 응원봉 Ver.2 리뉴얼 에디션 및 데코 세트 판매 안내', href: 'https://shop.weverse.io/ko/shop/USD/artists/10/notices/14588' },

      ],
      merch: [
        { title: 'Official Light Stick Ver.2 (Renewal Edition)', sub: 'Weverse 공식 응원봉 · 10.19 18:00(KST) 판매 시작 · 수량 소진 시 종료 · 재고·가격 확인', href: 'https://shop.weverse.io/ko/shop/USD/artists/10/notices/14588' },
        { title: 'BLOOD SAGA 일본 월드투어 공식 MD', sub: '공식 투어 상품 · 포토·피켓·아크릴 스탠드 · 재고는 판매처 확인', href: 'https://enhypen-jp.weverse.io/news/f1516fcdee64' },
        { title: 'THE SIN : PARALLEL WORLD 공식 예약 앨범', sub: '10.26 예약 시작 · 국내 실물 11.23 발매 예정 · 재고·특전은 공식 판매처 확인', href: 'https://www.universal-music.co.jp/enhypen/news/2026-10-26/' },
        { title: 'THE SIN : BLISS 미니 8집 공식 음반', sub: '2026.08.21 국내 발매 · TAKE 1~4 버전 · 판매 상태는 공식 판매처 확인', href: 'https://enhypen-jp.weverse.io/news/ec88f679213e' },
        { title: 'ENHYPEN 공식 앨범·굿즈 목록', sub: 'Weverse Shop · 응원봉·앨범·MD · 재고·가격은 판매처 확인', href: 'https://shop.weverse.io/ko/shop/KRW/artists/10' }
      ],
      campaigns: [
        { kind: '광고', date: '2026.09.04', title: '신라면세점 · ENHYPEN 홍보 모델 발표', sub: '2026.08.26 소속사와 업무협약 · 09.04 공식 발표 · 온·오프라인 캠페인', href: 'https://mbiz.heraldcorp.com/article/10862443' },
        { kind: '홍보대사', date: '2023.10.30', title: 'Dr.Jart+ · 최초 글로벌 앰배서더 위촉', sub: '2023년 공식 발표 · 현재 계약 상태는 별도 확인 필요', href: 'https://www.prnewswire.com/news-releases/drjart-announces-enhypen-as-its-first-global-ambassador-301970560.html' }
      ],
      accent: '#d58b9e', light: '#4c3040', dark: '#fff1f5', bg: '#1c1521', night: true, shape: '♢'
    },
    {
      id: 'riize', name: 'RIIZE', korean: '라이즈', category: 'boy', fan: 'BRIIZE', agency: 'SM Entertainment',
      members: ['쇼타로', '은석', '성찬', '원빈', '소희', '앤톤'],
      debut: '2023.09.04', debutWork: 'Get A Guitar', songs: ['Get A Guitar', 'Memories'],
      concept: '함께 성장하며 꿈을 실현해 가는 여섯 멤버.',
      checkedAt: '2026.11.12',
      official: 'https://riizeofficial.jp/', youtube: 'https://www.youtube.com/@RIIZE_official',
      photo: 'Riize at the 2024 Melon Music Awards-2.png', photoLabel: '멜론뮤직어워드', photoYear: '2024', credit: 'TenAsia', license: 'CC BY 3.0',
      music: [
        { title: 'Insomnia', date: '2026.10.26', type: '디지털 싱글 · 공식 뮤직비디오', songs: ['Insomnia'], href: 'https://riizeofficial.jp/news/20261026/' },
        { title: 'Sunburst', date: '2026.08.26', type: '일본 싱글 3집 · CD 발매', songs: ['Sunburst', 'Rise Over', 'KILL SHOT'], href: 'https://riizeofficial.jp/discography/sunburst_normal/' },
        { title: 'II', date: '2026.06.15', type: '미니 2집 · 디지털 발매', songs: ['SOAR', 'Do your dance', 'D-D-Done', 'Overdrive', 'Like a Bomb', 'In a Loop'], href: 'https://riizeofficial.jp/discography/ii/' },
        { title: 'Get A Guitar', date: '2023.09.04', type: '데뷔 싱글', songs: ['Get A Guitar', 'Memories'], href: 'https://www.youtube.com/watch?v=iUw3LPM7OBU' }
      ],
      appearances: [
        { date: '2026-12-09', title: '2026 FNS 가요제 제2야 생방송', sub: '후지TV 계열 · 일본 현지 18:30~21:54 방송 · 출연 시간 미정', href: 'https://riizeofficial.jp/news/20261103/' },
        { date: '2026-12-27', title: 'Sunburst 오프라인 팬 이벤트', sub: '일본 도쿄 · 추첨 당첨자 대상 · 상세 장소·시간 비공개', href: 'https://riizeofficial.jp/news/2026102302/' },
        { date: '2026-12-27', title: 'Sunburst 프리미엄 그룹 사인회', sub: '일본 도쿄 · 당첨자 50명 · 2차 응모 11.15 23:59(JST) 종료 · 상세 시간 개별 안내', href: 'https://riizeofficial.jp/news/2026102303/' }
      ],
      news: [
        { date: '2026.11.03', tag: '방송', title: '12월 9일 일본 FNS 가요제 제2야 생방송 출연 발표', href: 'https://riizeofficial.jp/news/20261103/' },
        { date: '2026.10.26', tag: '음악', title: '디지털 싱글 Insomnia 발매 · 공식 뮤직비디오 공개', href: 'https://riizeofficial.jp/news/20261026/' },
        { date: '2026.10.23', tag: '이벤트', title: '12월 27일 Sunburst 일본 오프라인 이벤트·사인회 발표', href: 'https://riizeofficial.jp/news/2026102303/' }
      ],
      merch: [
        { title: 'RIIZE 2027 SEASON’S GREETINGS', sub: 'Weverse Shop 공식 예약 안내 · 2026.10.13 15:00(KST) 예약 시작 · 12.24부터 출고 예정 · 재고 확인', href: 'https://shop.weverse.io/en/shop/USD/artists/151/notices/14559' },
      ],
      schedules: [
        { title: 'RIIZE 일본 공식 활동 공지', sub: '방송·공연·팬 이벤트 변경 및 취소 확인', href: 'https://riizeofficial.jp/news/' }
      ],
      accent: '#df8a52', light: '#ffe7d2', dark: '#855234', bg: '#fff8ef', shape: '☀'
    },
    {
      id: 'boynextdoor', name: 'BOYNEXTDOOR', korean: '보이넥스트도어', category: 'boy', fan: 'ONEDOOR', agency: 'KOZ Entertainment',
      members: ['성호', '리우', '명재현', '태산', '이한', '운학'],
      debut: '2023.05.30', debutWork: 'WHO!', songs: ['돌아버리겠다 (But I Like You)', 'One and Only', 'Serenade'],
      concept: '일상의 이야기를 솔직하게 들려주는 여섯 멤버.',
      checkedAt: '2026.11.12',
      official: 'https://kozofficial.com/artist/profile/BOYNEXTDOOR', youtube: 'https://www.youtube.com/@BOYNEXTDOOR_official',
      photo: '2026-01-16 BOYNEXTDOOR at Golden Disc Awards 05 (cropped).png', photoLabel: '골든디스크 시상식', photoYear: '2026', credit: '티비텐 TV10', license: 'CC BY 4.0',
      morePhotos: [
        commonsPhoto('BoyNextDoor at the 2024 Melon Music Awards.png', '2024 멜론뮤직어워드 단체', '2024', 'TenAsia', 'CC BY 3.0')
      ],
      music: [
        { title: 'HOME: DELUXE', date: '2026.09.28', type: '정규 1집 리패키지 · 타이틀 ANIMAL · 디지털 13곡', songs: ['ANIMAL', 'CLICHE', '06070', 'VIRAL', 'ddok ddok ddok', 'ADIOS!', 'Upside Down', 'DIVE', 'Forever You', 'I Wonder', 'Count To Love (Korean Ver.)', '400 Years', 'Boom Boom Boom'], href: 'https://music.apple.com/us/album/home-deluxe/6806965442' },
        { title: 'HOME', date: '2026.06.08', type: '정규 1집 · 타이틀 VIRAL · 마지막 트랙은 CD 전용', songs: ['06070', 'VIRAL', 'ddok ddok ddok', 'ADIOS!', 'Upside Down', 'DIVE', 'Forever You', 'I Wonder', 'I Wonder, Always (CD Only)'], href: 'https://www.kozofficial.com/artist/discography/BOYNEXTDOOR/32' },
        { title: 'WHO!', date: '2023.05.30', type: '데뷔 싱글', songs: ['돌아버리겠다 (But I Like You)', 'One and Only', 'Serenade'], href: 'https://www.kozofficial.com/artist/discography/BOYNEXTDOOR/23' }
      ],
      appearances: [
        { date: '2026-11-13', title: 'KNOCK ON Vol.2 · 밴쿠버', sub: '캐나다 Queen Elizabeth Theatre · 현지 19:30 · AEG 주최 · 공연장 공식 예매 안내', href: 'https://vancouvercivictheatres.com/events/boynextdoor-tour-knock-on-vol2-nov-13-2026/' },
        { date: '2026-11-15', title: 'KNOCK ON Vol.2 · 시애틀', sub: '미국 시애틀 · 소속사 그룹 HYBE JAPAN 공식 투어 발표 · 현지 시간·예매 상세 확인', href: 'https://prtimes.jp/main/html/rd/p/000000697.000045862.html' },
        { date: '2026-11-17', title: 'KNOCK ON Vol.2 · 샌프란시스코', sub: '미국 샌프란시스코 · 소속사 그룹 HYBE JAPAN 공식 투어 발표', href: 'https://prtimes.jp/main/html/rd/p/000000697.000045862.html' },
        { date: '2026-11-20', title: 'KNOCK ON Vol.2 · 로스앤젤레스', sub: '미국 로스앤젤레스 · 소속사 그룹 HYBE JAPAN 공식 투어 발표', href: 'https://prtimes.jp/main/html/rd/p/000000697.000045862.html' },
        { date: '2026-11-24', title: 'KNOCK ON Vol.2 · 멕시코시티', sub: '멕시코 멕시코시티 · 소속사 그룹 HYBE JAPAN 공식 투어 발표', href: 'https://prtimes.jp/main/html/rd/p/000000697.000045862.html' },
        { date: '2026-12-05', title: 'KNOCK ON Vol.2 · 자카르타', sub: '인도네시아 자카르타 · 소속사 그룹 HYBE JAPAN 공식 투어 발표', href: 'https://prtimes.jp/main/html/rd/p/000000697.000045862.html' },
        { date: '2026-12-26', title: 'KNOCK ON Vol.2 · 쿠알라룸푸르', sub: '말레이시아 쿠알라룸푸르 · 소속사 그룹 HYBE JAPAN 공식 투어 발표', href: 'https://prtimes.jp/main/html/rd/p/000000697.000045862.html' }
      ],
      schedules: [
        { title: 'BOYNEXTDOOR 일본 공식 일정', sub: '공식 사이트 · 방송·공연·발매 일정', href: 'https://boynextdoor-official.jp/Schedule' },
        { title: 'BOYNEXTDOOR Weverse 공지', sub: '로그인·커뮤니티 가입 후 공연·행사 변경과 예매 정보 확인', href: 'https://weverse.io/boynextdoor/notice' }
      ],
      news: [
        { date: '2026.11.01', tag: '굿즈', title: 'One and Only 후드 재판매 발표 · 11.02 예약 시작', href: 'https://boynextdoor-official.jp/news/1eaa7468d773' },
        { date: '2026.10.27', tag: '굿즈', title: 'HYBE CINE FEST 2026 공식 상품 판매 안내', href: 'https://boynextdoor-official.jp/news/aa8fdc1e75ea' },
        { date: '2026.09.07', tag: '음반', title: 'HOME: DELUXE 예약 시작 · 9.28 정식 발매', href: 'https://shop.weverse.io/en/shop/USD/artists/112/notices/14247' },
        { date: '2026.07.30', tag: '협업', title: '언더아머 글로벌 앰배서더 · COMMIT 캠페인 발표', href: 'https://www.erajaya.com/index.php/news/under-armour-tunjuk-boynextdoor-sebagai-global-brand-ambassadors' },
      ],
      merch: [
        { title: 'HOME: DELUXE 공식 앨범', sub: 'Weverse Shop · 9.28 발매 · 9.07~9.27 예약·특전 기간 종료 · 현재 재고는 판매처 확인', href: 'https://shop.weverse.io/en/shop/USD/artists/112/notices/14247' },
        { title: 'One and Only 후드 재판매', sub: '공식 일본 판매 · 멤버십 가입자·일본 배송 한정 · 11.02부터 수량 소진 시 종료', href: 'https://boynextdoor-official.jp/news/1eaa7468d773' },
        { title: 'HYBE CINE FEST 2026 공식 상품', sub: 'Weverse Global · 10.24~10.31 예약 종료 · 한국 등 일부 국가 판매 제한 · 상품별 출고일 확인', href: 'https://shop.weverse.io/ko/shop/USD/artists/112/notices/14790' },
        { title: 'BOYNEXTDOOR 공식 상품', sub: 'Weverse Shop · 앨범·굿즈 목록', href: 'https://shop.weverse.io/ko/shop/KRW/artists/112' }
      ],
      campaigns: [
        { kind: '홍보대사', date: '2026.07.30', title: 'Under Armour · 글로벌 브랜드 앰배서더', sub: '글로벌 COMMIT 캠페인 · 언더아머 공식 유통사 발표', href: 'https://www.erajaya.com/index.php/news/under-armour-tunjuk-boynextdoor-sebagai-global-brand-ambassadors' },
      ],
      accent: '#478bc5', light: '#dfefff', dark: '#2d5678', bg: '#f3faff', shape: '✱'
    },
    {
      id: 'tws', name: 'TWS', korean: '투어스', category: 'boy', fan: '42 (SAI)', agency: 'PLEDIS Entertainment',
      members: ['신유', '도훈', '영재', '한진', '지훈', '경민'],
      debut: '2024.01.22', debutWork: 'Sparkling Blue', songs: ['첫 만남은 계획대로 되지 않아', 'Oh Mymy : 7s'],
      concept: '언제나 함께라는 이름처럼 일상의 설렘을 노래하는 보이후드 팝 여섯 멤버.',
      checkedAt: '2026.11.13',
      official: 'https://tws-official.jp/profile/', youtube: 'https://www.youtube.com/@TWS_PLEDIS',
      photo: 'TWS at the 2024 Melon Music Awards.png', photoLabel: '멜론뮤직어워드', photoYear: '2024', credit: 'TenAsia', license: 'CC BY 3.0',
      morePhotos: [
        commonsPhoto('TWS at Music Bank 20240202.jpg', '뮤직뱅크 출근길 · 2024.02.02', '2024', 'tenasia (티비텐)', 'CC BY 3.0')
      ],
      music: [
        {
          "title": "TO US",
          "date": "2026.11.02",
          "type": "싱글 2집 · 타이틀 내 이름을 불러줘 (Call My Name)",
          "songs": [
            "WE UP",
            "Call My Name (내 이름을 불러줘)",
            "heavy"
          ],
          "href": "https://music.apple.com/us/album/to-us-single/6818392534"
        },
        {
          "title": "NO TRAGEDY",
          "date": "2026.04.27",
          "type": "미니 5집 · 타이틀 You You",
          "songs": [
            "All the Possibilities",
            "You You",
            "Why You So Bad?",
            "Get It Now",
            "Fire Escape",
            "Back To Strangers"
          ],
          "href": "https://music.apple.com/us/album/no-tragedy/1887723578"
        },
        {
          "title": "Sparkling Blue",
          "date": "2024.01.22",
          "type": "데뷔 미니앨범 · 타이틀 첫 만남은 계획대로 되지 않아",
          "songs": [
            "첫 만남은 계획대로 되지 않아",
            "unplugged boy",
            "first hooky",
            "BFF",
            "Oh Mymy : 7s"
          ],
          "href": "https://music.apple.com/us/album/sparkling-blue/1723932647"
        }
      ],
      appearances: [
        {
          "date": "2026-11-13",
          "title": "TO US 위드뮤 1:1 영상통화 팬사인회",
          "sub": "상세 시간 추후 안내 · 당첨자 대상 · 응모 종료 · PLEDIS/위드뮤 공식 공지",
          "href": "https://weverse.io/tws/notice/40394"
        },
        {
          "date": "2026-11-14",
          "title": "MMA 2026 Global Day 출연",
          "sub": "서울 고척스카이돔 · 카카오엔터테인먼트 · 개별 출연 시각은 공식 안내 확인",
          "href": "https://newsroom.kakaoent.com/news/mma2026-welcomes-more-k-pop-heavyweights/"
        },
        {
          "date": "2026-11-29",
          "title": "TO US 케이타운포유 1:1 영상통화 팬사인회",
          "sub": "18:00 KST · 당첨자 대상 · PLEDIS/케이타운포유 · 응모 종료",
          "href": "https://weverse.io/tws/notice/40592"
        },
        {
          "date": "2026-12-09",
          "title": "TO US 뮤직플랜트 스페셜 팬사인회",
          "sub": "19:00 KST · 서울(당첨자 별도 안내) · PLEDIS/뮤직플랜트 · 응모 종료",
          "href": "https://weverse.io/tws/notice/40651"
        },
        {
          "date": "2026-12-17",
          "title": "TO US 엠투유레코드 오프라인 팬사인회",
          "sub": "20:30 KST · 서울(당첨자 별도 안내) · PLEDIS/엠투유레코드 · 응모 종료",
          "href": "https://weverse.io/tws/notice/40695"
        }
      ],
      schedules: [
        { title: 'TWS Weverse 공식 행사·팬사인회 안내', sub: '로그인 후 일정 변경·취소 및 당첨자 공지 확인', href: 'https://weverse.io/tws/notice' },
        { title: 'TWS 일본 공식 소식·일정', sub: '일본 활동 안내', href: 'https://tws-official.jp/' }
      ],
      news: [
        {
          "date": "2026.11.02",
          "tag": "컴백",
          "title": "싱글 2집 TO US 발매 · Call My Name 공개",
          "href": "https://music.apple.com/us/album/to-us-single/6818392534"
        },
        {
          "date": "2026.09.30",
          "tag": "공연",
          "title": "MMA 2026 출연 명단 공식 발표",
          "href": "https://newsroom.kakaoent.com/news/mma2026-brings-k-pops-biggest-names-to-stage/"
        }
      ],
      merch: [
        {
          "title": "TO US 싱글 2집 Beside Ver.",
          "sub": "PLEDIS · 2026.11.02 정식 발매 · 로그인 후 공지 확인 · 버전·재고는 판매처 확인",
          "href": "https://weverse.io/tws/notice/40249"
        },
        {
          "title": "TO US 공식 MD",
          "sub": "Weverse Shop · 2026.11.02 11:00 판매 시작 · 한정 수량, 재고 확인",
          "href": "https://shop.weverse.io/en/shop/MXN/artists/165/notices/14782"
        },
        {
          "title": "KYUNGMIN'S FAVORITE BOX",
          "sub": "Weverse Shop · 포토북·포토카드·키링 구성 · 확인 시 품절, 재입고 여부는 판매처 확인",
          "href": "https://shop.weverse.io/en/shop/MXN/artists/165/sales/68020"
        }
      ],
      campaigns: [],
      accent: '#76a8d7', light: '#e0efff', dark: '#456a91', bg: '#f6fbff', shape: '✦'
    },
    {
      id: 'nctdream', name: 'NCT DREAM', korean: '엔시티 드림', category: 'boy', fan: 'NCTzen', agency: 'SM Entertainment',
      members: ['런쥔', '제노', '해찬', '재민', '천러', '지성'],
      debut: '2016.08.25', debutWork: 'Chewing Gum', songs: ['Chewing Gum'],
      concept: '성장을 노래하는 NCT의 여섯 멤버 유닛.',
      official: 'https://www.smentertainment.com/', youtube: 'https://www.youtube.com/@NCTDREAM',
      photo: 'NCT Dream at DREAM()SCAPE Press Conference.png', photoLabel: 'DREAM()SCAPE 기자회견 · 당시 사진', photoYear: '2024', credit: 'K-POPIT 케이팝잇', license: 'CC BY 3.0',
      checkedAt: '2026.11.13',
      music: [
        {
          "title": "DREAM AFTER DREAM",
          "date": "2026.11.09",
          "type": "정규 6집 · 타이틀 Boogie Woogie",
          "songs": [
            "The Sun",
            "Boogie Woogie",
            "Dream After Dream",
            "Skydive",
            "Pressure",
            "Watch U Watch Me",
            "Cool for Me",
            "Tumbler",
            "Smile for U",
            "This Is Your World"
          ],
          "href": "https://music.apple.com/us/album/dream-after-dream/6827483714"
        },
        {
          "title": "Chewing Gum",
          "date": "2016.08.27",
          "type": "데뷔 디지털 싱글 · 유통사 표시 발매일",
          "songs": [
            "Chewing Gum",
            "Chewing Gum (Chinese Version)"
          ],
          "href": "https://music.apple.com/us/album/chewing-gum-single/1147458439"
        }
      ],
      appearances: [
        {
          "date": "2026-11-14",
          "title": "MMA 2026 Global Day 출연",
          "sub": "서울 고척스카이돔 · 카카오엔터테인먼트 · 개별 출연 시각은 공식 안내 확인",
          "href": "https://newsroom.kakaoent.com/news/mma2026-welcomes-more-k-pop-heavyweights/"
        },
        {
          "date": "2026-11-08",
          "endDate": "2026-11-16",
          "title": "WELCOME, DREAMERS 팝업 (11/8~11/16)",
          "sub": "매일 12:00~20:00 KST · 서울 성동구 연무장7길16 · 방문·입장 안내는 공식 공지 확인",
          "href": "https://weverse.io/nctdream/notice/40609"
        },
        {
          "date": "2026-11-22",
          "title": "TV아사히 드림페스티벌 헤드라이너 출연",
          "sub": "K아레나 요코하마 · 전일정 매진(11/11 공식 공지) · 개별 출연 시각 미공개",
          "href": "https://dreamfestival.jp/"
        },
        {
          "date": "2026-12-07",
          "title": "DREAM AFTER DREAM 일본 발매 이벤트 · 도쿄",
          "sub": "도쿄 시내 · 시간·상세 장소는 당첨자 추후 안내 · 2차 응모 11/23 23:59 JST까지 · 조건은 공식 공지 확인",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137067"
        },
        {
          "date": "2026-12-09",
          "title": "2026 FNS 가요제 제2야 출연",
          "sub": "후지TV 계열 · 전체 방송 18:30~21:54 JST/KST · 개별 출연 시각 미공개",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137066"
        },
        {
          "date": "2026-12-27",
          "title": "DREAM AFTER DREAM 일본 발매 이벤트 · 교토",
          "sub": "교토 시내 · 시간·상세 장소는 당첨자 추후 안내 · 2차 응모 11/23 23:59 JST까지 · 조건은 공식 공지 확인",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137067"
        }
      ],
      news: [
        {
          "date": "2026.11.09",
          "tag": "컴백",
          "title": "정규 6집 DREAM AFTER DREAM 발매 · 타이틀 Boogie Woogie",
          "href": "https://nct-jp.net/news/detail.php?id=1137002"
        },
        {
          "date": "2026.11.09",
          "tag": "음원 이벤트",
          "title": "LINE MUSIC · iTunes · Spotify 공식 발매 기념 캠페인",
          "href": "https://nct-jp.net/news/detail.php?id=1137002"
        },
        {
          "date": "2026.11.03",
          "tag": "방송",
          "title": "12.09 일본 FNS 가요제 제2야 생방송 출연 발표",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137066"
        },
        {
          "date": "2026.09.10",
          "tag": "공연",
          "title": "11.22 TV아사히 드림 페스티벌 출연 발표",
          "href": "https://nct-jp.net/en/news/detail.php?id=1135918"
        }
      ],
      merch: [
        {
          "title": "DREAM AFTER DREAM 정규 6집",
          "sub": "Weverse Shop 공식 음반 · 기존 예약판매는 11/8 종료 · 현재 판매·재고는 판매처 확인",
          "href": "https://shop.weverse.io/ko/shop/USD/artists/131/notices/14634"
        },
        {
          "title": "DREAM AFTER DREAM 일본 한정 주얼케이스",
          "sub": "mu-mo SHOP · 일본판 포토카드 · 추첨 응모 11.23까지",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137067"
        },
        {
          "title": "NCT DREAM 공식 굿즈",
          "sub": "SMTOWN GLOBAL SHOP · 판매 여부·가격은 판매처에서 확인",
          "href": "https://global.shop.smtown.com/collections/nct-dream"
        }
      ],
      campaigns: [
        {
          "kind": "콜라보",
          "date": "2026.11.09",
          "title": "LINE MUSIC × NCT DREAM",
          "sub": "Boogie Woogie 스트리밍 캠페인 · 일본 공식 발표 · 재생 11/15 23:59까지 · 신청 11/16~22 JST",
          "href": "https://nct-jp.net/news/detail.php?id=1137003"
        },
        {
          "kind": "콜라보",
          "date": "2026.11.09",
          "title": "iTunes × NCT DREAM",
          "sub": "DREAM AFTER DREAM 다운로드 이벤트 · 일본 공식 발표 · 구매·신청 11/15 23:59까지 JST",
          "href": "https://nct-jp.net/news/detail.php?id=1137004"
        },
        {
          "kind": "콜라보",
          "date": "2026.11.09",
          "title": "Spotify × NCT DREAM",
          "sub": "Boogie Woogie Canvas 공유 캠페인 · 일본 공식 발표 · 공유 11/15 23:59까지 · 신청 11/18까지 JST",
          "href": "https://nct-jp.net/news/detail.php?id=1137005"
        }
      ],
      accent: '#67b956', light: '#e6fbdc', dark: '#416e37', bg: '#f5fff1', shape: '☘'
    },
    {
      id: 'ateez', name: 'ATEEZ', korean: '에이티즈', category: 'boy', fan: 'ATINY', agency: 'KQ Entertainment',
      members: ['홍중', '성화', '윤호', '여상', '산', '민기', '우영', '종호'],
      debut: '2018.10.24', debutWork: 'TREASURE EP.1 : All To Zero', songs: ['해적왕 (Pirate King)', 'Treasure'],
      concept: '2018년 해적왕으로 데뷔한 8인조. GOLDEN HOUR 음반과 세계 투어로 활동 중.',
      official: 'https://ateez.kqent.com/', youtube: 'https://www.youtube.com/@ATEEZofficial',
      photo: 'ATEEZ in August 2024 (cropped).jpg', photoLabel: '2024년 단체', photoYear: '2024', credit: 'pinkllamanade', license: 'CC BY-SA 2.0',
      morePhotos: [
        commonsPhoto('260228 ATEEZ Choi San @ Dolce & Gabbana FW 26.27 Show in Milan.jpg', '산 · 밀라노 패션위크', '2026', 'sublimitas viii · Flickr 원작 · Commons FlickreviewR 확인 · 크롭본', 'CC BY-SA 4.0')
      ],
      checkedAt: '2026.11.13',
      music: [
        {
          "title": "GOLDEN HOUR : Part.6",
          "date": "2026.11.13",
          "type": "미니 15집 · 11.13 14:00 발매 예정 · 타이틀 UP",
          "songs": [
            "ANEMIA",
            "DRIP",
            "UP",
            "FAITH",
            "Hollow Victory"
          ],
          "href": "https://ateez.kqent.com/en/contents/6ade0ef2ba711e7b9ec3e59c"
        },
        {
          "title": "GOLDEN HOUR : Part.5",
          "date": "2026.06.26",
          "type": "미니 14집 · 타이틀 BAD",
          "songs": [
            "BAD",
            "MAMACITA",
            "TOXIN",
            "Fallin'",
            "Body"
          ],
          "href": "https://ateez-official.jp/musics/20862"
        },
        {
          "title": "GOLDEN HOUR : Part.4",
          "date": "2026.02.06",
          "type": "미니 13집 · 타이틀 Adrenaline",
          "songs": [
            "Ghost",
            "Adrenaline",
            "NASA",
            "On the Road",
            "Choose"
          ],
          "href": "https://music.apple.com/us/album/golden-hour-part-4-ep/1867153027"
        },
        {
          "title": "TREASURE EP.1 : All To Zero",
          "date": "2018.10.24",
          "type": "데뷔 EP · 타이틀 해적왕",
          "songs": [
            "Intro : Long Journey",
            "해적왕 (Pirate King)",
            "Treasure",
            "Twilight",
            "Stay",
            "My Way"
          ],
          "href": "https://ateez-official.jp/musics/7674"
        }
      ],
      appearances: [
        {
          "date": "2026-11-14",
          "title": "MMA 2026 Global Day 출연",
          "sub": "서울 고척스카이돔 · 카카오엔터테인먼트 · 개별 출연 시각은 공식 안내 확인",
          "href": "https://newsroom.kakaoent.com/news/mma2026-welcomes-more-k-pop-heavyweights/"
        },
        {
          "date": "2026-11-13",
          "title": "GOLDEN HOUR : Part.6 발매 예정",
          "sub": "14:00 KST · 타이틀 UP · KQ 공식 발표",
          "href": "https://ateez.kqent.com/en/contents/6ade0ef2ba711e7b9ec3e59c"
        },
        {
          "date": "2026-11-13",
          "title": "KBS2 뮤직뱅크 출연",
          "sub": "사전녹화 08:45 / 생방송 17:10 KST · KBS 신관 공개홀 · 방청 신청 종료, 선정 참가자 대상 · 집합 안내는 공식 공지 확인",
          "href": "https://ateez.kqent.com/surveys/6af41182a993a556cdd4e773"
        },
        {
          "date": "2026-11-14",
          "title": "MBC 쇼! 음악중심 사전녹화",
          "sub": "05:30 KST · 상암 MBC 신사옥 공개홀 · 방청 신청 종료, 선정 참가자 대상 · 집합 안내는 공식 공지 확인",
          "href": "https://ateez.kqent.com/surveys/6af55eeab2aee70bd8ed5ff5"
        },
        {
          "date": "2027-01-22",
          "title": "ZERO TO ALL 인천 월드투어",
          "sub": "19:00 · 인천 인스파이어 NAVER ARENA KST · 예매·변경은 공식 공지 확인",
          "href": "https://ateez.kqent.com/contents/6ae94a808d38027a8d6b8b65"
        },
        {
          "date": "2027-01-23",
          "title": "ZERO TO ALL 인천 월드투어",
          "sub": "17:00 · 인천 인스파이어 NAVER ARENA KST · 예매·변경은 공식 공지 확인",
          "href": "https://ateez.kqent.com/contents/6ae94a808d38027a8d6b8b65"
        },
        {
          "date": "2027-01-24",
          "title": "ZERO TO ALL 인천 월드투어",
          "sub": "16:00 · 인천 인스파이어 NAVER ARENA KST · 예매·변경은 공식 공지 확인",
          "href": "https://ateez.kqent.com/contents/6ae94a808d38027a8d6b8b65"
        },
        {
          "date": "2027-02-02",
          "title": "ZERO TO ALL 도쿄 공연",
          "sub": "18:30 · 국립 요요기 경기장 제1체육관 JST/KST · 예매·변경은 공식 공지 확인",
          "href": "https://ateez-official.jp/contents/1123026"
        },
        {
          "date": "2027-02-03",
          "title": "ZERO TO ALL 도쿄 공연",
          "sub": "18:30 · 국립 요요기 경기장 제1체육관 JST/KST · 예매·변경은 공식 공지 확인",
          "href": "https://ateez-official.jp/contents/1123026"
        },
        {
          "date": "2027-02-13",
          "title": "ZERO TO ALL 고베 공연",
          "sub": "17:30 · GLION ARENA KOBE JST/KST · 예매·변경은 공식 공지 확인",
          "href": "https://ateez-official.jp/contents/1123026"
        },
        {
          "date": "2027-02-14",
          "title": "ZERO TO ALL 고베 공연",
          "sub": "15:30 · GLION ARENA KOBE JST/KST · 예매·변경은 공식 공지 확인",
          "href": "https://ateez-official.jp/contents/1123026"
        },
        {
          "date": "2027-03-31",
          "title": "ZERO TO ALL 런던 공연",
          "sub": "영국 런던 · KQ 공식 일정 · 공연장·시간 추후 공지",
          "href": "https://ateez.kqent.com/en/contents/6ac915ceb899027df4664814"
        },
        {
          "date": "2027-04-04",
          "title": "ZERO TO ALL 리옹 공연",
          "sub": "프랑스 리옹 · KQ 공식 일정 · 공연장·시간 추후 공지",
          "href": "https://ateez.kqent.com/en/contents/6ac915ceb899027df4664814"
        },
        {
          "date": "2027-04-07",
          "title": "ZERO TO ALL 베를린 공연",
          "sub": "독일 베를린 · KQ 공식 일정 · 공연장·시간 추후 공지",
          "href": "https://ateez.kqent.com/en/contents/6ac915ceb899027df4664814"
        },
        {
          "date": "2027-04-10",
          "title": "ZERO TO ALL 크라쿠프 공연",
          "sub": "폴란드 크라쿠프 · KQ 공식 일정 · 공연장·시간 추후 공지",
          "href": "https://ateez.kqent.com/en/contents/6ac915ceb899027df4664814"
        },
        {
          "date": "2027-04-12",
          "title": "ZERO TO ALL 암스테르담 공연",
          "sub": "네덜란드 암스테르담 · KQ 공식 일정 · 공연장·시간 추후 공지",
          "href": "https://ateez.kqent.com/en/contents/6ac915ceb899027df4664814"
        },
        {
          "date": "2027-04-15",
          "title": "ZERO TO ALL 쾰른 공연",
          "sub": "독일 쾰른 · KQ 공식 일정 · 공연장·시간 추후 공지",
          "href": "https://ateez.kqent.com/en/contents/6ac915ceb899027df4664814"
        },
        {
          "date": "2027-04-17",
          "title": "ZERO TO ALL 앤트워프 공연",
          "sub": "벨기에 앤트워프 · KQ 공식 일정 · 공연장·시간 추후 공지",
          "href": "https://ateez.kqent.com/en/contents/6ac915ceb899027df4664814"
        }
      ],
      schedules: [
        { title: 'ATEEZ 일본 공식 일정', sub: '방송·행사·음반·공연 일정', href: 'https://ateez-official.jp/vertical_calendar' },
        { title: 'KQ 공식 일정·소식', sub: '한국 공개방송·공연·일정 변경', href: 'https://ateez.kqent.com/contents' }
      ],
      news: [
        {
          "date": "2026.11.12",
          "tag": "영상",
          "title": "UP 공식 뮤직비디오 티저 2 공개",
          "href": "https://ateez.kqent.com/contents/6af51f7c6737d57ef90dd839"
        },
        {
          "date": "2026.11.11",
          "tag": "방송",
          "title": "11.13 뮤직뱅크 사전녹화·생방송 참가 공지",
          "href": "https://ateez.kqent.com/surveys/6af41182a993a556cdd4e773"
        },
        {
          "date": "2026.11.03",
          "tag": "공연",
          "title": "2027 ZERO TO ALL 인천 3회 공연·예매 공지",
          "href": "https://ateez.kqent.com/contents/6ae94a808d38027a8d6b8b65"
        },
        {
          "date": "2026.10.25",
          "tag": "컴백",
          "title": "미니 15집 Part.6 트랙리스트 발표 · 11.13 정식 발매 예정",
          "href": "https://ateez.kqent.com/en/contents/6ade0ef2ba711e7b9ec3e59c"
        }
      ],
      merch: [
        {
          "title": "GOLDEN HOUR : Part.6 공식 음반 3종 세트",
          "sub": "KQ TOKTOQ 공식 음반 · 11/13 발매 예정 · 현재 판매 조건·재고는 판매처 확인",
          "href": "https://ateez.kqent.com/shop/products/243"
        },
        {
          "title": "GOLDEN HOUR : Part.6 일본 정식 수입반",
          "sub": "UNIVERSAL MUSIC JAPAN · A/DIARY/Z · 일본 11.18 발매 예정",
          "href": "https://www.universal-music.co.jp/ateez/news/2026-10-13/"
        },
        {
          "title": "ATEEZ SPECIAL VOICE CARD",
          "sub": "WOWOW × CoDaMa 공식 음성 카드 · 8.04 출시 · 판매 상태 별도 확인",
          "href": "https://prtimes.jp/main/html/rd/p/000008858.000001355.html"
        }
      ],
      campaigns: [
        {
          "kind": "콜라보",
          "date": "2026.09.15",
          "title": "ATEEZ × LINE FRIENDS MIGHTEEZ",
          "sub": "Rock The Stage 3차 팝업 · 시부야 9/18~27 행사 종료 · 공식 협업 기록",
          "href": "https://prtimes.jp/main/html/rd/p/000000129.000040759.html"
        },
        {
          "kind": "홍보대사",
          "date": "2026.08.27",
          "title": "스튜디오 톰보이 × 우영",
          "sub": "신세계인터내셔날 첫 글로벌 앰버서더 · 멤버 개인 활동",
          "href": "https://www.shinsegaegroupnewsroom.com/studio-tomboy-global-ambassador-ateez-wooyoung/"
        },
        {
          "kind": "콜라보",
          "date": "2026.07.21",
          "title": "ATEEZ × WOWOW × CoDaMa",
          "sub": "팬미팅 기념 NFC 음성 카드 공동 제작 · 8.04 출시",
          "href": "https://prtimes.jp/main/html/rd/p/000008858.000001355.html"
        }
      ],
      accent: '#d7af68', light: '#4f422a', dark: '#fff2d5', bg: '#171e2c', night: true, shape: '✶'
    },
    {
      id: 'treasure', name: 'TREASURE', korean: '트레저', category: 'boy', fan: 'TREASURE MAKER', agency: 'YG Entertainment',
      members: ['최현석', '지훈', '요시', '준규', '윤재혁', '아사히', '도영', '하루토', '박정우', '소정환'],
      debut: '2020.08.07', debutWork: 'THE FIRST STEP : CHAPTER ONE', songs: ['BOY', '들어와 (COME TO ME)'],
      concept: '2020년 8월 BOY로 데뷔한 YG의 10인조 그룹. 2026년 NEW WAV와 SHOCK에서 힙합 사운드를 선보였다.',
      official: 'https://ygfamily.com/ko/artists/treasure/profile', youtube: 'https://www.youtube.com/@TREASURE',
      checkedAt: '2026.11.13',
      photo: '240405 트레저 TTA Malaysia 1st Place.jpg', photoLabel: '2024년 단체', photoYear: '2024', credit: 'K-POPIT 케이팝잇', license: 'CC BY 3.0',
      morePhotos: [
        commonsPhoto('230428 TREASURE(트레저) Yoshi ICN.jpg', '요시 · 인천공항', '2023', 'K-POPIT 케이팝잇 (TENASIA)', 'CC BY 3.0'),
        commonsPhoto('230707 TREASURE(트레저) Junghwan(정환) ICN.jpg', '소정환 · 인천공항', '2023', 'K-POPIT 케이팝잇 (TENASIA)', 'CC BY 3.0')
      ],
      music: [
        {
          "title": "SHOCK",
          "date": "2026.11.02",
          "type": "디지털 싱글 · 타이틀 SHOCK",
          "songs": [
            "SHOCK"
          ],
          "href": "https://www.ygfamily.com/en/artists/treasure/discography/1676"
        },
        {
          "title": "NEW WAV",
          "date": "2026.06.01",
          "type": "미니 4집 · 타이틀 IF I",
          "songs": [
            "IF I",
            "ZOOM ZOOM",
            "NALLY-NA (HYUNHAYO)",
            "DANGER"
          ],
          "href": "https://www.ygfamily.com/en/artists/treasure/discography/1660"
        },
        {
          "title": "LOVE PULSE",
          "date": "2025.09.01",
          "type": "미니 3집 · 타이틀 PARADISE",
          "songs": [
            "EVERYTHING",
            "PARADISE",
            "NOW FOREVER",
            "BETTER THAN ME"
          ],
          "href": "https://ygfamily.com/en/artists/treasure/discography/1640"
        }
      ],
      appearances: [
        {
          "date": "2026-11-14",
          "title": "MBC 쇼! 음악중심 출연",
          "sub": "15:20 KST 방송 일정 · YG 공식 달력 · 개별 무대·사전녹화·방청 안내는 별도 공지 확인",
          "href": "https://ygfamily.com/ko/artists/treasure/schedule"
        },
        {
          "date": "2026-11-20",
          "title": "2026 MAMA AWARDS 출연",
          "sub": "공식 일정 18:00 JST/KST · 일본 교세라 돔 오사카 · 개별 무대 시각은 별도 안내 확인",
          "href": "https://ygfamily.com/ko/artists/treasure/schedule"
        }
      ],
      schedules: [
        { title: 'YG 공식 TREASURE 일정', sub: '방송·시상식·공식 일정 변경 확인', href: 'https://ygfamily.com/ko/artists/treasure/schedule' },
        { title: 'YG 공식 공연 안내', sub: 'TREASURE 콘서트·팬콘 공식 안내', href: 'https://www.ygfamily.com/en/artists/treasure/concert' }
      ],
      news: [
        {
          "date": "2026.11.02",
          "tag": "컴백",
          "title": "디지털 싱글 SHOCK 발매 · 공식 트랙·크레딧 공개",
          "href": "https://www.ygfamily.com/en/artists/treasure/discography/1676"
        },
        {
          "date": "2026.06.01",
          "tag": "음악",
          "title": "미니 4집 NEW WAV 발매 · IF I 포함 4곡",
          "href": "https://www.ygfamily.com/en/artists/treasure/discography/1660"
        }
      ],
      merch: [
        {
          "title": "SHOCK 공식 MD",
          "sub": "YG SELECT · 포토카드 홀더·키링 등 · 판매·재고는 공식몰 확인 · 일부 품절, 현재 재고 확인",
          "href": "https://www.ygselect.com/product/list.html?cate_no=1426"
        },
        {
          "title": "TREASURE20FW 공식 의류",
          "sub": "YG SELECT · 체크 셔츠 등 2026 가을·겨울 MD · 일부 품절, 현재 재고 확인",
          "href": "https://www.ygselect.com/product/list.html?cate_no=1398"
        },
        {
          "title": "TREASURE 6주년 공식 MD",
          "sub": "YG SELECT · 기념 브릭 세트·굿즈 · 재고는 판매처 확인 · 일부 품절, 현재 재고 확인",
          "href": "https://www.ygselect.com/product/list.html?cate_no=1410"
        }
      ],
      campaigns: [
        {
          "kind": "콜라보",
          "date": "2026.09.07",
          "title": "Reebok × AZUL BY MOUSSY × TREASURE",
          "sub": "일본 가을 컬렉션 비주얼 · 9.16 매장 발매",
          "href": "https://prtimes.jp/main/html/rd/p/000001201.000014511.html"
        }
      ],
      accent: '#478dce', light: '#dff3ff', dark: '#28577e', bg: '#f1f9ff', shape: '◆'
    },
    {
      id: 'nctwish', name: 'NCT WISH', korean: '엔시티 위시', category: 'boy', fan: 'NCTzen', agency: 'SM Entertainment',
      members: ['시온', '리쿠', '유우시', '재희', '료', '사쿠야'],
      debut: '2024.02.21', debutWork: 'WISH', songs: ['WISH'],
      checkedAt: '2026.11.13',
      concept: '밝은 에너지로 소원을 전하는 NCT의 여섯 멤버 유닛.',
      official: 'https://www.nct-jp.net/', youtube: 'https://www.youtube.com/@NCTWISH',
      photo: '2026 NCT WISH promotion 01.jpg', photoLabel: '2026년 단체', photoYear: '2026', credit: 'numbuzin', license: 'CC BY 4.0',
      morePhotos: [
        commonsPhoto('2026 NCT WISH promotion 03.jpg', '넘버즈인 1주년 인사 영상 · 2026.02.26', '2026', 'numbuzin', 'CC BY 4.0')
      ],
      music: [
        {
          "title": "I SPY",
          "date": "2026.10.12",
          "type": "미니 4집 · 타이틀 I SPY",
          "songs": [
            "I SPY",
            "We Own This Street",
            "UPGRADE",
            "Super Major",
            "Hubble Time",
            "꿈결 (Like A Dream)"
          ],
          "href": "https://en.smtownandstore.com/product/nct-wish-the-4th-mini-album-i-spy-disc-pack-ver/29342/category/646/display/1/"
        },
        {
          "title": "Ode to Love",
          "date": "2026.04.20",
          "type": "한국 정규 1집 · 타이틀 Ode to Love",
          "songs": [
            "2.0 (TWO POINT O)",
            "Ode to Love",
            "Sticky",
            "Feel The Beat",
            "Crush",
            "Street (2AM)",
            "Glow Up",
            "Everglow",
            "Don't Say You Love Me",
            "Voyage"
          ],
          "href": "https://music.apple.com/us/album/ode-to-love-the-1st-album/1891040424"
        },
        {
          "title": "WISHLIST",
          "date": "2026.01.14",
          "type": "일본 미니 1집 · 리드곡 Hello Mellow",
          "songs": [
            "Hello Mellow",
            "ZONE",
            "BUBBLE GUM",
            "Dreamcatcher",
            "SOMEDAY",
            "Good Morning",
            "poppop (Japanese Ver.)"
          ],
          "href": "https://avexnet.jp/news/1030412"
        },
        {
          "title": "WISH",
          "date": "2024.02.28",
          "type": "일본 데뷔 싱글",
          "songs": [
            "WISH (Japanese ver.)",
            "Sail Away (Japanese ver.)"
          ],
          "href": "https://nct-jp.net/en/discography/detail.php?id=1020182"
        }
      ],
      appearances: [
        {
          "date": "2026-11-23",
          "title": "TV아사히 드림페스티벌 출연",
          "sub": "K아레나 요코하마 · 13:30 입장 / 15:00 개연 예정 JST/KST · 전일정 매진 · 개별 출연 시각 미공개",
          "href": "https://nct-jp.net/ja/news/detail.php?id=1135596"
        },
        {
          "date": "2026-12-06",
          "title": "I SPY 일본 발매 이벤트 · 오사카",
          "sub": "오사카 근교 · 시간·상세 장소는 당첨자 추후 안내 · 시리얼 추첨 응모 11/15 23:59 JST까지 · 구매·응모 조건은 공식 공지 확인",
          "href": "https://www.nct-jp.net/news/detail.php?id=1136642"
        },
        {
          "date": "2027-01-15",
          "title": "INTO THE WISH : Face Our WISH 서울 1일차",
          "sub": "서울 고척스카이돔 · 18:00 (KST) · 멜론티켓 공식 예매",
          "href": "https://weverse.io/nctwish/notice/40058"
        },
        {
          "date": "2027-01-16",
          "title": "INTO THE WISH : Face Our WISH 서울 2일차",
          "sub": "서울 고척스카이돔 · 17:00 (KST) · 멜론티켓 공식 예매",
          "href": "https://weverse.io/nctwish/notice/40058"
        },
        {
          "date": "2027-02-26",
          "title": "INTO THE WISH 일본 도쿄 1일차",
          "sub": "요요기 국립경기장 제1체육관 · 18:30 (JST)",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137082"
        },
        {
          "date": "2027-02-27",
          "title": "INTO THE WISH 일본 도쿄 2일차",
          "sub": "요요기 국립경기장 제1체육관 · 17:00 (JST)",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137082"
        },
        {
          "date": "2027-02-28",
          "title": "INTO THE WISH 일본 도쿄 3일차",
          "sub": "요요기 국립경기장 제1체육관 · 16:00 (JST)",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137082"
        },
        {
          "date": "2027-03-05",
          "title": "INTO THE WISH 일본 고베 1일차",
          "sub": "GLION ARENA KOBE · 18:30 (JST)",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137082"
        },
        {
          "date": "2027-03-06",
          "title": "INTO THE WISH 일본 고베 2일차",
          "sub": "GLION ARENA KOBE · 17:00 (JST)",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137082"
        },
        {
          "date": "2027-03-07",
          "title": "INTO THE WISH 일본 고베 3일차",
          "sub": "GLION ARENA KOBE · 16:00 (JST)",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137082"
        },
        {
          "date": "2027-03-13",
          "title": "INTO THE WISH 일본 후쿠오카 1일차",
          "sub": "기타큐슈 메세 · 17:00 (JST)",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137082"
        },
        {
          "date": "2027-03-14",
          "title": "INTO THE WISH 일본 후쿠오카 2일차",
          "sub": "기타큐슈 메세 · 16:00 (JST)",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137082"
        },
        {
          "date": "2027-03-21",
          "title": "INTO THE WISH 일본 아이치 1일차",
          "sub": "포트메세 나고야 제1전시관 · 17:00 (JST)",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137082"
        },
        {
          "date": "2027-03-22",
          "title": "INTO THE WISH 일본 아이치 2일차",
          "sub": "포트메세 나고야 제1전시관 · 16:00 (JST)",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137082"
        }
      ],
      schedules: [
        { title: 'NCT 일본 공식 뉴스·공연 안내', sub: 'NCT WISH 일본 아레나 투어·팬 이벤트·변경 소식', href: 'https://www.nct-jp.net/news/' },
        { title: 'NCT WISH 공식 공지', sub: 'Weverse · 로그인·커뮤니티 가입 후 한국 공연·팬 행사 및 예매 확인', href: 'https://weverse.io/nctwish/notice' }
      ],
      news: [
        {
          "date": "2026.11.04",
          "tag": "공연",
          "title": "2027 일본 전국 아레나 투어 10회 · 선예매 11.16까지",
          "href": "https://www.nct-jp.net/news/detail.php?id=1137082"
        },
        {
          "date": "2026.10.31",
          "tag": "팬 행사",
          "title": "I SPY 일본 오사카 발매 행사 12.6 확정",
          "href": "https://www.nct-jp.net/news/detail.php?id=1136642"
        },
        {
          "date": "2026.10.12",
          "tag": "음악",
          "title": "미니 4집 I SPY 발매 · 6곡 수록",
          "href": "https://smtownandstore.com/product/nct-wish-the-4th-mini-album-i-spy-deluxe-book-ver/29341/category/53/display/1/"
        }
      ],
      merch: [
        {
          "title": "I SPY 미니 4집 Deluxe Book Ver.",
          "sub": "SMTOWN &STORE · 포토북·포토카드 · 재고와 가격은 판매처 확인",
          "href": "https://smtownandstore.com/product/nct-wish-the-4th-mini-album-i-spy-deluxe-book-ver/29341/category/53/display/1/"
        },
        {
          "title": "I SPY 일본 한정반·특전",
          "sub": "avex 공식 · 타워레코드·HMV·위버스 특전 안내 · 기간/대상 품목 확인",
          "href": "https://www.nct-jp.net/news/detail.php?id=1136642"
        },
        {
          "title": "WISHLIST 일본 공식 음반",
          "sub": "avex trax · 한정 패키지·특전 · 재고 확인",
          "href": "https://avexnet.jp/release/1021226"
        }
      ],
      campaigns: [
        {
          "kind": "콜라보",
          "date": "2026.03.19",
          "title": "WEGO 2026 SPRING × NCT WISH",
          "sub": "일본 패션 브랜드 비주얼 모델·협업 상품 · 3/16 발표, 3/19 캠페인 시작",
          "href": "https://prtimes.jp/main/html/rd/p/000000155.000057274.html"
        }
      ],
      accent: '#87b340', light: '#ecffd9', dark: '#567535', bg: '#f7ffef', shape: '☆'
    },
    {
      "id": "andteam",
      "name": "&TEAM",
      "korean": "앤팀",
      "category": "boy",
      "fan": "LUNÉ",
      "agency": "YX LABELS",
      "members": [
        "의주",
        "후마",
        "케이",
        "니콜라스",
        "유마",
        "조",
        "하루아",
        "타키",
        "마키"
      ],
      "debut": "2022.12.07",
      "debutWork": "First Howling : ME",
      "songs": [
        "Under the skin",
        "Scent of you"
      ],
      "checkedAt": '2026.11.13',
      "concept": "다른 개성을 지닌 아홉 멤버가 음악과 무대로 하나가 되는 팀.",
      "official": "https://www.andteam-official.jp/",
      "youtube": "https://www.youtube.com/@andTEAM_official",
      "photo": "&TEAM ATA promotion 02.jpg",
      "photoLabel": "ATA 활동",
      "photoYear": "2026",
      "credit": "K-POPIT 케이팝잇",
      "license": "CC BY 4.0",
      morePhotos: [commonsPhoto('241002 &Team (1).jpg', '2024년 단체 사진', '2024', 'nacco', 'CC BY 3.0')],
      music: [
        {
          "title": "Fearless",
          "date": "2026.10.10",
          "type": "디지털 싱글",
          "songs": [
            "Fearless"
          ],
          "href": "https://www.andteam-official.jp/discography/674dcde69452"
        },
        {
          "title": "Mark on Me",
          "date": "2026.09.08",
          "type": "한국 미니 2집 · 한국 발매일",
          "songs": [
            "Mark on Me",
            "Good Boy",
            "Love Jang",
            "Accelerate",
            "Empty",
            "Night to howl!"
          ],
          "href": "https://www.andteam-official.jp/discography/1affd625347f"
        },
        {
          "title": "We on Fire",
          "date": "2026.04.21",
          "type": "일본 EP · 타이틀 We on Fire",
          "songs": [
            "We on Fire",
            "Bewitched",
            "ホットライン",
            "桜色Yell",
            "We on Fire (Korean ver.)",
            "Bewitched (Korean ver.)"
          ],
          "href": "https://www.andteam-official.jp/discography/7f97d047e0d5"
        },
        {
          "title": "Back to Life",
          "date": "2025.10.28",
          "type": "한국 미니 1집 · 타이틀 Back to Life",
          "songs": [
            "Back to Life",
            "Lunatic",
            "MISMATCH",
            "Rush",
            "Heartbreak Time Machine",
            "Who am I"
          ],
          "href": "https://www.andteam-official.jp/discography/cpbxev"
        },
        {
          "title": "First Howling : ME",
          "date": "2022.12.07",
          "type": "데뷔 EP · 타이틀 Under the skin",
          "songs": [
            "Under the skin",
            "Scent of you",
            "バズ恋 (BUZZ LOVE)",
            "The Final Countdown (&TEAM ver.)"
          ],
          "href": "https://www.andteam-official.jp/news/owsyjh"
        }
      ],
      appearances: [
        {
          "date": "2026-11-18",
          "title": "Mark on You 홀 투어 · 오사카",
          "sub": "그랑큐브 오사카 · 17:00 입장 / 18:00 개연 JST/KST · 예매·변경 사항은 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2026-11-18",
          "title": "JO·TAKI 후지TV ホンマでっか!?TV 출연",
          "sub": "21:00~21:54 JST/KST 방송 · JO·TAKI 출연",
          "href": "https://www.andteam-official.jp/news/a84de8968609"
        },
        {
          "date": "2026-11-18",
          "endDate": "2026-11-19",
          "title": "JO·TAKI·MAKI TBS よるのブランチ 출연",
          "sub": "11/18 23:56~11/19 00:55 JST/KST 방송 · JO·TAKI·MAKI 출연",
          "href": "https://www.andteam-official.jp/news/2c290411ba85"
        },
        {
          "date": "2026-11-19",
          "title": "Mark on You 홀 투어 · 오사카",
          "sub": "그랑큐브 오사카 · 17:00 입장 / 18:00 개연 JST/KST · 예매·변경 사항은 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2026-11-27",
          "title": "Mark on You 홀 투어 · 히로시마",
          "sub": "히로시마 문화학원 HBG홀 · 17:30 입장 / 18:30 개연 JST/KST · 예매·변경 사항은 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2026-12-10",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 후쿠오카 선팔레스 · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2026-12-11",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 후쿠오카 선팔레스 · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2026-12-15",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 이시카와 혼다노모리 호쿠덴홀 · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2026-12-16",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 이시카와 혼다노모리 호쿠덴홀 · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2026-12-19",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 에히메 마쓰야마 시민회관 · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2026-12-20",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 에히메 마쓰야마 시민회관 · 17:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2026-12-27",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 홋카이도 삿포로 문화예술극장 hitaru · 17:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2027-01-05",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 구마모토성 홀 · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2027-01-06",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 구마모토성 홀 · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2027-01-10",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 미야기 센다이 선플라자홀 · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2027-01-11",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 미야기 센다이 선플라자홀 · 17:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2027-01-15",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 니가타 현민회관 · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2027-01-16",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 니가타 현민회관 · 17:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2027-01-19",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 오사카 그랑큐브 오사카 · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2027-01-20",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 오사카 그랑큐브 오사카 · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2027-01-22",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 오카야마 구라시키 시민회관 · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2027-01-23",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 오카야마 구라시키 시민회관 · 17:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2027-01-28",
          "title": "&TEAM Mark on You · 홀 투어",
          "sub": "일본 오키나와 컨벤션센터 극장동 · 18:30 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/021ab1de6a61"
        },
        {
          "date": "2027-02-03",
          "title": "&TEAM Mark on You · 아레나 투어",
          "sub": "일본 효고 GLION ARENA KOBE · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/dd0f71998bc8"
        },
        {
          "date": "2027-02-04",
          "title": "&TEAM Mark on You · 아레나 투어",
          "sub": "일본 효고 GLION ARENA KOBE · 17:30 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/dd0f71998bc8"
        },
        {
          "date": "2027-02-06",
          "title": "&TEAM Mark on You · 아레나 투어",
          "sub": "일본 아이치 IG Arena · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/dd0f71998bc8"
        },
        {
          "date": "2027-02-07",
          "title": "&TEAM Mark on You · 아레나 투어",
          "sub": "일본 아이치 IG Arena · 16:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/dd0f71998bc8"
        },
        {
          "date": "2027-02-13",
          "title": "&TEAM Mark on You · 아레나 투어",
          "sub": "일본 가나가와 피아 아레나 MM · 17:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/dd0f71998bc8"
        },
        {
          "date": "2027-02-14",
          "title": "&TEAM Mark on You · 아레나 투어",
          "sub": "일본 가나가와 피아 아레나 MM · 16:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/dd0f71998bc8"
        },
        {
          "date": "2027-02-27",
          "title": "&TEAM Mark on You · 아레나 투어",
          "sub": "일본 가가와 아나부키 아레나 · 17:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/dd0f71998bc8"
        },
        {
          "date": "2027-02-28",
          "title": "&TEAM Mark on You · 아레나 투어",
          "sub": "일본 가가와 아나부키 아레나 · 16:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/dd0f71998bc8"
        },
        {
          "date": "2027-03-20",
          "title": "&TEAM Mark on You · 아레나 투어",
          "sub": "일본 후쿠오카 마린멧세 B관 · 17:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/dd0f71998bc8"
        },
        {
          "date": "2027-03-21",
          "title": "&TEAM Mark on You · 아레나 투어",
          "sub": "일본 후쿠오카 마린멧세 B관 · 16:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/dd0f71998bc8"
        },
        {
          "date": "2027-03-22",
          "title": "&TEAM Mark on You · 아레나 투어",
          "sub": "일본 후쿠오카 마린멧세 B관 · 16:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/dd0f71998bc8"
        },
        {
          "date": "2027-03-26",
          "title": "&TEAM Mark on You · 아레나 투어",
          "sub": "일본 미야기 세키스이하임 슈퍼아레나 · 18:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/dd0f71998bc8"
        },
        {
          "date": "2027-03-27",
          "title": "&TEAM Mark on You · 아레나 투어",
          "sub": "일본 미야기 세키스이하임 슈퍼아레나 · 16:00 일본 현지 · 예매·변경·취소는 공식 공지 확인",
          "href": "https://www.andteam-official.jp/news/dd0f71998bc8"
        }
      ],
      "schedules": [
        {
          "title": "&TEAM 공식 일정",
          "sub": "공연·방송 등 활동 달력 · 변경 여부 확인",
          "href": "https://www.andteam-official.jp/schedule"
        },
        {
          "title": "&TEAM 공식 티켓",
          "sub": "투어·예매·변경·취소 공지",
          "href": "https://www.andteam-official.jp/ticket"
        }
      ],
      news: [
        {
          "date": "2026.11.12",
          "tag": "광고",
          "title": "For us, 미쓰이 라라포트·아울렛 블랙프라이데이 TV 광고 음악 선정",
          "href": "https://www.andteam-official.jp/news/48bd3c0789e7"
        },
        {
          "date": "2026.11.12",
          "tag": "굿즈",
          "title": "&TEAM CAFE THE WOLF BUTLERS 상품 예약 판매 시작",
          "href": "https://www.andteam-official.jp/news/56e8ec3cf6be"
        },
        {
          "date": "2026.11.12",
          "tag": "방송",
          "title": "JO·TAKI·MAKI, 11월 18일 TBS よるのブランチ 출연 발표",
          "href": "https://www.andteam-official.jp/news/2c290411ba85"
        },
        {
          "date": "2026.11.12",
          "tag": "방송",
          "title": "JO·TAKI, 11월 18일 후지TV ホンマでっか!?TV 출연 발표",
          "href": "https://www.andteam-official.jp/news/a84de8968609"
        },
        {
          "date": "2026.11.06",
          "tag": "공연",
          "title": "2027년 Mark on You 아레나 투어 13회 공식 일정 공개",
          "href": "https://www.andteam-official.jp/news/dd0f71998bc8"
        }
      ],
      merch: [
        {
          "title": "&TEAM CAFE THE WOLF BUTLERS 공식 MD",
          "sub": "예약 11/12 12:00~2027/1/31 18:00 JST · 수량 한정·일본 내 배송 · 2027년 4월 중순 이후 순차 발송 예정",
          "href": "https://www.andteam-official.jp/news/56e8ec3cf6be"
        },
        {
          "title": "Mark on Me 공식 포토카드·키링 MD",
          "sub": "2026.09.08 판매 개시 · 일본 내 배송 · 수량 한정·소진 가능 · 재고·판매 조건은 공식 안내 확인",
          "href": "https://www.andteam-official.jp/news/5975b9ab0505"
        },
        {
          "title": "Mark on You 투어 공식 MD",
          "sub": "9/15~20 사전판매 종료 안내 · 현재 구매·재고 여부는 공식 판매처 확인",
          "href": "https://www.andteam-official.jp/news/2a6725a8861d"
        },
        {
          "title": "&TEAM 공식 상품 목록",
          "sub": "Weverse Shop · 앨범·응원봉·공식 MD · 재고·가격은 판매처 확인",
          "href": "https://shop.weverse.io/ko/shop/USD/artists/75"
        }
      ],
      campaigns: [
        {
          "kind": "광고",
          "date": "2026.11.12",
          "title": "&TEAM 'For us' × 미쓰이 라라포트·아울렛 BLACK FRIDAY",
          "sub": "일본 TV CM 삽입곡(일부 지역 제외) · 2026.11.29까지 순차 방영",
          "href": "https://www.andteam-official.jp/news/48bd3c0789e7"
        }
      ],
      "accent": "#528b73",
      "light": "#e0f5e9",
      "dark": "#315b49",
      "bg": "#f2fbf4",
      "shape": "✷"
    }
  ];
  window.OJJUDA_FAN_ARTISTS.push(...additionalArtists.map(artistFrom));
})();
