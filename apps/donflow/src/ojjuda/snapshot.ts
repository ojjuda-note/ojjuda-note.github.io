import { db } from '@/db'
export const tableNames = ['accounts','transactions','categories','budgets','salaryAllocations','merchantRules','appSettings','recurringItems','changeAlerts','monthlyIncomes','insights'] as const
export type Snapshot = { version: number; tables: Record<string, any[]> }
const dateFields = ['date','createdAt','updatedAt']
export function validateSnapshot(value: unknown): Snapshot {
  const data = value as Snapshot
  if (!data || data.version !== 1 || !data.tables || !Array.isArray(data.tables.transactions) || !Array.isArray(data.tables.categories)) throw Error('잘못된 백업 파일이에요.')
  const tables: Snapshot['tables'] = {}
  for (const name of tableNames) {
    const rows = data.tables[name] ?? []
    if (!Array.isArray(rows)) throw Error('잘못된 백업 파일이에요.')
    const ids = new Set<number>()
    tables[name] = rows.map(row => {
      if (!row || !Number.isSafeInteger(row.id) || row.id < 1 || ids.has(row.id)) throw Error('잘못된 기록이에요.')
      ids.add(row.id)
      const out = {...row}
      for (const key of dateFields) if (out[key] != null) {
        const d = new Date(out[key]); if (!Number.isFinite(d.getTime())) throw Error('날짜를 확인해 주세요.'); out[key] = d
      }
      if (name === 'transactions' && (!(out.date instanceof Date) || !Number.isFinite(out.amount) || out.amount <= 0 || out.amount > 999999999999 || !['expense','income','transfer'].includes(out.type))) throw Error('거래 내역을 확인해 주세요.')
      return out
    })
  }
  return {version: 1, tables}
}
export async function snapshot(): Promise<Snapshot> {
  return db.transaction('r', db.tables, async () => {
    const tables: Snapshot['tables'] = {}
    for (const name of tableNames) tables[name] = await db.table(name).toArray()
    return {version: 1, tables}
  })
}
export async function restore(value: unknown) {
  const data = validateSnapshot(value)
  await db.transaction('rw', db.tables, async () => {
    for (const name of tableNames) { await db.table(name).clear(); await db.table(name).bulkAdd(data.tables[name]) }
  })
}
