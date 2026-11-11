/* 21 additional fan spaces, checked 2026-11-11.
   Visual palettes are fan-made interpretations, not official group colors.
   The single lead photo per group comes from Wikimedia Commons with attribution. */
(() => {
  'use strict';
  const artistFrom = (entry) => {
    const image = commonsPhoto(entry.photo, entry.photoLabel || '단체', entry.photoYear, entry.credit, entry.license);
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
      checkedAt: '2026.11.11',
      basicProfile: true,
      image: image.image,
      imageCredit: image.credit + ' · ' + image.license,
      imageLink: image.href,
      photos: [image, ...(entry.morePhotos || [])],
      links: [
        { label: '공식 사이트', icon: '✦', url: entry.official },
        { label: 'YouTube', icon: '▷', url: entry.youtube }
      ],
      merch: entry.merch || [
        { title: '공식 앨범·굿즈 안내', sub: '아티스트 공식 채널에서 확인', href: entry.official }
      ],
      music: entry.music || [
        { title: entry.debutWork, date: entry.debut, type: '데뷔 음반·싱글', songs: entry.songs, href: entry.official }
      ],
      appearances: entry.appearances || [],
      schedules: entry.schedules || [
        { title: '공식 활동·일정 확인', sub: '아티스트 공식 채널', href: entry.official }
      ],
      news: entry.news || [
        { date: '공식', tag: '소식', title: entry.name + ' 최신 안내', href: entry.official }
      ],
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
        { title: 'AD MARE', date: '2022.02.22', type: '데뷔 싱글 · 타이틀 O.O', songs: ['O.O', '占 (TANK)'], href: 'https://nmixx.jype.com/discography' }
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
        { date: '2026-11-12', title: 'MTV JAPAN BABYMONSTER VideoSelects', sub: '일본 MTV · 23:00~24:00 (현지 시간) · 뮤직비디오 특집', href: 'https://www.sonymusic.co.jp/artist/BABYMONSTER/info/587656' },
        { date: '2026-11-14', title: 'CHOOM 월드투어 · 쿠알라룸푸르', sub: '말레이시아 Unifi Arena · 현지 17:00', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-11-18', title: 'MTV JAPAN BABYMONSTER VideoSelects 재방송', sub: '일본 MTV · 21:00~22:00 (현지 시간)', href: 'https://www.sonymusic.co.jp/artist/BABYMONSTER/info/587656' },
        { date: '2026-11-21', title: 'CHOOM 월드투어 · 타이베이', sub: '대만 Taipei Arena · 현지 19:30', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-11-22', title: 'CHOOM 월드투어 · 타이베이', sub: '대만 Taipei Arena · 현지 18:00', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-11-28', title: 'CHOOM 월드투어 · 싱가포르', sub: 'Singapore Indoor Stadium · 현지 18:00', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-11-29', title: 'CHOOM 월드투어 · 싱가포르 추가 공연', sub: 'Singapore Indoor Stadium · 현지 18:00', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-12-08', title: 'CHOOM 월드투어 · 오클랜드', sub: '뉴질랜드 Spark Arena · 시간은 예매처 확인', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-12-11', title: 'CHOOM 월드투어 · 멜버른', sub: '호주 Rod Laver Arena · 시간은 예매처 확인', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2026-12-13', title: 'CHOOM 월드투어 · 시드니', sub: '호주 Afterpay Arena · 시간은 예매처 확인', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2027-01-08', title: 'CHOOM 월드투어 · 홍콩', sub: 'AsiaWorld-Arena · 현지 20:00', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2027-01-09', title: 'CHOOM 월드투어 · 홍콩', sub: 'AsiaWorld-Arena · 현지 18:00', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { date: '2027-01-10', title: 'CHOOM 월드투어 · 홍콩', sub: 'AsiaWorld-Arena · 현지 18:00', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' }
      ],
      schedules: [
        { title: 'YG 공식 월드투어 일정·예매', sub: '도시별 장소·현지 시간·변경사항', href: 'https://artist.ygfamily.co.kr/ARTISTS/BABYMONSTER/concert/worldtourchoom/index.html' },
        { title: 'YG 공식 공연 공지', sub: '현지 예매 규정·추가 회차 안내', href: 'https://ygfamily.com/ko/artists/babymonster/notice' },
        { title: '일본 공식 미디어·일정', sub: '일본 방송·발매 일정', href: 'https://yg-babymonster-official.jp/schedule' }
      ],
      news: [
        { date: '2026.10.23', tag: '컴백', title: '디지털 싱글 DESERVE · 공식 MV 공개', href: 'https://www.sonymusic.co.jp/artist/BABYMONSTER/info/587905' },
        { date: '2026.10.15', tag: '방송', title: '11.12·11.18 일본 MTV 뮤직비디오 특집 방송 안내', href: 'https://www.sonymusic.co.jp/artist/BABYMONSTER/info/587656' },
        { date: '2026.09.25', tag: '협업', title: '루카·아사, 일본 패션 브랜드 SNIDEL 홍보대사 선정', href: 'https://prtimes.jp/main/html/rd/p/000004511.000018505.html' }
      ],
      merch: [
        { title: 'DESERVE 공식 MD 예약 판매', sub: 'YG SELECT · 11.06 11:00 시작 · 한정 수량, 품절 여부 판매처 확인', href: 'https://www.ygselect.com/article/event/12/657823/' },
        { title: '춤 (CHOOM) 공식 앨범', sub: 'YG SELECT · Crimson / Metallic / Prism 구성 · 재고는 판매처 확인', href: 'https://ygselect.com/product/babymonster-3rd-mini-album-%EC%B6%A4-choom-crimson-metallic-prism-ver/12957/' },
        { title: 'BABYMONSTER 공식 응원봉', sub: 'YG SELECT · 판매·재입고 상태는 판매처 확인', href: 'https://www.ygselect.com/product/babymonster-official-light-stick/10557/category/32/display/1/' }
      ],
      campaigns: [
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
      official: 'https://www.smentertainment.com/', youtube: 'https://www.youtube.com/@hearts2hearts.official',
      photo: '260221 HEARTS2HEARTS @ 2026 Fanmeeting HEARTS2HOUSE.jpg', photoLabel: 'HEARTS2HOUSE 팬미팅', photoYear: '2026', credit: 'sublimitas viii', license: 'CC BY-SA 4.0',
      accent: '#9074db', light: '#efe5ff', dark: '#594782', bg: '#faf6ff', shape: '♡'
    },
    {
      id: 'kissoflife', name: 'KISS OF LIFE', korean: '키스오브라이프', category: 'girl', fan: 'KISSY', agency: 'S2 Entertainment',
      members: ['쥴리', '나띠', '벨', '하늘'],
      debut: '2023.07.05', debutWork: 'KISS OF LIFE', songs: ['쉿 (Shhh)', '안녕, 네버랜드'],
      concept: '각자의 개성과 목소리로 완성하는 자유로운 무대.',
      official: 'https://www.s2ent.co.kr/', youtube: 'https://www.youtube.com/@KISSOFLIFE_S2',
      photo: 'KISS OF LIFE at Music Bank (4K) 20240705 02.png', photoLabel: '뮤직뱅크 출근길', photoYear: '2024', credit: '티비텐 TV10', license: 'CC BY 3.0',
      accent: '#b74472', light: '#ffe4ed', dark: '#68314e', bg: '#fff4f7', shape: '✿'
    },
    {
      id: 'kiiikiii', name: 'KiiiKiii', korean: '키키', category: 'girl', fan: 'TiiiKiii', agency: 'STARSHIP Entertainment',
      members: ['지유', '이솔', '수이', '하음', '키야'],
      debut: '2025.03.24', debutWork: 'UNCUT GEM', songs: ['I DO ME', 'BTG'],
      concept: '틀에 얽매이지 않는 감각과 자유로운 에너지.',
      official: 'https://www.starship-ent.com/musician/kiiikiii', youtube: 'https://www.youtube.com/@KiiiKiii_starship',
      photo: 'KiiiKiii in August 2026.png', photoLabel: '2026년 단체', photoYear: '2026', credit: 'K-POPIT 케이팝잇', license: 'CC BY 4.0',
      accent: '#4c95c2', light: '#daf5ff', dark: '#315e7b', bg: '#f0fbff', shape: '✺'
    },
    {
      id: 'blackpink', name: 'BLACKPINK', korean: '블랙핑크', category: 'girl', fan: 'BLINK', agency: 'YG Entertainment',
      members: ['지수', '제니', '로제', '리사'],
      debut: '2016.08.08', debutWork: 'SQUARE ONE', songs: ['휘파람 (WHISTLE)', '붐바야 (BOOMBAYAH)'],
      concept: '블랙과 핑크, 서로 다른 매력이 공존하는 무대.',
      official: 'https://www.ygfamily.com/', youtube: 'https://www.youtube.com/@BLACKPINK',
      photo: '20240809 Blackpink Pink Carpet 09.png', photoLabel: '핑크 카펫', photoYear: '2024', credit: 'K-POPIT 케이팝잇', license: 'CC BY 3.0',
      accent: '#ff82b4', light: '#482938', dark: '#fff2f7', bg: '#180f18', night: true, shape: '♥'
    },
    {
      id: 'stayc', name: 'STAYC', korean: '스테이씨', category: 'girl', fan: 'SWITH', agency: 'High Up Entertainment',
      members: ['수민', '시은', '아이사', '세은', '윤', '재이'],
      debut: '2020.11.12', debutWork: 'Star To A Young Culture', songs: ['SO BAD', 'LIKE THIS'],
      concept: '선명한 개성과 상큼한 멜로디를 담는 여섯 멤버.',
      official: 'https://www.highup-ent.com/', youtube: 'https://www.youtube.com/@STAYC',
      photo: 'STAYC Metamorphic Showcase 240701.jpg', photoLabel: 'Metamorphic 쇼케이스', photoYear: '2024', credit: '티비텐 TV10', license: 'CC BY 3.0',
      accent: '#e4897b', light: '#ffe7df', dark: '#865366', bg: '#fff8f3', shape: '✾'
    },
    {
      id: 'idle', name: 'i-dle', korean: '아이들', category: 'girl', fan: 'NEVERLAND', agency: 'CUBE Entertainment',
      members: ['미연', '민니', '소연', '우기', '슈화'],
      debut: '2018.05.02', debutWork: 'I am', songs: ['LATATA', 'MAZE'],
      concept: '자신만의 음악과 이야기를 직접 만들어 가는 다섯 멤버.',
      official: 'https://i-dle.cubeent.co.jp/profile/', youtube: 'https://www.youtube.com/@official_i_dle',
      photo: '(G)I-DLE Airport Departure 2024.png', photoLabel: '2024년 공항 단체', photoYear: '2024', credit: 'K-POPIT 케이팝잇', license: 'CC BY 3.0',
      accent: '#9567d1', light: '#ebdeff', dark: '#594077', bg: '#faf5ff', shape: '✦'
    },
    {
      id: 'bts', name: 'BTS', korean: '방탄소년단', category: 'boy', fan: 'ARMY', agency: 'BIGHIT MUSIC',
      members: ['RM', '진', '슈가', '제이홉', '지민', '뷔', '정국'],
      debut: '2013.06.13', debutWork: '2 COOL 4 SKOOL', songs: ['No More Dream', 'We Are Bulletproof Pt.2'],
      concept: '음악과 이야기를 통해 전 세계 아미와 연결되는 일곱 멤버.',
      official: 'https://ibighit.com/bts/eng/', youtube: 'https://www.youtube.com/@BTS',
      photo: 'BTS during a White House press conference May 31, 2022 (cropped).jpg', photoLabel: '백악관 기자회견', photoYear: '2022', credit: 'The White House', license: 'Public domain',
      accent: '#875dca', light: '#eadfff', dark: '#52367b', bg: '#f7f2ff', shape: '✧'
    },
    {
      id: 'seventeen', name: 'SEVENTEEN', korean: '세븐틴', category: 'boy', fan: 'CARAT', agency: 'PLEDIS Entertainment',
      members: ['에스쿱스', '정한', '조슈아', '준', '호시', '원우', '우지', '디에잇', '민규', '도겸', '승관', '버논', '디노'],
      debut: '2015.05.26', debutWork: '17 CARAT', songs: ['아낀다 (Adore U)', '20'],
      concept: '보컬·퍼포먼스·힙합 유닛이 함께 빚는 팀워크.',
      official: 'https://www.pledis.co.kr/', youtube: 'https://www.youtube.com/@pledis17',
      photo: 'Seventeen Carat Land 24.jpg', photoLabel: 'CARAT LAND', photoYear: '2024', credit: 'SEVENTEEN', license: 'CC BY 3.0',
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
      official: 'https://ibighit.com/txt/eng/', youtube: 'https://www.youtube.com/@TXT_bighit',
      photo: 'Tomorrow X Together at a Dior event, April 18, 2025.png', photoLabel: '디올 행사', photoYear: '2025', credit: 'K-POPIT 케이팝잇', license: 'CC BY 3.0',
      accent: '#299da9', light: '#d9fbf4', dark: '#28656e', bg: '#f3fffc', shape: '✳'
    },
    {
      id: 'enhypen', name: 'ENHYPEN', korean: '엔하이픈', category: 'boy', fan: 'ENGENE', agency: 'BELIFT LAB',
      members: ['정원', '제이', '제이크', '성훈', '선우', '니키'],
      debut: '2020.11.30', debutWork: 'BORDER : DAY ONE', songs: ['Given-Taken', 'Let Me In (20 CUBE)'],
      concept: '서로 다른 세계를 음악으로 잇는 여섯 멤버.',
      official: 'https://beliftlab.com/artist/profile/ENHYPEN?lang=ko', youtube: 'https://www.youtube.com/@ENHYPENOFFICIAL',
      photo: 'Enhypen, June 2026.jpg', photoLabel: '2026년 단체', photoYear: '2026', credit: 'K-POPIT', license: 'CC BY 4.0',
      accent: '#d58b9e', light: '#4c3040', dark: '#fff1f5', bg: '#1c1521', night: true, shape: '♢'
    },
    {
      id: 'riize', name: 'RIIZE', korean: '라이즈', category: 'boy', fan: 'BRIIZE', agency: 'SM Entertainment',
      members: ['쇼타로', '은석', '성찬', '원빈', '소희', '앤톤'],
      debut: '2023.09.04', debutWork: 'Get A Guitar', songs: ['Get A Guitar', 'Memories'],
      concept: '함께 성장하며 꿈을 실현해 가는 여섯 멤버.',
      official: 'https://www.smentertainment.com/', youtube: 'https://www.youtube.com/@RIIZE_official',
      photo: 'Riize at the 2024 Melon Music Awards-2.png', photoLabel: '멜론뮤직어워드', photoYear: '2024', credit: 'TenAsia', license: 'CC BY 3.0',
      accent: '#df8a52', light: '#ffe7d2', dark: '#855234', bg: '#fff8ef', shape: '☀'
    },
    {
      id: 'boynextdoor', name: 'BOYNEXTDOOR', korean: '보이넥스트도어', category: 'boy', fan: 'ONEDOOR', agency: 'KOZ Entertainment',
      members: ['성호', '리우', '명재현', '태산', '이한', '운학'],
      debut: '2023.05.30', debutWork: 'WHO!', songs: ['돌아버리겠다 (But I Like You)', 'One and Only', 'Serenade'],
      concept: '일상의 이야기를 솔직하게 들려주는 여섯 멤버.',
      official: 'https://kozofficial.com/artist/boynextdoor', youtube: 'https://www.youtube.com/@BOYNEXTDOOR_official',
      photo: '2026-01-16 BOYNEXTDOOR at Golden Disc Awards 05 (cropped).png', photoLabel: '골든디스크 시상식', photoYear: '2026', credit: '티비텐 TV10', license: 'CC BY 4.0',
      accent: '#478bc5', light: '#dfefff', dark: '#2d5678', bg: '#f3faff', shape: '✱'
    },
    {
      id: 'tws', name: 'TWS', korean: '투어스', category: 'boy', fan: '42 (SAI)', agency: 'PLEDIS Entertainment',
      members: ['신유', '도훈', '영재', '한진', '지훈', '경민'],
      debut: '2024.01.22', debutWork: 'Sparkling Blue', songs: ['첫 만남은 계획대로 되지 않아', 'Oh Mymy : 7s'],
      concept: '소년 시절의 반짝임과 일상을 담은 여섯 멤버.',
      official: 'https://www.pledis.co.kr/artist/detail/TWS/profile/', youtube: 'https://www.youtube.com/@TWS_PLEDIS',
      photo: 'TWS at the 2024 Melon Music Awards.png', photoLabel: '멜론뮤직어워드', photoYear: '2024', credit: 'TenAsia', license: 'CC BY 3.0',
      accent: '#76a8d7', light: '#e0efff', dark: '#456a91', bg: '#f6fbff', shape: '✦'
    },
    {
      id: 'nctdream', name: 'NCT DREAM', korean: '엔시티 드림', category: 'boy', fan: 'NCTzen', agency: 'SM Entertainment',
      members: ['런쥔', '제노', '해찬', '재민', '천러', '지성'],
      debut: '2016.08.25', debutWork: 'Chewing Gum', songs: ['Chewing Gum'],
      concept: '성장을 노래하는 NCT의 여섯 멤버 유닛.',
      official: 'https://www.smentertainment.com/', youtube: 'https://www.youtube.com/@NCTDREAM',
      photo: 'NCT Dream at DREAM()SCAPE Press Conference.png', photoLabel: 'DREAM()SCAPE 기자회견 · 당시 사진', photoYear: '2024', credit: 'K-POPIT 케이팝잇', license: 'CC BY 3.0',
      accent: '#67b956', light: '#e6fbdc', dark: '#416e37', bg: '#f5fff1', shape: '☘'
    },
    {
      id: 'ateez', name: 'ATEEZ', korean: '에이티즈', category: 'boy', fan: 'ATINY', agency: 'KQ Entertainment',
      members: ['홍중', '성화', '윤호', '여상', '산', '민기', '우영', '종호'],
      debut: '2018.10.24', debutWork: 'TREASURE EP.1 : All To Zero', songs: ['해적왕 (Pirate King)', 'Treasure'],
      concept: '여덟 멤버가 함께 나아가는 모험과 항해.',
      official: 'https://kqent.com/', youtube: 'https://www.youtube.com/@ATEEZofficial',
      photo: 'ATEEZ in August 2024 (cropped).jpg', photoLabel: '2024년 단체', photoYear: '2024', credit: 'pinkllamanade', license: 'CC BY-SA 2.0',
      accent: '#d7af68', light: '#4f422a', dark: '#fff2d5', bg: '#171e2c', night: true, shape: '✶'
    },
    {
      id: 'treasure', name: 'TREASURE', korean: '트레저', category: 'boy', fan: 'TREASURE MAKER', agency: 'YG Entertainment',
      members: ['최현석', '지훈', '요시', '준규', '윤재혁', '아사히', '도영', '하루토', '박정우', '소정환'],
      debut: '2020.08.07', debutWork: 'THE FIRST STEP : CHAPTER ONE', songs: ['BOY', '들어와 (COME TO ME)'],
      concept: '다채로운 개성과 무대로 빛나는 열 명의 팀워크.',
      official: 'https://www.ygfamily.com/', youtube: 'https://www.youtube.com/@TREASURE',
      photo: '240405 트레저 TTA Malaysia 1st Place.jpg', photoLabel: '2024년 단체', photoYear: '2024', credit: 'K-POPIT 케이팝잇', license: 'CC BY 3.0',
      accent: '#478dce', light: '#dff3ff', dark: '#28577e', bg: '#f1f9ff', shape: '◆'
    },
    {
      id: 'nctwish', name: 'NCT WISH', korean: '엔시티 위시', category: 'boy', fan: 'NCTzen', agency: 'SM Entertainment',
      members: ['시온', '리쿠', '유우시', '재희', '료', '사쿠야'],
      debut: '2024.02.21', debutWork: 'WISH', songs: ['WISH'],
      concept: '밝은 에너지로 소원을 전하는 NCT의 여섯 멤버 유닛.',
      official: 'https://www.smentertainment.com/', youtube: 'https://www.youtube.com/@NCTWISH',
      photo: '2026 NCT WISH promotion 01.jpg', photoLabel: '2026년 단체', photoYear: '2026', credit: 'numbuzin', license: 'CC BY 4.0',
      accent: '#87b340', light: '#ecffd9', dark: '#567535', bg: '#f7ffef', shape: '☆'
    },
    {
      id: 'andteam', name: '&TEAM', korean: '앤팀', category: 'boy', fan: 'LUNÉ', agency: 'YX LABELS',
      members: ['의주', '후마', '케이', '니콜라스', '유마', '조', '하루아', '타키', '마키'],
      debut: '2022.12.07', debutWork: 'First Howling : ME', songs: ['Under the skin', 'Scent of you'],
      concept: '서로 다른 개성이 하나의 팀으로 이어지는 아홉 멤버.',
      official: 'https://www.andteam-official.jp/', youtube: 'https://www.youtube.com/@andTEAM_official',
      photo: '&TEAM ATA promotion 02.jpg', photoLabel: 'ATA 활동', photoYear: '2026', credit: 'K-POPIT 케이팝잇', license: 'CC BY 4.0',
      accent: '#528b73', light: '#e0f5e9', dark: '#315b49', bg: '#f2fbf4', shape: '✷'
    }
  ];
  window.OJJUDA_FAN_ARTISTS.push(...additionalArtists.map(artistFrom));
})();
