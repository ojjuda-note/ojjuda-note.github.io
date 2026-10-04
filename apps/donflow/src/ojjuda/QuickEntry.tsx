import { useState, useEffect, useRef, type FormEvent } from 'react'
import { db, type Transaction } from '@/db'
import { useCategories } from '@/hooks/useDB'
import { ensureDefaultWallet } from '@/lib/defaultWallet'
import { Button } from '@/components/ui/button'
const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const draftKey = 'ojjuda-donflow-draft-' + window.ojjudaLedger.owner
function readDraft() {try{return JSON.parse(sessionStorage.getItem(draftKey)||'{}')}catch{return {}}}
export default function QuickEntry({ onSaved }: { onSaved?: (date: Date) => void }) {
  const details = useRef<HTMLDetailsElement>(null)
  const amountInput = useRef<HTMLInputElement>(null)
  const [draft] = useState(readDraft)
  const categories = useCategories()
  const [editing,setEditing] = useState<Transaction|null>(draft.editing||null)
  const [date,setDate] = useState<string>(draft.date||day()), [type,setType] = useState<string>(draft.type||'expense'), [category,setCategory] = useState<string>(draft.category||'')
  const [memo,setMemo] = useState<string>(draft.memo||''), [amount,setAmount] = useState<string>(draft.amount||''), [busy,setBusy] = useState(false), [message,setMessage] = useState('')
  useEffect(()=>{sessionStorage.setItem(draftKey,JSON.stringify({date,type,category,memo,amount,editing}))},[date,type,category,memo,amount,editing])
  useEffect(()=>{ const edit = (event:Event) => {const tx = (event as CustomEvent<Transaction>).detail;setEditing(tx);setDate(day(new Date(tx.date)));setType(tx.type);setCategory(String(tx.categoryId));setMemo(tx.merchantName);setAmount(String(tx.amount));if(details.current)details.current.open=true;amountInput.current?.focus({preventScroll:true});document.getElementById('quick-entry')?.scrollIntoView({behavior:'smooth'})};window.addEventListener('ojjuda-edit',edit);return()=>window.removeEventListener('ojjuda-edit',edit) },[])
  function clear() {setEditing(null);setMemo('');setAmount('');setDate(day());setCategory('');if(details.current)details.current.open=false}
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
      clear();setMessage('기록했어요.');onSaved?.(d);amountInput.current?.focus({preventScroll:true})
    } catch {setMessage('저장하지 못했어요. 입력한 내용은 그대로 있어요.')}
    finally {setBusy(false)}
  }
  return <section className="rounded-2xl border bg-card p-4 space-y-3" id="quick-entry">
    <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{editing?'기록 수정':'간편 기록'}</h2><span className="text-xs text-muted-foreground">{date === day() ? '오늘' : date}</span></div>
    <form onSubmit={save} className="space-y-3">
      <div className="oj-type-buttons" role="group" aria-label="수입·지출">
        {(['expense','income','transfer'] as const).map(value=><button key={value} type="button" aria-pressed={type===value} onClick={()=>{setType(value);setCategory('')}}>{value==='expense'?'지출':value==='income'?'수입':'이체'}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs">금액<input ref={amountInput} className="oj-field" aria-label="금액" type="number" min="1" max="999999999999" step="1" inputMode="numeric" value={amount} required onChange={e=>setAmount(e.target.value)} placeholder="0원" /></label>
        <label className="text-xs">내용<input className="oj-field" aria-label="내용" maxLength={200} value={memo} required onChange={e=>setMemo(e.target.value)} placeholder={type==='income'?'예: 월급':'예: 점심'} /></label>
      </div>
      <details ref={details} open={editing ? true : undefined}>
        <summary className="cursor-pointer text-xs text-muted-foreground py-1">날짜·분류 변경 <span className="opacity-70">· {categories.find(c=>String(c.id)===category)?.name || '기타'}</span></summary>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <label className="text-xs">날짜<input className="oj-field" aria-label="날짜" type="date" value={date} min="1900-01-01" max="9998-12-31" required onChange={e=>setDate(e.target.value)} /></label>
          <label className="text-xs">분류<select className="oj-field" aria-label="분류" value={category} onChange={e=>setCategory(e.target.value)}><option value="">기타</option>{categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></label>
        </div>
      </details>
      <div className="flex gap-2"><Button className="flex-1 min-h-11" type="submit" disabled={busy}>{busy?'저장 중…':editing?'수정 저장':'기록 저장'}</Button>{editing&&<Button className="min-h-11" type="button" variant="outline" onClick={clear}>수정 취소</Button>}</div>
    </form>{message&&<p role="status" className="text-xs">{message}</p>}
  </section>
}
