// Sources support their stated calculation or explanation scope, not a promise
// that traditional interpretations predict future events.
const COMMON_SOURCES = [
  {
    id: 'korean-calendar',
    title: '한국 음력과 윤달을 바꾸는 계산 자료',
    publisher: 'korean-lunar-calendar 원저작자 · 0.4.0',
    url: 'https://github.com/usingsky/korean_lunar_calendar_js/tree/6f988e3f50a424d165b9834f9e28cd3ea962da63',
    usedFor: '한국 음력 생일과 윤달을 확인하고 양력 날짜로 바꿀 때 사용합니다.',
    limitation: '날짜를 바꾸는 자료입니다. 성격이나 미래의 일을 증명하는 자료는 아닙니다.',
  },
  {
    id: 'eight-char-reference',
    title: '사주 글자와 전통 분류를 확인하는 자료',
    publisher: '6tail · lunar-javascript 1.7.8 및 공식 EightChar 문서',
    url: 'https://6tail.cn/calendar/lunar.bazi.html',
    usedFor: '태어난 때와 선택한 해·달의 간지, 전체 지장간과 십성, 십이운성, 납음, 순·공망을 확인합니다. 1.7.8의 고정된 계산표를 사용합니다.',
    limitation: '전통 분류표의 결과입니다. 용신이나 실제 사건의 발생 여부까지 판정한 것은 아닙니다. 대운의 순서와 시작 시점은 별도 계산 근거에 표시합니다.',
  },
  {
    id: 'twelve-stage-meanings',
    title: '열두 단계 이름의 뜻을 확인한 옛 문헌',
    publisher: '만민영 · 《삼명통회》 권2 「論五行旺相休囚死並寄生十二宫」 · 식전고적 원문',
    url: 'https://www.shidianguji.com/zh/book/SK1610/chapter/1kf5v6ol1tqg5',
    usedFor: '장생부터 양까지 열두 단계의 이름과 자라고 거두는 비유를 쉬운 말로 설명합니다. 이름만으로 좋고 나쁨을 단정하지 않는다는 원문의 설명도 함께 전합니다.',
    limitation: '전통 문헌에 적힌 뜻을 설명하는 자료입니다. 개인의 미래·질병·수명을 검증한 자료가 아니며, 생활 질문은 오쭈다가 따로 작성한 예시입니다.',
  },
  {
    id: 'saju-background',
    title: '사주라는 말과 기본 개념을 설명하는 자료',
    publisher: '한국학중앙연구원 · 한국민족문화대백과사전 「사주」',
    url: 'https://encykorea.aks.ac.kr/Article/E0025957',
    usedFor: '네 기둥과 여덟 글자, 입춘과 절기를 쓰는 전통의 기본 뜻을 설명할 때 참고합니다.',
    limitation: '사주의 개념과 역사를 설명하는 자료입니다. 개인의 풀이를 이 기관이 확인하거나 보증했다는 뜻은 아닙니다.',
  },
];

const CALENDAR_2026 = {
  id: 'kasi-2026-calendar-check',
  title: '2026년 절기 시각을 대조한 자료',
  publisher: '한국천문연구원 · 2026년 달력자료',
  url: 'https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2026',
  usedFor: '2026년 소한부터 대설까지, 월별 풀이의 시작이 되는 12절의 한국 시각을 분 단위 자료와 대조했습니다.',
  limitation: '이 페이지는 공식 월력요항 발표 전의 참고자료입니다. 이번 대조는 2026년 12절에 한하며, 초 단위 시각이나 미래의 일을 검증한 것은 아닙니다.',
};

const PERSONAL_SOURCES = [
  {
    id:'traditional-colors-directions',title:'오행에 연결한 색과 방향',
    publisher:'한국학중앙연구원 · 한국민족문화대백과사전 「색」',
    url:'https://encykorea.aks.ac.kr/Article/E0027476',
    usedFor:'목·화·토·금·수와 청·적·황·백·흑, 동·남·중앙·서·북의 전통적 대응을 확인합니다.',
    limitation:'전통 상징의 대응표입니다. 개인에게 유리한 색이나 집의 길한 방향을 판정한 자료는 아닙니다.',
  },
  {
    id:'hetu-numbers',title:'하도의 숫자 대응을 확인한 원문',
    publisher:'호방평 · 《역학계몽통석》 사고전서본 · 위키문헌 공개 원문',
    url:encodeURI('https://zh.wikisource.org/wiki/易學啟蒙通釋_(四庫全書本)/全覽'),
    usedFor:'수 1·6, 화 2·7, 목 3·8, 금 4·9, 토 5·10의 하도 대응표를 확인합니다. 낙서의 수 배치와 섞지 않습니다.',
    limitation:'옛 문헌의 숫자 분류이며 성공 확률이나 행운 번호를 계산하는 자료는 아닙니다.',
  },
  {
    id:'furniture-safety',title:'가구와 TV를 안전하게 고정하는 방법',
    publisher:'미국 소비자제품안전위원회(CPSC) · Anchor It',
    url:'https://www.cpsc.gov/Safety-Education/Safety-Education-Centers/AnchorItgov?language=en',
    usedFor:'큰 가구와 TV의 전도 방지 고정, 제조사 설명에 따른 설치 같은 공통 안전 조언에 참고합니다.',
    limitation:'실제 생활의 안전 수칙입니다. 사주나 방위로 사고 시기를 예측하는 근거로 쓰지 않습니다.',
  },
  {
    id:'window-furniture-safety',title:'창가 가구와 어린이 추락 예방',
    publisher:'미국 소비자제품안전위원회(CPSC) · Safety Alerts',
    url:'https://www.cpsc.gov/Safety-Education/Safety-Alerts',
    usedFor:'어린이가 올라설 수 있는 가구를 창문 가까이에 두지 않는 공통 공간 안전 조언에 참고합니다.',
    limitation:'실제 창문과 가구 배치에 관한 안전 수칙이며 사주의 길흉이나 개인의 사고 시기와 연결하지 않습니다.',
  },
  {
    id:'drowsy-driving-safety',title:'졸음운전을 피하기 위한 안전 수칙',
    publisher:'미국 도로교통안전국(NHTSA)',
    url:'https://www.nhtsa.gov/risky-driving/drowsy-driving',
    usedFor:'운전 전 충분히 쉬고, 졸릴 때 안전한 곳에서 운전을 멈추고 쉬는 공통 안전 조언에 참고합니다.',
    limitation:'실제 피로와 운전 상황에 관한 조언이며 특정 사주의 사고 위험이나 사고 날짜를 판정하지 않습니다.',
  },
];

export function getReadingSources(topic = 'lifelong', year) {
  const sources = COMMON_SOURCES.map(source => ({ ...source }));
  if(['lifelong','all'].includes(topic)) sources.push(...PERSONAL_SOURCES.map(source=>({...source})));
  if (['annual', 'monthly', 'all'].includes(topic) && Number(year) === 2026) {
    sources.push({ ...CALENDAR_2026 });
  }
  return sources;
}
