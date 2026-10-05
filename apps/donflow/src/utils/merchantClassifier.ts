// Extended merchant → category classifier with 200+ merchants
// Uses existing classifier.ts as base, adds more mappings

import { db, type MerchantRule } from '@/db'
import { getLang } from '@/lib/i18n'

// Map Korean category names → English equivalents
const KO_TO_EN_CATEGORY: Record<string, string> = {
  '카페': 'Coffee', '식비': 'Groceries', '쇼핑': 'Shopping',
  '교통': 'Transport', '통신': 'Phone', '구독': 'Subscriptions',
  '의료': 'Healthcare', '교육': 'Education', '주거': 'Housing',
  '여행': 'Travel', '보험': 'Insurance', '기타': 'Other',
}

function localizeCategoryName(koName: string): string {
  if (getLang() === 'ko') return koName
  return KO_TO_EN_CATEGORY[koName] ?? 'Other'
}

// PG사 이름 목록 — 이 가맹점명이면 "미분류 PG 거래"로 간주
export const PG_MERCHANTS = [
  '헥토파이낸셜', '핵토파이낸셜', 'KG이니시스', 'NHN한국사이버결제',
  '토스페이먼츠', '나이스페이먼츠', '나이스페이', '다날', 'KCP',
  'NICE페이먼츠', '페이레터', '세틀뱅크', '카카오페이',
  '네이버파이낸셜', '페이코', 'PAYCO',
]

export function isPGMerchant(merchantName: string): boolean {
  if (!merchantName) return false
  const n = merchantName.trim()
  return PG_MERCHANTS.some(pg => n.includes(pg) || pg.includes(n))
}

const MERCHANT_MAP: Record<string, string> = {
  // 카페 (30+)
  '스타벅스': '카페', '투썸플레이스': '카페', '투썸': '카페',
  '이디야': '카페', '메가커피': '카페', '메가MGC': '카페',
  '컴포즈커피': '카페', '컴포즈': '카페', '빽다방': '카페', '할리스': '카페',
  '폴바셋': '카페', '블루보틀': '카페', '커피빈': '카페',
  '엔제리너스': '카페', '파스쿠찌': '카페', '탐앤탐스': '카페',
  '카페베네': '카페', '더벤티': '카페', '감성커피': '카페',
  '커피에반하다': '카페', '매머드커피': '카페', '매머드': '카페',
  '달콤커피': '카페', '공차': '카페', '쥬씨': '카페',
  '더리터': '카페', '카페봄봄': '카페', '커피스미스': '카페',
  '앤티앤스': '카페', '드롭탑': '카페', '토프레소': '카페',

  // 편의점 → 쇼핑 (기존 카테고리)
  'CU': '쇼핑', 'GS25': '쇼핑', '세븐일레븐': '쇼핑',
  '이마트24': '쇼핑', '미니스톱': '쇼핑',

  // 배달/식비
  '배달의민족': '식비', '배민': '식비', '요기요': '식비', '쿠팡이츠': '식비',
  '위메프오': '식비', '땡겨요': '식비',

  // 식당/프랜차이즈
  '맥도날드': '식비', '버거킹': '식비', '롯데리아': '식비', 'KFC': '식비',
  '서브웨이': '식비', '파파존스': '식비', '도미노': '식비', '피자헛': '식비',
  '김밥천국': '식비', '한솥': '식비', '본죽': '식비', '놀부': '식비',
  '교촌치킨': '식비', 'BBQ': '식비', 'BHC': '식비', '굽네치킨': '식비',
  '네네치킨': '식비', '또래오래': '식비', '호식이': '식비',
  '김가네': '식비', '빽보이': '식비', '명랑핫도그': '식비',
  '맘스터치': '식비', '이삭토스트': '식비', '아웃백': '식비',
  '빕스': '식비', '애슐리': '식비', '계절밥상': '식비',
  '뚜레쥬르': '식비', '파리바게뜨': '식비', '파리바게트': '식비',
  '던킨': '식비', '크리스피크림': '식비', '배스킨라빈스': '식비',
  '설빙': '식비', '요거프레소': '식비', '쉐이크쉑': '식비',
  '모스버거': '식비', '노브랜드버거': '식비', '써브웨이': '식비',
  '샐러디': '식비', '피그인더가든': '식비', '한신포차': '식비',

  // 마트 → 식비
  '이마트': '식비', '홈플러스': '식비', '롯데마트': '식비', '코스트코': '식비',
  '트레이더스': '식비', 'GS더프레시': '식비', '하나로마트': '식비',
  '농협하나로': '식비', '노브랜드': '식비', '이마트에브리데이': '식비',
  '홈플러스익스프레스': '식비', '메가마트': '식비', '킴스클럽': '식비',

  // 쇼핑
  '쿠팡': '쇼핑', '네이버쇼핑': '쇼핑', 'SSG': '쇼핑', '11번가': '쇼핑',
  'G마켓': '쇼핑', '옥션': '쇼핑', '위메프': '쇼핑', '티몬': '쇼핑',
  '올리브영': '쇼핑', '다이소': '쇼핑', '무신사': '쇼핑', '지그재그': '쇼핑',
  '에이블리': '쇼핑', '오늘의집': '쇼핑', '알리익스프레스': '쇼핑', '알리': '쇼핑',
  '유니클로': '쇼핑', '자라': '쇼핑', 'H&M': '쇼핑', '나이키': '쇼핑', '아디다스': '쇼핑',
  '네이버페이': '쇼핑', '카카오쇼핑': '쇼핑', '브랜디': '쇼핑',
  'ABC마트': '쇼핑', '탑텐': '쇼핑', '스파오': '쇼핑', '에잇세컨즈': '쇼핑',
  '테무': '쇼핑', 'Temu': '쇼핑', '아마존': '쇼핑', 'Amazon': '쇼핑',
  '이케아': '쇼핑', 'IKEA': '쇼핑',

  // 교통
  '카카오T': '교통', '카카오택시': '교통', '카카오모빌리티': '교통',
  '타다': '교통', '우버': '교통',
  '티머니': '교통', '교통카드': '교통', '주유소': '교통',
  'SK에너지': '교통', 'GS칼텍스': '교통', 'S-OIL': '교통', '현대오일뱅크': '교통',
  '고속버스': '교통', 'KTX': '교통', 'SRT': '교통', '코레일': '교통',
  '하이패스': '교통', '주차': '교통', '파킹': '교통',
  '쏘카': '교통', '그린카': '교통', '피플카': '교통',
  '대한항공': '교통', '아시아나': '교통', '제주항공': '교통',
  '진에어': '교통', '티웨이': '교통', '에어부산': '교통', '에어서울': '교통',

  // 통신
  'SKT': '통신', 'KT': '통신', 'LGU': '통신', 'LG유플러스': '통신',

  // 구독
  '넷플릭스': '구독', 'Netflix': '구독', '유튜브프리미엄': '구독', 'YouTube': '구독',
  '스포티파이': '구독', 'Spotify': '구독', '멜론': '구독', '지니': '구독', 'FLO': '구독',
  '왓챠': '구독', '디즈니플러스': '구독', '쿠팡플레이': '구독', '웨이브': '구독', '티빙': '구독',
  'Apple': '구독', '애플': '구독', 'Google One': '구독', 'iCloud': '구독',
  'ChatGPT': '구독', 'Claude': '구독', 'Notion': '구독', 'GitHub': '구독',
  'Microsoft': '구독', 'Adobe': '구독',

  // 의료
  '병원': '의료', '의원': '의료', '약국': '의료', '치과': '의료',
  '안과': '의료', '피부과': '의료', '내과': '의료', '정형외과': '의료',
  '이비인후과': '의료', '산부인과': '의료', '소아과': '의료', '한의원': '의료',

  // 교육
  '교보문고': '교육', '영풍문고': '교육', '알라딘': '교육', '예스24': '교육',
  '인프런': '교육', '클래스101': '교육', '패스트캠퍼스': '교육',
  '유데미': '교육', 'Udemy': '교육', '코세라': '교육', 'Coursera': '교육',

  // 주거
  '관리비': '주거', '전기': '주거', '가스': '주거', '수도': '주거',
  '한국전력': '주거', '도시가스': '주거', '아파트': '주거',

  // 여행
  '야놀자': '여행', '여기어때': '여행', '아고다': '여행', '부킹닷컴': '여행',
  '에어비앤비': '여행', 'Airbnb': '여행',

  // 보험
  '삼성생명': '보험', '한화생명': '보험', '교보생명': '보험',
  '삼성화재': '보험', '현대해상': '보험', 'DB손해보험': '보험',

  // PG/온라인결제 → 기타 (미분류)
  '핵토파이낸셜': '기타', '토스페이먼츠': '기타', 'KG이니시스': '기타',
  '나이스페이': '기타', 'NHN한국사이버결제': '기타', '다날': '기타',
  '페이코': '기타', 'PAYCO': '기타', '카카오페이': '기타',
  '네이버파이낸셜': '기타', '토스': '기타',
}

export async function classifyMerchantWithAmount(merchantName: string, amount?: number): Promise<{ categoryName: string; categoryId?: number; confidence: number; userLabel?: string; matchedRule?: MerchantRule }> {
  const result = await classifyMerchant(merchantName)
  if (!amount || !isPGMerchant(merchantName)) return result

  // For PG merchants, try amount-based matching (±20%)
  const allRules = await db.merchantRules.toArray()
  for (const rule of allRules) {
    if (rule.merchantPattern === merchantName.trim() && rule.amount) {
      const ratio = amount / rule.amount
      if (ratio >= 0.8 && ratio <= 1.2) {
        const cat = await db.categories.get(rule.categoryId)
        if (cat) {
          return { categoryName: cat.name, categoryId: cat.id, confidence: 0.95, userLabel: rule.userLabel, matchedRule: rule }
        }
      }
    }
  }

  return result
}

export async function classifyMerchant(merchantName: string): Promise<{ categoryName: string; categoryId?: number; confidence: number }> {
  const fallbackName = localizeCategoryName('기타')
  if (!merchantName) return { categoryName: fallbackName, confidence: 0 }

  const normalized = merchantName.trim()

  // 1. User-defined rules in DB (learned) — skip PG merchants for exact match (need amount-based)
  const userRule = await db.merchantRules
    .where('merchantPattern')
    .equals(normalized)
    .first()

  if (userRule && !isPGMerchant(normalized)) {
    const cat = await db.categories.get(userRule.categoryId)
    if (cat) {
      return { categoryName: cat.name, categoryId: cat.id, confidence: 1.0 }
    }
  }

  // 2. Partial match on user rules
  const allRules = await db.merchantRules.toArray()
  for (const rule of allRules) {
    if (!isPGMerchant(rule.merchantPattern) && (normalized.includes(rule.merchantPattern) || rule.merchantPattern.includes(normalized))) {
      const cat = await db.categories.get(rule.categoryId)
      if (cat) return { categoryName: cat.name, categoryId: cat.id, confidence: 0.95 }
    }
  }

  // 3. Built-in keyword map (returns Korean names, localize for EN)
  for (const [keyword, koCategoryName] of Object.entries(MERCHANT_MAP)) {
    if (normalized.includes(keyword) || keyword.includes(normalized)) {
      const localName = localizeCategoryName(koCategoryName)
      const cat = await db.categories.where('name').equals(localName).first()
      return { categoryName: localName, categoryId: cat?.id, confidence: 0.9 }
    }
  }

  // 4. Fallback
  const etcCat = await db.categories.where('name').equals(fallbackName).first()
  return { categoryName: fallbackName, categoryId: etcCat?.id, confidence: 0 }
}

export async function learnMerchant(merchantName: string, categoryId: number, options?: { amount?: number; userLabel?: string }) {
  const pattern = merchantName.trim()

  // For PG merchants with amount, create amount-specific rules
  if (options?.amount && isPGMerchant(pattern)) {
    // Check if similar rule exists (same merchant + similar amount ±20%)
    const allRules = await db.merchantRules.where('merchantPattern').equals(pattern).toArray()
    for (const rule of allRules) {
      if (rule.amount) {
        const ratio = options.amount / rule.amount
        if (ratio >= 0.8 && ratio <= 1.2) {
          await db.merchantRules.update(rule.id!, {
            categoryId,
            useCount: rule.useCount + 1,
            amount: options.amount,
            userLabel: options.userLabel ?? rule.userLabel,
          })
          return
        }
      }
    }
    // No matching rule, create new
    await db.merchantRules.add({
      merchantPattern: pattern,
      categoryId,
      useCount: 1,
      amount: options.amount,
      userLabel: options.userLabel,
    })
    return
  }

  const existing = await db.merchantRules.where('merchantPattern').equals(pattern).first()
  if (existing) {
    await db.merchantRules.update(existing.id!, {
      categoryId,
      useCount: existing.useCount + 1,
      ...(options?.userLabel ? { userLabel: options.userLabel } : {}),
    })
  } else {
    await db.merchantRules.add({
      merchantPattern: pattern,
      categoryId,
      useCount: 1,
      ...(options?.userLabel ? { userLabel: options.userLabel } : {}),
    })
  }
}
