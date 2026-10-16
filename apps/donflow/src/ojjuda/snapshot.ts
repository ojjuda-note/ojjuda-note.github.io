import { db } from '@/db'
export const tableNames = ['accounts','transactions','categories','budgets','salaryAllocations','merchantRules','appSettings','recurringItems','changeAlerts','monthlyIncomes','insights'] as const
export type Snapshot = { version: number; tables: Record<string, Record<string, unknown>[]> }
const dateFields = ['date','createdAt','updatedAt']
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function validateSnapshot(value: unknown): Snapshot {
  const data = value
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.tables) || !Array.isArray(data.tables.transactions) || !Array.isArray(data.tables.categories)) throw Error('잘못된 백업 파일이에요.')
  const tables: Snapshot['tables'] = {}
  for (const name of tableNames) {
    const rows = data.tables[name] ?? []
    if (!Array.isArray(rows)) throw Error('잘못된 백업 파일이에요.')
    const ids = new Set<number>()
    tables[name] = rows.map(row => {
      if (!isRecord(row) || typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id < 1 || ids.has(row.id)) throw Error('잘못된 기록이에요.')
      ids.add(row.id)
      const out = {...row}
      for (const key of dateFields) if (out[key] != null) {
        const rawDate = out[key]
        if (!(rawDate instanceof Date) && typeof rawDate !== 'string' && typeof rawDate !== 'number') throw Error('날짜를 확인해 주세요.')
        const d = new Date(rawDate); if (!Number.isFinite(d.getTime())) throw Error('날짜를 확인해 주세요.'); out[key] = d
      }
      if (name === 'transactions' && (!(out.date instanceof Date) || typeof out.amount !== 'number' || !Number.isFinite(out.amount) || out.amount <= 0 || out.amount > 999999999999 || (out.type !== 'expense' && out.type !== 'income' && out.type !== 'transfer'))) throw Error('거래 내역을 확인해 주세요.')
      return out
    })
  }
  return {version: 1, tables}
}
export async function snapshot(): Promise<Snapshot> {
  return db.transaction('r', db.tables, async () => {
    const tables: Snapshot['tables'] = {}
    for (const name of tableNames) tables[name] = await db.table<Record<string, unknown>, number>(name).toArray()
    return {version: 1, tables}
  })
}
export async function restore(value: unknown) {
  const data = validateSnapshot(value)
  await db.transaction('rw', db.tables, async () => {
    for (const name of tableNames) { await db.table(name).clear(); await db.table(name).bulkAdd(data.tables[name]) }
  })
}
