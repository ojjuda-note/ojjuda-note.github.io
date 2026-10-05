import { db } from '@/db'

// Korean merchant keyword → category name mapping (100+)
const MERCHANT_RULES: Record<string, string> = {
  // 식비
  '배달의민족': '식비', '배민': '식비', '요기요': '식비', '쿠팡이츠': '식비',
  '맥도날드': '식비', '버거킹': '식비', '롯데리아': '식비', 'KFC': '식비',
  '서브웨이': '식비', '파파존스': '식비', '도미노': '식비', '피자헛': '식비',
  '김밥천국': '식비', '한솥': '식비', '본죽': '식비', '놀부': '식비',
  '이마트': '식비', '홈플러스': '식비', '롯데마트': '식비', '코스트코': '식비',
  'GS더프레시': '식비', '하나로마트': '식비', '농협하나로': '식비',
  '교촌치킨': '식비', 'BBQ': '식비', 'BHC': '식비', '굽네치킨': '식비',
  '네네치킨': '식비', '또래오래': '식비', '호식이': '식비',
  '김가네': '식비', '빽보이': '식비', '명랑핫도그': '식비',
  
  // 카페
  '스타벅스': '카페', '투썸플레이스': '카페', '투썸': '카페',
  '이디야': '카페', '메가커피': '카페', '메가MGC': '카페',
  '컴포즈커피': '카페', '빽다방': '카페', '할리스': '카페',
  '폴바셋': '카페', '블루보틀': '카페', '커피빈': '카페',
  '엔제리너스': '카페', '파스쿠찌': '카페', '탐앤탐스': '카페',
  '카페베네': '카페', '더벤티': '카페', '감성커피': '카페',
  
  // 편의점 → 쇼핑
  'CU': '쇼핑', 'GS25': '쇼핑', '세븐일레븐': '쇼핑', '이마트24': '쇼핑', '미니스톱': '쇼핑',
  
  // 교통
  '카카오T': '교통', '카카오택시': '교통', '타다': '교통', '우버': '교통',
  '티머니': '교통', '교통카드': '교통', '주유소': '교통',
  'SK에너지': '교통', 'GS칼텍스': '교통', 'S-OIL': '교통', '현대오일뱅크': '교통',
  '고속버스': '교통', 'KTX': '교통', 'SRT': '교통', '코레일': '교통',
  '하이패스': '교통', '주차': '교통', '파킹': '교통',
  '쏘카': '교통', '그린카': '교통',
  
  // 쇼핑
  '쿠팡': '쇼핑', '네이버쇼핑': '쇼핑', 'SSG': '쇼핑', '11번가': '쇼핑',
  'G마켓': '쇼핑', '옥션': '쇼핑', '위메프': '쇼핑', '티몬': '쇼핑',
  '올리브영': '쇼핑', '다이소': '쇼핑', '무신사': '쇼핑', '지그재그': '쇼핑',
  '에이블리': '쇼핑', '오늘의집': '쇼핑', '알리익스프레스': '쇼핑', '알리': '쇼핑',
  '유니클로': '쇼핑', '자라': '쇼핑', 'H&M': '쇼핑', '나이키': '쇼핑', '아디다스': '쇼핑',
  
  // 통신
  'SKT': '통신', 'KT': '통신', 'LGU': '통신', 'LG유플러스': '통신',
  
  // 구독
  '넷플릭스': '구독', 'Netflix': '구독', '유튜브프리미엄': '구독', 'YouTube': '구독',
  '스포티파이': '구독', 'Spotify': '구독', '멜론': '구독', '지니': '구독', 'FLO': '구독',
  '왓챠': '구독', '디즈니플러스': '구독', '쿠팡플레이': '구독', '웨이브': '구독', '티빙': '구독',
  'Apple': '구독', '애플': '구독', 'Google One': '구독', 'iCloud': '구독',
  'ChatGPT': '구독', 'Claude': '구독', 'Notion': '구독', 'GitHub': '구독',
  
  // 의료
  '병원': '의료', '의원': '의료', '약국': '의료', '치과': '의료',
  '안과': '의료', '피부과': '의료', '내과': '의료', '정형외과': '의료',
  
  // 교육
  '교보문고': '교육', '영풍문고': '교육', '알라딘': '교육', '예스24': '교육',
  '인프런': '교육', '클래스101': '교육', '패스트캠퍼스': '교육', '유데미': '교육', 'Udemy': '교육',
  
  // 주거
  '관리비': '주거', '전기': '주거', '가스': '주거', '수도': '주거',
  '한국전력': '주거', '도시가스': '주거', '아파트': '주거',
  
  // 여행
  '야놀자': '여행', '여기어때': '여행', '아고다': '여행', '부킹닷컴': '여행',
  '에어비앤비': '여행', 'Airbnb': '여행', '대한항공': '여행', '아시아나': '여행',
  '제주항공': '여행', '진에어': '여행', '티웨이': '여행',
  
  // 보험
  '삼성생명': '보험', '한화생명': '보험', '교보생명': '보험',
  '삼성화재': '보험', '현대해상': '보험', 'DB손해보험': '보험',
}

export async function classifyMerchant(merchantName: string): Promise<{ categoryName: string; confidence: number }> {
  if (!merchantName) return { categoryName: '기타', confidence: 0 }

  const normalized = merchantName.trim()

  // 1. Check user-defined rules in DB first
  const userRule = await db.merchantRules
    .where('merchantPattern')
    .equals(normalized)
    .first()
  
  if (userRule) {
    const cat = await db.categories.get(userRule.categoryId)
    if (cat) {
      await db.merchantRules.update(userRule.id!, { useCount: userRule.useCount + 1 })
      return { categoryName: cat.name, confidence: 1.0 }
    }
  }

  // 2. Check built-in keyword rules
  for (const [keyword, category] of Object.entries(MERCHANT_RULES)) {
    if (normalized.includes(keyword) || keyword.includes(normalized)) {
      return { categoryName: category, confidence: 0.9 }
    }
  }

  return { categoryName: '기타', confidence: 0 }
}

export async function classifyAndGetCategoryId(merchantName: string): Promise<number | undefined> {
  const { categoryName } = await classifyMerchant(merchantName)
  const cat = await db.categories.where('name').equals(categoryName).first()
  return cat?.id
}

export async function learnRule(merchantName: string, categoryId: number) {
  const existing = await db.merchantRules
    .where('merchantPattern')
    .equals(merchantName.trim())
    .first()
  
  if (existing) {
    await db.merchantRules.update(existing.id!, { categoryId, useCount: existing.useCount + 1 })
  } else {
    await db.merchantRules.add({
      merchantPattern: merchantName.trim(),
      categoryId,
      useCount: 1,
    })
  }
}
