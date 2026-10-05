import Dexie, { type EntityTable } from 'dexie'
import { getLang } from '../lib/i18n'

export interface Account {
  id?: number
  name: string
  type: 'checking' | 'savings' | 'credit_card' | 'debit_card' | 'investment' | 'cash'
  bankName: string
  balance: number
  color: string
  icon: string
  displayOrder: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Transaction {
  id?: number
  accountId: number
  amount: number
  type: 'income' | 'expense' | 'transfer'
  categoryId: number
  merchantName: string
  date: Date
  memo: string
  source: 'manual' | 'csv'
  csvHash?: string
  createdAt: Date
  updatedAt: Date
}

export interface Category {
  id?: number
  name: string
  icon: string
  color: string
  isIncome: boolean
  isDefault: boolean
  displayOrder: number
  groupName?: string
}

export interface Budget {
  id?: number
  categoryId: number
  amount: number
  month: string // YYYY-MM
}

export interface SalaryAllocation {
  id?: number
  accountId: number
  name: string
  type: 'percentage' | 'fixed'
  value: number
  displayOrder: number
}

export interface MerchantRule {
  id?: number
  merchantPattern: string
  categoryId: number
  useCount: number
  amount?: number
  userLabel?: string
}

export interface AppSettings {
  id?: number
  key: string
  value: string
}

export interface RecurringItem {
  id?: number
  name: string
  amount: number
  type: 'income' | 'expense'
  frequency: 'monthly' | 'weekly' | 'yearly'
  dayOfMonth?: number
  categoryId?: number
  accountId?: number
  isActive: boolean
  lastAmount?: number
  createdAt: Date
  updatedAt: Date
}

export interface ChangeAlert {
  id?: number
  type: 'price_change' | 'new_recurring' | 'income_change' | 'maturity'
  title: string
  description: string
  oldAmount?: number
  newAmount?: number
  recurringId?: number
  isResolved: boolean
  suggestedAction?: string
  createdAt: Date
}

export interface MonthlyIncome {
  id?: number
  yearMonth: string
  amount: number
}

export interface Insight {
  id?: number
  type: 'trend' | 'anomaly' | 'tip'
  title: string
  description: string
  categoryId?: number
  month: string
  isRead: boolean
  createdAt: Date
}

class DonFlowDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  categories!: EntityTable<Category, 'id'>
  budgets!: EntityTable<Budget, 'id'>
  salaryAllocations!: EntityTable<SalaryAllocation, 'id'>
  merchantRules!: EntityTable<MerchantRule, 'id'>
  appSettings!: EntityTable<AppSettings, 'id'>
  recurringItems!: EntityTable<RecurringItem, 'id'>
  changeAlerts!: EntityTable<ChangeAlert, 'id'>
  monthlyIncomes!: EntityTable<MonthlyIncome, 'id'>
  insights!: EntityTable<Insight, 'id'>

  constructor() {
    super('OjjudaDonFlow-' + window.ojjudaLedger.owner)
    this.version(2).stores({
      accounts: '++id, name, type, isActive, displayOrder',
      transactions: '++id, accountId, categoryId, date, type, csvHash',
      categories: '++id, name, isIncome, isDefault, displayOrder',
      budgets: '++id, categoryId, month, [categoryId+month]',
      salaryAllocations: '++id, accountId, displayOrder',
      merchantRules: '++id, merchantPattern',
      appSettings: '++id, &key',
    })
    this.version(3).stores({
      accounts: '++id, name, type, isActive, displayOrder',
      transactions: '++id, accountId, categoryId, date, type, csvHash',
      categories: '++id, name, isIncome, isDefault, displayOrder',
      budgets: '++id, categoryId, month, [categoryId+month]',
      salaryAllocations: '++id, accountId, displayOrder',
      merchantRules: '++id, merchantPattern',
      appSettings: '++id, &key',
      recurringItems: '++id, name, type, isActive',
      changeAlerts: '++id, type, isResolved, createdAt',
      insights: '++id, type, month, isRead',
    })
    this.version(4).stores({
      accounts: '++id, name, type, isActive, displayOrder',
      transactions: '++id, accountId, categoryId, date, type, csvHash',
      categories: '++id, name, isIncome, isDefault, displayOrder',
      budgets: '++id, categoryId, month, [categoryId+month]',
      salaryAllocations: '++id, accountId, displayOrder',
      merchantRules: '++id, merchantPattern',
      appSettings: '++id, &key',
      recurringItems: '++id, name, type, isActive',
      changeAlerts: '++id, type, isResolved, createdAt',
      insights: '++id, type, month, isRead',
      monthlyIncomes: '++id, &yearMonth',
    })
    this.version(5).stores({
      accounts: '++id, name, type, isActive, displayOrder',
      transactions: '++id, accountId, categoryId, date, type, csvHash',
      categories: '++id, name, isIncome, isDefault, displayOrder, groupName',
      budgets: '++id, categoryId, month, [categoryId+month]',
      salaryAllocations: '++id, accountId, displayOrder',
      merchantRules: '++id, merchantPattern',
      appSettings: '++id, &key',
      recurringItems: '++id, name, type, isActive',
      changeAlerts: '++id, type, isResolved, createdAt',
      insights: '++id, type, month, isRead',
      monthlyIncomes: '++id, &yearMonth',
    }).upgrade(tx => {
      // Migrate existing categories to have groupName
      const groupMap: Record<string, string> = {
        '주거': '고정비', '통신': '고정비', '보험': '고정비', '구독': '고정비', '교통': '고정비',
        '식비': '생활비', '카페': '생활비', '의료': '생활비', '교육': '생활비',
        '저축': '저축/투자',
        '쇼핑': '자유지출', '데이트': '자유지출', '경조사': '자유지출', '여행': '자유지출', '기타': '자유지출',
      }
      return tx.table('categories').toCollection().modify(cat => {
        if (!cat.groupName) {
          cat.groupName = groupMap[cat.name] ?? '자유지출'
        }
      })
    })
  }
}

export const db = new DonFlowDB()

// Seed default categories
export async function seedCategories() {
  const existing = await db.categories.toArray()
  if (existing.some(c => c.isDefault)) {
    // Deduplicate: remove duplicate categories by name, keeping the one with lowest id
    const seen = new Map<string, number>()
    const toDelete: number[] = []
    for (const cat of existing.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
      if (seen.has(cat.name)) {
        toDelete.push(cat.id!)
      } else {
        seen.set(cat.name, cat.id!)
      }
    }
    if (toDelete.length > 0) {
      // Remap transactions pointing to duplicate categories
      for (const dupId of toDelete) {
        const cat = existing.find(c => c.id === dupId)
        if (cat) {
          const keepId = seen.get(cat.name)!
          await db.transactions.where('categoryId').equals(dupId).modify({ categoryId: keepId })
          await db.budgets.where('categoryId').equals(dupId).delete()
        }
        await db.categories.delete(dupId)
      }
    }
    return
  }

  const isEN = getLang() !== 'ko'

  const categories = isEN ? [
    { name: 'Groceries', icon: '🍽️', color: '#EF4444', isIncome: false, isDefault: true, displayOrder: 1, groupName: 'Living' },
    { name: 'Coffee', icon: '☕', color: '#F97316', isIncome: false, isDefault: true, displayOrder: 2, groupName: 'Living' },
    { name: 'Transport', icon: '🚌', color: '#EAB308', isIncome: false, isDefault: true, displayOrder: 3, groupName: 'Fixed' },
    { name: 'Shopping', icon: '🛒', color: '#84CC16', isIncome: false, isDefault: true, displayOrder: 4, groupName: 'Discretionary' },
    { name: 'Housing', icon: '🏠', color: '#22C55E', isIncome: false, isDefault: true, displayOrder: 5, groupName: 'Fixed' },
    { name: 'Phone', icon: '📱', color: '#14B8A6', isIncome: false, isDefault: true, displayOrder: 6, groupName: 'Fixed' },
    { name: 'Subscriptions', icon: '🔄', color: '#06B6D4', isIncome: false, isDefault: true, displayOrder: 7, groupName: 'Fixed' },
    { name: 'Healthcare', icon: '🏥', color: '#3B82F6', isIncome: false, isDefault: true, displayOrder: 8, groupName: 'Living' },
    { name: 'Education', icon: '📚', color: '#6366F1', isIncome: false, isDefault: true, displayOrder: 9, groupName: 'Living' },
    { name: 'Going Out', icon: '💕', color: '#EC4899', isIncome: false, isDefault: true, displayOrder: 10, groupName: 'Discretionary' },
    { name: 'Gifts', icon: '🎁', color: '#F43F5E', isIncome: false, isDefault: true, displayOrder: 11, groupName: 'Discretionary' },
    { name: 'Travel', icon: '✈️', color: '#8B5CF6', isIncome: false, isDefault: true, displayOrder: 12, groupName: 'Discretionary' },
    { name: 'Insurance', icon: '🛡️', color: '#64748B', isIncome: false, isDefault: true, displayOrder: 13, groupName: 'Fixed' },
    { name: 'Savings', icon: '🏦', color: '#0EA5E9', isIncome: false, isDefault: true, displayOrder: 14, groupName: 'Savings' },
    { name: 'Salary', icon: '💰', color: '#10B981', isIncome: true, isDefault: true, displayOrder: 15, groupName: 'Income' },
    { name: 'Other', icon: '📌', color: '#6B7280', isIncome: false, isDefault: true, displayOrder: 16, groupName: 'Discretionary' },
  ] : [
    { name: '식비', icon: '🍚', color: '#EF4444', isIncome: false, isDefault: true, displayOrder: 1, groupName: '생활비' },
    { name: '카페', icon: '☕', color: '#F97316', isIncome: false, isDefault: true, displayOrder: 2, groupName: '생활비' },
    { name: '교통', icon: '🚌', color: '#EAB308', isIncome: false, isDefault: true, displayOrder: 3, groupName: '고정비' },
    { name: '쇼핑', icon: '🛒', color: '#84CC16', isIncome: false, isDefault: true, displayOrder: 4, groupName: '자유지출' },
    { name: '주거', icon: '🏠', color: '#22C55E', isIncome: false, isDefault: true, displayOrder: 5, groupName: '고정비' },
    { name: '통신', icon: '📱', color: '#14B8A6', isIncome: false, isDefault: true, displayOrder: 6, groupName: '고정비' },
    { name: '구독', icon: '🔄', color: '#06B6D4', isIncome: false, isDefault: true, displayOrder: 7, groupName: '고정비' },
    { name: '의료', icon: '🏥', color: '#3B82F6', isIncome: false, isDefault: true, displayOrder: 8, groupName: '생활비' },
    { name: '교육', icon: '📚', color: '#6366F1', isIncome: false, isDefault: true, displayOrder: 9, groupName: '생활비' },
    { name: '데이트', icon: '💕', color: '#EC4899', isIncome: false, isDefault: true, displayOrder: 10, groupName: '자유지출' },
    { name: '경조사', icon: '🎁', color: '#F43F5E', isIncome: false, isDefault: true, displayOrder: 11, groupName: '자유지출' },
    { name: '여행', icon: '✈️', color: '#8B5CF6', isIncome: false, isDefault: true, displayOrder: 12, groupName: '자유지출' },
    { name: '보험', icon: '🛡️', color: '#64748B', isIncome: false, isDefault: true, displayOrder: 13, groupName: '고정비' },
    { name: '저축', icon: '🏦', color: '#0EA5E9', isIncome: false, isDefault: true, displayOrder: 14, groupName: '저축/투자' },
    { name: '급여', icon: '💰', color: '#10B981', isIncome: true, isDefault: true, displayOrder: 15, groupName: '수입' },
    { name: '기타', icon: '📌', color: '#6B7280', isIncome: false, isDefault: true, displayOrder: 16, groupName: '자유지출' },
  ]

  await db.categories.bulkAdd(categories)
}
