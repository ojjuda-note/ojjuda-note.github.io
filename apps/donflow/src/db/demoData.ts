import { db, seedCategories } from './index'
import type { Account, Transaction, Category, Budget, MonthlyIncome } from './index'
import { getLang } from '@/lib/i18n'

function getRecentMonths(): [string, string] {
  const now = new Date()
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  return [prevKey, cur]
}

function randomDate(yearMonth: string, preferDay?: number): Date {
  const [y, m] = yearMonth.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const day = preferDay ? Math.min(preferDay, daysInMonth) : Math.floor(Math.random() * daysInMonth) + 1
  const hour = Math.floor(Math.random() * 14) + 8
  return new Date(y, m - 1, day, hour, Math.floor(Math.random() * 60))
}

// ─── Locale-aware demo data ───

interface DemoLocale {
  categories: Omit<Category, 'id'>[]
  budgetMap: Record<string, number>
  txTemplates: TxTemplate[]
  salary: number
  salaryMerchant: string
  salaryMemo: string
  accountName: string
  accountBank: string
  incomeCatName: string
}

interface TxTemplate {
  category: string
  merchant: string
  minAmt: number
  maxAmt: number
  fixedDay?: number
}

const KO_LOCALE: DemoLocale = {
  categories: [
    { name: '월세', icon: '🏠', color: '#22C55E', isIncome: false, isDefault: false, displayOrder: 1, groupName: '고정비' },
    { name: '통신/구독', icon: '📱', color: '#8B5CF6', isIncome: false, isDefault: false, displayOrder: 2, groupName: '고정비' },
    { name: '교통', icon: '🚌', color: '#EAB308', isIncome: false, isDefault: false, displayOrder: 3, groupName: '고정비' },
    { name: '식비', icon: '🍽️', color: '#EF4444', isIncome: false, isDefault: false, displayOrder: 4, groupName: '생활비' },
    { name: '생필품', icon: '🧴', color: '#14B8A6', isIncome: false, isDefault: false, displayOrder: 5, groupName: '생활비' },
    { name: '의류', icon: '👕', color: '#F97316', isIncome: false, isDefault: false, displayOrder: 6, groupName: '생활비' },
    { name: '데이트', icon: '💕', color: '#EC4899', isIncome: false, isDefault: false, displayOrder: 7, groupName: '생활비' },
    { name: '저축/투자', icon: '🏦', color: '#0EA5E9', isIncome: false, isDefault: false, displayOrder: 8, groupName: '저축' },
    { name: '기타', icon: '📦', color: '#6B7280', isIncome: false, isDefault: false, displayOrder: 9, groupName: '생활비' },
    { name: '급여', icon: '💰', color: '#10B981', isIncome: true, isDefault: false, displayOrder: 10, groupName: '수입' },
  ],
  budgetMap: {
    '월세': 350000, '통신/구독': 90000, '교통': 70000, '식비': 300000,
    '생필품': 50000, '의류': 50000, '데이트': 400000, '저축/투자': 1500000, '기타': 100000,
  },
  txTemplates: [
    { category: '월세', merchant: '월세 이체', minAmt: 300000, maxAmt: 350000, fixedDay: 5 },
    { category: '통신/구독', merchant: 'SKT 휴대폰', minAmt: 67140, maxAmt: 67140, fixedDay: 25 },
    { category: '통신/구독', merchant: '네이버플러스 멤버십', minAmt: 4900, maxAmt: 4900, fixedDay: 20 },
    { category: '통신/구독', merchant: '유튜브 프리미엄', minAmt: 14900, maxAmt: 14900, fixedDay: 5 },
    { category: '통신/구독', merchant: '벅스 음악', minAmt: 7590, maxAmt: 7590, fixedDay: 15 },
    { category: '교통', merchant: '버스 출퇴근', minAmt: 2900, maxAmt: 2900 },
    { category: '교통', merchant: '카카오T 바이크', minAmt: 3000, maxAmt: 5000 },
    { category: '식비', merchant: '풀무원 정기배송', minAmt: 210000, maxAmt: 210000, fixedDay: 1 },
    { category: '식비', merchant: '하나마트', minAmt: 8000, maxAmt: 25000 },
    { category: '식비', merchant: '원마트', minAmt: 15000, maxAmt: 50000 },
    { category: '식비', merchant: '삼평마트', minAmt: 10000, maxAmt: 48000 },
    { category: '식비', merchant: '신세계할인마트', minAmt: 5000, maxAmt: 15000 },
    { category: '식비', merchant: '편의점 CU', minAmt: 2000, maxAmt: 8000 },
    { category: '식비', merchant: '배달의민족', minAmt: 15000, maxAmt: 30000 },
    { category: '생필품', merchant: '다이소', minAmt: 2000, maxAmt: 10000 },
    { category: '생필품', merchant: '올리브영', minAmt: 15000, maxAmt: 35000 },
    { category: '의류', merchant: '유니클로', minAmt: 20000, maxAmt: 60000 },
    { category: '의류', merchant: '무신사', minAmt: 15000, maxAmt: 50000 },
    { category: '데이트', merchant: '카페', minAmt: 8000, maxAmt: 15000 },
    { category: '데이트', merchant: '영화관 CGV', minAmt: 24000, maxAmt: 30000 },
    { category: '데이트', merchant: '레스토랑', minAmt: 30000, maxAmt: 80000 },
    { category: '데이트', merchant: '편의점 간식', minAmt: 5000, maxAmt: 15000 },
    { category: '저축/투자', merchant: '나무증권 RP 자유약정', minAmt: 500000, maxAmt: 500000, fixedDay: 24 },
    { category: '저축/투자', merchant: '케이뱅크 파킹통장', minAmt: 1000000, maxAmt: 1000000, fixedDay: 26 },
    { category: '기타', merchant: '카카오페이 이체', minAmt: 10000, maxAmt: 30000 },
    { category: '기타', merchant: '모바일이즐 선불', minAmt: 10000, maxAmt: 15000 },
  ],
  salary: 5000000,
  salaryMerchant: '급여 입금',
  salaryMemo: '월급',
  accountName: '직장인우대통장',
  accountBank: '하나은행',
  incomeCatName: '급여',
}

const EN_LOCALE: DemoLocale = {
  categories: [
    { name: 'Rent', icon: '🏠', color: '#22C55E', isIncome: false, isDefault: false, displayOrder: 1, groupName: 'Fixed' },
    { name: 'Subscriptions', icon: '📱', color: '#8B5CF6', isIncome: false, isDefault: false, displayOrder: 2, groupName: 'Fixed' },
    { name: 'Transport', icon: '🚌', color: '#EAB308', isIncome: false, isDefault: false, displayOrder: 3, groupName: 'Fixed' },
    { name: 'Groceries', icon: '🍽️', color: '#EF4444', isIncome: false, isDefault: false, displayOrder: 4, groupName: 'Living' },
    { name: 'Household', icon: '🧴', color: '#14B8A6', isIncome: false, isDefault: false, displayOrder: 5, groupName: 'Living' },
    { name: 'Clothing', icon: '👕', color: '#F97316', isIncome: false, isDefault: false, displayOrder: 6, groupName: 'Living' },
    { name: 'Going Out', icon: '💕', color: '#EC4899', isIncome: false, isDefault: false, displayOrder: 7, groupName: 'Living' },
    { name: 'Savings', icon: '🏦', color: '#0EA5E9', isIncome: false, isDefault: false, displayOrder: 8, groupName: 'Savings' },
    { name: 'Other', icon: '📦', color: '#6B7280', isIncome: false, isDefault: false, displayOrder: 9, groupName: 'Living' },
    { name: 'Salary', icon: '💰', color: '#10B981', isIncome: true, isDefault: false, displayOrder: 10, groupName: 'Income' },
  ],
  budgetMap: {
    'Rent': 1200, 'Subscriptions': 80, 'Transport': 150, 'Groceries': 500,
    'Household': 80, 'Clothing': 100, 'Going Out': 400, 'Savings': 1200, 'Other': 100,
  },
  txTemplates: [
    { category: 'Rent', merchant: 'Rent Payment', minAmt: 1150, maxAmt: 1200, fixedDay: 1 },
    { category: 'Subscriptions', merchant: 'T-Mobile', minAmt: 35, maxAmt: 35, fixedDay: 15 },
    { category: 'Subscriptions', merchant: 'Spotify', minAmt: 11, maxAmt: 11, fixedDay: 20 },
    { category: 'Subscriptions', merchant: 'YouTube Premium', minAmt: 14, maxAmt: 14, fixedDay: 5 },
    { category: 'Subscriptions', merchant: 'iCloud+', minAmt: 3, maxAmt: 3, fixedDay: 10 },
    { category: 'Transport', merchant: 'Metro Card', minAmt: 3, maxAmt: 3 },
    { category: 'Transport', merchant: 'Uber', minAmt: 8, maxAmt: 22 },
    { category: 'Groceries', merchant: 'Trader Joe\'s', minAmt: 25, maxAmt: 80, fixedDay: 1 },
    { category: 'Groceries', merchant: 'Whole Foods', minAmt: 15, maxAmt: 65 },
    { category: 'Groceries', merchant: 'Costco', minAmt: 40, maxAmt: 120 },
    { category: 'Groceries', merchant: 'Target', minAmt: 10, maxAmt: 45 },
    { category: 'Groceries', merchant: 'Local Deli', minAmt: 8, maxAmt: 18 },
    { category: 'Groceries', merchant: '7-Eleven', minAmt: 3, maxAmt: 12 },
    { category: 'Groceries', merchant: 'DoorDash', minAmt: 18, maxAmt: 40 },
    { category: 'Household', merchant: 'Amazon', minAmt: 8, maxAmt: 35 },
    { category: 'Household', merchant: 'CVS', minAmt: 10, maxAmt: 30 },
    { category: 'Clothing', merchant: 'Uniqlo', minAmt: 25, maxAmt: 80 },
    { category: 'Clothing', merchant: 'H&M', minAmt: 20, maxAmt: 60 },
    { category: 'Going Out', merchant: 'Coffee Shop', minAmt: 5, maxAmt: 8 },
    { category: 'Going Out', merchant: 'AMC Theaters', minAmt: 16, maxAmt: 28 },
    { category: 'Going Out', merchant: 'Restaurant', minAmt: 25, maxAmt: 75 },
    { category: 'Going Out', merchant: 'Bar & Grill', minAmt: 15, maxAmt: 45 },
    { category: 'Savings', merchant: 'Vanguard Transfer', minAmt: 500, maxAmt: 500, fixedDay: 24 },
    { category: 'Savings', merchant: 'HYSA Deposit', minAmt: 700, maxAmt: 700, fixedDay: 26 },
    { category: 'Other', merchant: 'Venmo Transfer', minAmt: 10, maxAmt: 40 },
    { category: 'Other', merchant: 'Parking Meter', minAmt: 3, maxAmt: 8 },
  ],
  salary: 4000,
  salaryMerchant: 'Payroll Deposit',
  salaryMemo: 'Monthly salary',
  accountName: 'Main Checking',
  accountBank: 'Chase',
  incomeCatName: 'Salary',
}

function getDemoLocale(): DemoLocale {
  return getLang() === 'ko' ? KO_LOCALE : EN_LOCALE
}

function pickAmount(min: number, max: number): number {
  if (min === max) return min
  return Math.round(Math.random() * (max - min) + min)
}

export async function loadDemoData(): Promise<void> {
  await clearDemoData()

  const now = new Date()
  const locale = getDemoLocale()
  const commuteMerchant = locale === KO_LOCALE ? '버스 출퇴근' : 'Metro Card'
  const commuteAmt = locale === KO_LOCALE ? 2900 : 3
  const goingOutCat = locale === KO_LOCALE ? '데이트' : 'Going Out'
  const transportCat = locale === KO_LOCALE ? '교통' : 'Transport'

  // 1. Create account
  const accountId = await db.accounts.add({
    name: locale.accountName,
    type: 'checking',
    bankName: locale.accountBank,
    balance: locale === KO_LOCALE ? 500000 : 2500,
    color: '#3B82F6',
    icon: '🏦',
    displayOrder: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  } as Account) as number

  // 2. Create categories
  const catIds: Record<string, number> = {}
  for (const cat of locale.categories) {
    const id = await db.categories.add(cat as Category) as number
    catIds[cat.name] = id
  }

  // 3. Two months of budgets + transactions
  const [prevMonth, curMonth] = getRecentMonths()

  for (const month of [prevMonth, curMonth]) {
    // Budgets
    for (const [catName, amount] of Object.entries(locale.budgetMap)) {
      await db.budgets.add({
        categoryId: catIds[catName],
        amount,
        month,
      } as Budget)
    }

    // Salary income
    await db.transactions.add({
      accountId,
      amount: locale.salary,
      type: 'income',
      categoryId: catIds[locale.incomeCatName],
      merchantName: locale.salaryMerchant,
      date: randomDate(month, 25),
      memo: locale.salaryMemo,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    } as Transaction)

    const isCurrent = month === curMonth
    const txList: Omit<Transaction, 'id'>[] = []

    // Fixed transactions (monthly auto-pay)
    const fixedTx = locale.txTemplates.filter(t => t.fixedDay)
    for (const tpl of fixedTx) {
      txList.push({
        accountId,
        amount: pickAmount(tpl.minAmt, tpl.maxAmt),
        type: 'expense',
        categoryId: catIds[tpl.category],
        merchantName: tpl.merchant,
        date: randomDate(month, tpl.fixedDay),
        memo: '',
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      })
    }

    // Variable transactions
    const variableTx = locale.txTemplates.filter(t => !t.fixedDay)
    const variableCount = isCurrent ? 12 : 18

    // Commute (workdays)
    const workDays = isCurrent ? 12 : 20
    for (let d = 0; d < workDays; d++) {
      txList.push({
        accountId,
        amount: commuteAmt,
        type: 'expense',
        categoryId: catIds[transportCat],
        merchantName: commuteMerchant,
        date: randomDate(month),
        memo: '',
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      })
    }

    // Random variable transactions
    let count = 0
    while (count < variableCount) {
      const idx = Math.floor(Math.random() * variableTx.length)
      const tpl = variableTx[idx]
      if (tpl.merchant === commuteMerchant) continue // already added

      // This month: going out spending a bit over budget
      let amt = pickAmount(tpl.minAmt, tpl.maxAmt)
      if (isCurrent && tpl.category === goingOutCat) {
        amt = Math.round(amt * 1.3)
      }

      txList.push({
        accountId,
        amount: amt,
        type: 'expense',
        categoryId: catIds[tpl.category],
        merchantName: tpl.merchant,
        date: randomDate(month),
        memo: '',
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      })
      count++
    }

    await db.transactions.bulkAdd(txList as Transaction[])
  }

  // 4. Monthly income records
  for (const month of [prevMonth, curMonth]) {
    await db.monthlyIncomes.add({ yearMonth: month, amount: locale.salary } as MonthlyIncome)
  }

  // 5. Salary setting
  await db.appSettings.add({ key: 'monthlySalary', value: String(locale.salary) })

  // 6. Demo flag
  await db.appSettings.add({ key: 'isDemoData', value: 'true' })
}

export async function clearDemoData(): Promise<void> {
  await db.transactions.clear()
  await db.budgets.clear()
  await db.accounts.clear()
  await db.categories.clear()
  await db.monthlyIncomes.clear()
  await db.salaryAllocations.clear()
  await db.merchantRules.clear()
  await db.recurringItems.clear()
  await db.changeAlerts.clear()
  await db.insights.clear()

  for (const key of ['isDemoData', 'monthlySalary']) {
    const setting = await db.appSettings.where('key').equals(key).first()
    if (setting?.id) await db.appSettings.delete(setting.id)
  }

  await seedCategories()
}

export async function isDemoLoaded(): Promise<boolean> {
  const setting = await db.appSettings.where('key').equals('isDemoData').first()
  return setting?.value === 'true'
}
