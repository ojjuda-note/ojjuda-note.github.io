import { db, seedCategories } from '@/db'
import { ensureDefaultWallet } from '@/lib/defaultWallet'
import { snapshot, restore } from './snapshot'
import type { Host } from './types'

const host: Host = window.ojjudaLedger
const key = 'ojjuda-donflow-sync-' + host.owner
const table = 'life_donflow_snapshots'
type Meta = { revision: string | null; dirty: string | null; pending?: {revision: string; dirty: string | null} }
let meta: Meta = JSON.parse(localStorage.getItem(key) || '{"revision":null,"dirty":null}')
let stopped = false, busy = false, conflict = false, suppress = true, timer: ReturnType<typeof setTimeout>
let state = { message: '기록을 확인하고 있어요.', conflict: false, busy: false }
const listeners = new Set<() => void>()
const persist = () => localStorage.setItem(key, JSON.stringify(meta))
const active = () => !stopped && host.active()
function status(message: string) { state = { message, conflict, busy }; listeners.forEach(fn => fn()) }
export const getSyncState = () => state
export const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
function changed() {
  if (suppress || !active()) return
  meta.dirty = crypto.randomUUID(); persist()
  status('이 기기에 저장했어요. 계정에 저장 중…')
  schedule()
}
function schedule() { clearTimeout(timer); if (active() && !conflict) timer = setTimeout(() => { void sync() }, 1200) }
async function remote() {
  const {data,error} = await host.client.from(table).select('payload,revision').eq('user_id',host.owner).maybeSingle()
  if (error) throw error
  if (!active()) throw Error('closed')
  return data
}
export async function initialize() {
  await db.open()
  let connected = false
  try {
    const data = await remote(); connected = true
    if (meta.pending && data?.revision === meta.pending.revision) {
      meta.revision = data.revision
      if (meta.dirty === meta.pending.dirty) meta.dirty = null
      delete meta.pending; persist()
    }
    if (meta.dirty && (data?.revision ?? null) !== meta.revision) conflict = true
    else if (!meta.dirty && data) {
      await restore(data.payload); meta.revision = data.revision; persist()
    }
  } catch { /* Open this account's local copy; never overwrite an unknown remote revision. */ }
  if (!active()) return
  await seedCategories(); await ensureDefaultWallet()
  // All upstream mutations remain IndexedDB transactions. Only successful commits schedule sync.
  for (const t of db.tables) for (const kind of ['creating','updating','deleting'] as const) {
    (t.hook as any)(kind, function(this: any) {
      if (!active() && !suppress) throw Error('로그인이 바뀌었어요.')
      if (!suppress) this.onsuccess = () => { changed() }
    } as any)
  }
  suppress = false
  if (conflict) status('다른 기기의 기록과 변경이 겹쳤어요. 이 기기 기록을 백업한 뒤 계정 기록을 불러와 주세요.')
  else if (!connected) status('오프라인 · 이 기기에서 사용해요. 연결되면 다시 저장해 주세요.')
  else if (meta.dirty) schedule()
  else status('계정 연결 완료 · 변경하면 자동 저장돼요.')
  window.addEventListener('online', onOnline)
}
function onOnline() { void sync() }
export function stop() { stopped = true; clearTimeout(timer); window.removeEventListener('online', onOnline); db.close() }
export async function sync() {
  if (!active() || busy || conflict) return
  busy = true; status('계정에 저장 중…')
  try {
    const data = await remote()
    if (meta.pending && data?.revision === meta.pending.revision) {
      meta.revision = data.revision
      if (meta.dirty === meta.pending.dirty) meta.dirty = null
      delete meta.pending; persist()
    }
    const rev = data?.revision ?? null
    if (rev !== meta.revision) {
      if (meta.dirty) { conflict = true; throw Error('conflict') }
      // No unsaved local change: reload to apply a newer account copy before editing.
      location.reload(); return
    }
    if (!meta.dirty) { status('계정에 저장되어 있어요.'); return }
    let dirty: string | null = null
    const payload = await db.transaction('r', db.tables, async () => { const p = await snapshot(); dirty = meta.dirty; return p })
    if (!active()) return
    const next = crypto.randomUUID(); meta.pending = {revision:next,dirty}; persist()
    const {data:result,error} = await host.client.rpc('life_donflow_save', {p_expected:meta.revision,p_revision:next,p_payload:payload})
    if (!active()) return
    if (error) { if (error.code === '40001') conflict = true; throw error }
    if (result !== next) throw Error('save')
    meta.revision = next
    if (meta.dirty === dirty) meta.dirty = null
    delete meta.pending; persist()
    status(meta.dirty ? '이 기기에 저장했어요. 계정에 저장 중…' : '계정에 저장했어요. 다른 기기에서도 볼 수 있어요.')
  } catch {
    if (active()) status(conflict ? '다른 기기와 변경이 겹쳤어요. 이 기기 기록을 백업한 뒤 계정 기록을 불러와 주세요.' : '이 기기에는 저장됐어요. 계정 저장에 실패했으니 다시 저장해 주세요.')
  } finally {
    busy = false; state = {...state,busy}; listeners.forEach(fn=>fn())
    if (meta.dirty && !conflict && state.message.includes('저장 중')) schedule()
  }
}
export async function useAccountCopy() {
  if (!active() || busy) return
  if (!confirm('이 기기의 변경을 계정에 저장된 기록으로 바꿉니다. 먼저 파일로 백업했나요?')) return
  busy = true; status('계정 기록을 불러오고 있어요.')
  try {
    const data = await remote(); if (!data) throw Error('empty')
    suppress = true
    await restore(data.payload)
    meta = {revision:data.revision,dirty:null}; persist(); conflict = false
    location.reload()
  } catch { status('불러오지 못했어요. 이 기기 기록은 유지돼요.') }
  finally { suppress = false; busy = false; state = {...state,busy}; listeners.forEach(fn=>fn()) }
}
export async function importLegacy(): Promise<number> {
  if (!active()) throw Error('closed')
  const rows: any[] = []
  for (let offset=0; ; offset+=500) {
    const {data,error} = await host.client.from('life_ledger_entries').select('id,date,type,category,memo,amount,deleted_at').eq('user_id',host.owner).order('id').range(offset,offset+499)
    if (error) throw error
    if (!active()) throw Error('closed')
    rows.push(...data)
    if (data.length < 500) break
  }
  const ids = new Set(rows.map(r=>r.id))
  let old
  try { old = JSON.parse(localStorage.getItem('ojjuda-life-v1:'+host.owner)||'{}') } catch { old = {} }
  for (const row of old.entries || []) if (!ids.has(row.id)) {rows.push(row);ids.add(row.id)}
  let count = 0
  await db.transaction('rw',db.tables,async () => {
    const wallet = await ensureDefaultWallet()
    for (const row of rows) {
      if (row.deleted_at || !/^[0-9a-f-]{36}$/i.test(row.id) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isSafeInteger(Number(row.amount)) || Number(row.amount)<=0 || Number(row.amount)>999999999999 || !['income','expense'].includes(row.type)) continue
      const date = new Date(row.date+'T12:00:00'); if (!Number.isFinite(date.getTime())) continue
      const marker = 'legacy:'+row.id
      if (await db.appSettings.where('key').equals(marker).first()) continue
      const name = row.category || (row.type==='income'?'급여':'기타')
      let cat = await db.categories.where('name').equals(name).first()
      if (!cat) {const id = await db.categories.add({name,icon:'📌',color:'#6366f1',isIncome:row.type==='income',isDefault:false,displayOrder:99,groupName:row.type==='income'?'수입':'생활비'});cat = await db.categories.get(id)}
      await db.transactions.add({accountId:wallet,categoryId:cat!.id!,amount:Number(row.amount),type:row.type,date,merchantName:String(row.memo||'기록'),memo:'',source:'manual',createdAt:new Date(),updatedAt:new Date()})
      await db.appSettings.add({key:marker,value:'imported'}); count++
    }
  })
  return count
}
