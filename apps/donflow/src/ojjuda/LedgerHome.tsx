import { useState } from 'react'
import { db, type Transaction } from '@/db'
import { useCategories, useMonthlyStats } from '@/hooks/useDB'
import { formatNumber, getMonthKey } from '@/lib/utils'
import QuickEntry from './QuickEntry'

export default function LedgerHome() {
  const [month, setMonth] = useState(() => getMonthKey(new Date()))
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(20)
  const [error, setError] = useState('')
  const { income, expense, transactions } = useMonthlyStats(month)
  const categories = useCategories()
  const [year, monthNumber] = month.split('-').map(Number)
  const filtered = transactions.filter(tx => `${tx.merchantName} ${tx.memo} ${categories.find(c => c.id === tx.categoryId)?.name || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.date.getTime() - a.date.getTime() || (b.id || 0) - (a.id || 0))
  function changeMonth(offset: number) {
    setMonth(getMonthKey(new Date(year, monthNumber - 1 + offset, 1)))
    setLimit(20)
  }
  async function remove(tx: Transaction) {
    if (!window.ojjudaLedger.active() || !confirm(`“${tx.merchantName}” ${formatNumber(tx.amount)}원 기록을 삭제할까요?`)) return
    try { await db.transactions.delete(tx.id!); setError('') }
    catch { setError('삭제하지 못했어요. 다시 시도해 주세요.') }
  }
  return <div className="space-y-4">
    <section className="oj-month-card" aria-label="월별 합계">
      <div className="flex justify-between items-center gap-2 mb-4">
        <button className="oj-small-button" aria-label="이전 달" onClick={() => changeMonth(-1)}>‹</button>
        <div className="text-center"><h2 className="font-bold text-lg">{year}년 {monthNumber}월</h2>{month !== getMonthKey(new Date()) && <button className="text-xs text-primary underline" onClick={() => {setMonth(getMonthKey(new Date()));setLimit(20)}}>이번 달로</button>}</div>
        <button className="oj-small-button" aria-label="다음 달" onClick={() => changeMonth(1)}>›</button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[["수입", income, 'text-income'], ["지출", expense, 'text-expense'], ["남은 금액", income - expense, '']].map(([label, amount, color]) => <div className="min-w-0" key={String(label)}><p className="text-xs text-muted-foreground mb-1">{label}</p><p className={`oj-total ${color}`}>{formatNumber(Number(amount))}<span className="text-xs font-normal">원</span></p></div>)}
      </div>
    </section>
    <QuickEntry onSaved={date => {setMonth(getMonthKey(date));setQuery('');setLimit(20)}} />
    <section className="space-y-3" aria-label="최근 내역">
      <div className="flex items-center justify-between"><h2 className="font-bold">최근 내역</h2><span className="text-xs text-muted-foreground">{monthNumber}월 · {transactions.length}건</span></div>
      {transactions.length > 0 && <input className="oj-field" type="search" aria-label="내역 검색" placeholder="내용이나 분류로 찾기" value={query} onChange={e => {setQuery(e.target.value);setLimit(20)}} />}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!filtered.length && <p className="oj-empty">{query ? '찾는 내역이 없어요.' : '아직 기록이 없어요. 위에서 첫 내역을 적어 보세요.'}</p>}
      <ul className="space-y-2">
        {filtered.slice(0, limit).map((tx, index) => {
          const category = categories.find(c => c.id === tx.categoryId)
          const dateLabel = tx.date.toLocaleDateString('ko-KR', {month:'long',day:'numeric',weekday:'short'})
          const previous = filtered[index - 1]
          const newDay = !previous || previous.date.toDateString() !== tx.date.toDateString()
          return <li key={tx.id}>
            {newDay && <p className="text-xs text-muted-foreground pt-3 pb-2">{dateLabel}</p>}
            <div className="oj-record">
              <span className="oj-record-icon" aria-hidden="true">{category?.icon || '📝'}</span>
              <button className="min-w-0 flex-1 text-left" aria-label={`${tx.merchantName} 수정`} onClick={() => window.dispatchEvent(new CustomEvent('ojjuda-edit',{detail:tx}))}>
                <span className="block truncate font-medium">{tx.merchantName}</span>
                <span className="text-xs text-muted-foreground">{category?.name || '기타'} · 눌러서 수정</span>
              </button>
              <span className={`oj-record-amount ${tx.type === 'income' ? 'text-income' : tx.type === 'expense' ? 'text-expense' : ''}`}><span className="text-[10px] block">{tx.type === 'income' ? '수입' : tx.type === 'expense' ? '지출' : '이체'}</span>{formatNumber(tx.amount)}원</span>
              <button className="oj-delete" aria-label={`${tx.merchantName} 삭제`} onClick={() => void remove(tx)}>×</button>
            </div>
          </li>
        })}
      </ul>
      {filtered.length > limit && <button className="oj-setting-link w-full justify-center" onClick={() => setLimit(n => n + 20)}>내역 더 보기 ({filtered.length - limit}건)</button>}
    </section>
  </div>
}
