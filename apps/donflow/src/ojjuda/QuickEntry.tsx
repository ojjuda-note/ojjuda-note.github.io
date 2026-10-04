import { useState, useEffect, type FormEvent } from 'react'
import { db, type Transaction } from '@/db'
import { useCategories } from '@/hooks/useDB'
import { ensureDefaultWallet } from '@/lib/defaultWallet'
import { Button } from '@/components/ui/button'
const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const draftKey = 'ojjuda-donflow-draft-' + window.ojjudaLedger.owner
function readDraft() {try{return JSON.parse(sessionStorage.getItem(draftKey)||'{}')}catch{return {}}}
export default function QuickEntry() {
  const [draft] = useState(readDraft)
  const categories = useCategories()
  const [editing,setEditing] = useState<Transaction|null>(draft.editing||null)
  const [date,setDate] = useState<string>(draft.date||day()), [type,setType] = useState<string>(draft.type||'expense'), [category,setCategory] = useState<string>(draft.category||'')
  const [memo,setMemo] = useState<string>(draft.memo||''), [amount,setAmount] = useState<string>(draft.amount||''), [busy,setBusy] = useState(false), [message,setMessage] = useState('')
  useEffect(()=>{sessionStorage.setItem(draftKey,JSON.stringify({date,type,category,memo,amount,editing}))},[date,type,category,memo,amount,editing])
  useEffect(()=>{ const edit = (event:Event) => {const tx = (event as CustomEvent<Transaction>).detail;setEditing(tx);setDate(day(new Date(tx.date)));setType(tx.type);setCategory(String(tx.categoryId));setMemo(tx.merchantName);setAmount(String(tx.amount));document.getElementById('quick-entry')?.scrollIntoView({behavior:'smooth'})};window.addEventListener('ojjuda-edit',edit);return()=>window.removeEventListener('ojjuda-edit',edit) },[])
  function clear() {setEditing(null);setMemo('');setAmount('')}
  async function save(e:FormEvent) {
    e.preventDefault(); if (busy || !window.ojjudaLedger.active()) return
    const n=Number(amount),d=new Date(date+'T12:00:00'),cat=Number(category)||categories.find(c=>c.name==='기타')?.id
    if (!Number.isSafeInteger(n)||n<=0||n>999999999999||!cat||!memo.trim()||!Number.isFinite(d.getTime())||day(d)!==date) {setMessage('날짜, 내용, 금액을 확인해 주세요.');return}
    setBusy(true)
    try {
      await db.transaction('rw',db.tables,async()=>{
        const values = {date:d,type:type as Transaction['type'],categoryId:cat,merchantName:memo.trim(),amount:n,updatedAt:new Date()}
        if (editing) {if (!await db.transactions.get(editing.id!)) throw Error('removed');await db.transactions.update(editing.id!,values)}
        else await db.transactions.add({...values,accountId:await ensureDefaultWallet(),memo:'',source:'manual',createdAt:new Date()})
      })
      clear();setMessage('기록했어요.')
    } catch {setMessage('저장하지 못했어요. 입력한 내용은 그대로 있어요.')}
    finally {setBusy(false)}
  }
  return <section className="rounded-xl border bg-card p-4 space-y-3" id="quick-entry">
    <h2 className="font-semibold">{editing?'기록 수정':'수입·지출 기록'}</h2>
    <form onSubmit={save} className="grid grid-cols-2 gap-3">
      <label className="text-xs">날짜<input className="oj-field" aria-label="날짜" type="date" value={date} min="1900-01-01" max="9998-12-31" required onChange={e=>setDate(e.target.value)} /></label>
      <label className="text-xs">수입·지출<select className="oj-field" aria-label="수입·지출" value={type} onChange={e=>setType(e.target.value)}><option value="expense">지출</option><option value="income">수입</option><option value="transfer">이체</option></select></label>
      <label className="text-xs">분류<select className="oj-field" aria-label="분류" value={category} onChange={e=>setCategory(e.target.value)}><option value="">기타</option>{categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></label>
      <label className="text-xs">금액<input className="oj-field" aria-label="금액" type="number" min="1" max="999999999999" step="1" inputMode="numeric" value={amount} required onChange={e=>setAmount(e.target.value)} placeholder="원" /></label>
      <label className="text-xs col-span-2">내용<input className="oj-field" aria-label="내용" maxLength={200} value={memo} required onChange={e=>setMemo(e.target.value)} placeholder="어디에 썼나요?" /></label>
      <Button type="submit" disabled={busy}>{editing?'수정 저장':'기록 저장'}</Button>{editing&&<Button type="button" variant="outline" onClick={clear}>수정 취소</Button>}
    </form><p role="status" className="text-xs">{message}</p>
  </section>
}
