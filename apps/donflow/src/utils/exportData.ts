import { validateSnapshot, restore, snapshot } from '@/ojjuda/snapshot'
import { db } from '@/db'

export interface ImportResult {
  success: boolean
  tables: Record<string, number>
  error?: string
}

export async function importJSON(file: File): Promise<ImportResult> {
  try {
    if (file.size > 20 * 1024 * 1024) throw Error('백업 파일이 너무 커요.')
    const data = validateSnapshot(JSON.parse(await file.text()))
    await restore(data)
    return {success:true,tables:Object.fromEntries(Object.entries(data.tables).map(([name,rows])=>[name,rows.length]))}
  } catch(e) {return {success:false,tables:{},error:e instanceof Error ? e.message : '복원 실패'}}
}

function getDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function exportJSON() {
  const data = await snapshot()
  const blob = new Blob([JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'})
  downloadFile(blob,`donflow-backup-${getDateString()}.json`)
}

function escapeCsv(value: string): string {
  if (/^[=+@\t\r-]/.test(value)) value = "'" + value
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export async function exportCSV() {
  const [transactions, categories] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
  ])

  const categoryMap = new Map(categories.map(c => [c.id!, c.name]))

  const header = 'date,amount,type,merchantName,categoryName,memo'
  const rows = transactions.map(tx => {
    const date = tx.date instanceof Date ? `${tx.date.getFullYear()}-${String(tx.date.getMonth()+1).padStart(2,'0')}-${String(tx.date.getDate()).padStart(2,'0')}` : String(tx.date)
    const categoryName = categoryMap.get(tx.categoryId) ?? ''
    return [
      date,
      String(tx.amount),
      tx.type,
      escapeCsv(tx.merchantName || ''),
      escapeCsv(categoryName),
      escapeCsv(tx.memo || ''),
    ].join(',')
  })

  const csv = [header, ...rows].join('\n')
  const bom = '\uFEFF'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' })
  downloadFile(blob, `donflow-transactions-${getDateString()}.csv`)
}
