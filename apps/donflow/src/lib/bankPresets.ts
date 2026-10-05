export interface BankPreset {
  name: string
  color: string
  icon: string
}

export const BANK_PRESETS: Record<string, BankPreset> = {
  '카카오뱅크': { name: '카카오뱅크', color: '#FEE500', icon: '🟡' },
  '토스뱅크': { name: '토스뱅크', color: '#0064FF', icon: '🔵' },
  '신한은행': { name: '신한은행', color: '#0046FF', icon: '💙' },
  '국민은행': { name: '국민은행', color: '#F7B600', icon: '⭐' },
  '우리은행': { name: '우리은행', color: '#0066B3', icon: '🏦' },
  '하나은행': { name: '하나은행', color: '#009B8D', icon: '💚' },
  'NH농협': { name: 'NH농협', color: '#02A651', icon: '🌾' },
  'IBK기업': { name: 'IBK기업', color: '#004B9C', icon: '🏢' },
  '케이뱅크': { name: '케이뱅크', color: '#FF6B35', icon: '🟠' },
  '신한카드': { name: '신한카드', color: '#0046FF', icon: '💳' },
  '삼성카드': { name: '삼성카드', color: '#034EA2', icon: '💳' },
  '현대카드': { name: '현대카드', color: '#000000', icon: '💳' },
  '국민카드': { name: '국민카드', color: '#F7B600', icon: '💳' },
  'BC카드': { name: 'BC카드', color: '#F04E3E', icon: '💳' },
  '롯데카드': { name: '롯데카드', color: '#E60012', icon: '💳' },
  '하나카드': { name: '하나카드', color: '#009B8D', icon: '💳' },
  '우리카드': { name: '우리카드', color: '#0066B3', icon: '💳' },
}

export function getBankPreset(bankName: string): BankPreset | undefined {
  return BANK_PRESETS[bankName]
}
