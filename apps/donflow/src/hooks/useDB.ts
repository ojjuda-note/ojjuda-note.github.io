import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { getMonthRange } from '@/lib/utils'

export function useCategories() {
  return useLiveQuery(() => db.categories.toArray().then(a => a.sort((x, y) => x.displayOrder - y.displayOrder))) ?? []
}

export function useTransactions(monthKey?: string) {
  return useLiveQuery(() => {
    if (monthKey) {
      const { start, end } = getMonthRange(monthKey)
      return db.transactions.where('date').between(start, end, true, true).reverse().sortBy('date')
    }
    return db.transactions.orderBy('date').reverse().toArray()
  }, [monthKey]) ?? []
}

export function useBudgets(month: string) {
  return useLiveQuery(() => db.budgets.where('month').equals(month).toArray(), [month]) ?? []
}

export function useMonthlyStats(monthKey: string) {
  const transactions = useTransactions(monthKey)
  const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
  const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
  return { income, expense, transactions }
}

export function useBudgetComparison(monthKey: string) {
  const transactions = useTransactions(monthKey)
  const budgets = useBudgets(monthKey)
  const categories = useCategories()

  const expenseByCategory = new Map<number, number>()
  transactions.filter(t => t.type === 'expense').forEach(t => {
    expenseByCategory.set(t.categoryId, (expenseByCategory.get(t.categoryId) ?? 0) + t.amount)
  })

  return budgets.map(b => {
    const cat = categories.find(c => c.id === b.categoryId)
    const actual = expenseByCategory.get(b.categoryId) ?? 0
    const diff = actual - b.amount
    return {
      categoryId: b.categoryId,
      categoryName: cat?.name ?? '?',
      categoryIcon: cat?.icon ?? '📌',
      categoryColor: cat?.color ?? '#6B7280',
      planned: b.amount,
      actual,
      diff,
      percentage: b.amount > 0 ? Math.round((actual / b.amount) * 100) : 0,
    }
  }).sort((a, b) => b.percentage - a.percentage)
}

export function useMonthlyTrend(months: number = 6) {
  return useLiveQuery(async () => {
    const now = new Date()
    const results: { month: string; label: string; income: number; expense: number }[] = []
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const { start, end } = getMonthRange(key)
      const txs = await db.transactions.where('date').between(start, end, true, true).toArray()
      const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      results.push({
        month: key,
        label: `${d.getMonth() + 1}${d.getFullYear() === now.getFullYear() ? '' : `/${d.getFullYear() % 100}`}`,
        income,
        expense,
      })
    }
    return results
  }, [months]) ?? []
}

export function useMonthlySalary() {
  return useLiveQuery(async () => {
    const setting = await db.appSettings.where('key').equals('monthlySalary').first()
    return setting ? Number(setting.value) : 0
  }) ?? 0
}
