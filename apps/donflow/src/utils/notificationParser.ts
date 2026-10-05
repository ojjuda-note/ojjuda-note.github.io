// Card notification SMS/push parser for Korean card companies

export interface ParsedTransaction {
  cardCompany: string
  amount: number
  merchantName: string
  date: Date
  rawText: string
}

const CARD_PATTERNS: Array<{
  regex: RegExp
  cardCompany: string
}> = [
  { regex: /\[삼성카드\]/, cardCompany: '삼성' },
  { regex: /\[KB국민카드\]/, cardCompany: 'KB' },
  { regex: /\[국민카드\]/, cardCompany: 'KB' },
  { regex: /\[현대카드\]/, cardCompany: '현대' },
  { regex: /\[신한카드\]/, cardCompany: '신한' },
  { regex: /\[우리카드\]/, cardCompany: '우리' },
  { regex: /\[하나카드\]/, cardCompany: '하나' },
  { regex: /\[롯데카드\]/, cardCompany: '롯데' },
  { regex: /\[BC카드\]/, cardCompany: 'BC' },
  { regex: /\[NH카드\]/, cardCompany: 'NH' },
  { regex: /\[NH농협카드\]/, cardCompany: 'NH' },
  { regex: /\[IBK카드\]/, cardCompany: 'IBK' },
  { regex: /\[카카오뱅크\]/, cardCompany: '카카오' },
  { regex: /\[토스\]/, cardCompany: '토스' },
]

// Amount pattern: handles comma-separated numbers followed by 원
const AMOUNT_RE = /([\d,]+)원/

// Date/time pattern: MM/DD HH:MM or MM-DD HH:MM or MM월DD일 HH:MM
const DATE_RE = /(\d{1,2})[\/\-월](\d{1,2})[일]?\s+(\d{1,2}):(\d{2})/

// Keywords to strip from merchant name
const STRIP_KEYWORDS = /^(승인|일시불|할부\d*개월?|체크|해외)\s*/g

function parseLine(line: string): ParsedTransaction | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Find card company
  let cardCompany = '기타'
  for (const { regex, cardCompany: cc } of CARD_PATTERNS) {
    if (regex.test(trimmed)) {
      cardCompany = cc
      break
    }
  }

  // Extract amount
  const amountMatch = trimmed.match(AMOUNT_RE)
  if (!amountMatch) return null
  const amount = parseInt(amountMatch[1].replace(/,/g, ''), 10)
  if (isNaN(amount) || amount <= 0) return null

  // Extract date
  const dateMatch = trimmed.match(DATE_RE)
  let date = new Date()
  if (dateMatch) {
    const month = parseInt(dateMatch[1], 10) - 1
    const day = parseInt(dateMatch[2], 10)
    const hour = parseInt(dateMatch[3], 10)
    const minute = parseInt(dateMatch[4], 10)
    date = new Date(date.getFullYear(), month, day, hour, minute)
    // If the parsed date is in the future, assume last year
    if (date > new Date()) {
      date.setFullYear(date.getFullYear() - 1)
    }
  }

  // Extract merchant name: everything between amount and date
  // Strategy: remove card company tag, remove amount+원, remove date, remove keywords, take what's left
  let remaining = trimmed
  // Remove card company bracket
  remaining = remaining.replace(/\[.*?\]\s*/, '')
  // Remove keywords
  remaining = remaining.replace(STRIP_KEYWORDS, '')
  // Remove amount
  remaining = remaining.replace(AMOUNT_RE, '')
  // Remove date/time
  remaining = remaining.replace(DATE_RE, '')
  // Clean up
  const merchantName = remaining.replace(/\s+/g, ' ').trim()

  if (!merchantName) return null

  return {
    cardCompany,
    amount,
    merchantName,
    date,
    rawText: trimmed,
  }
}

export function parseNotifications(text: string): ParsedTransaction[] {
  return text
    .split('\n')
    .map(parseLine)
    .filter((r): r is ParsedTransaction => r !== null)
}
