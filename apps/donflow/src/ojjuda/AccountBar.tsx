import { useState, useSyncExternalStore } from 'react'
import { subscribe, getSyncState, sync, useAccountCopy, importLegacy } from './sync'
import { exportJSON } from '@/utils/exportData'
export default function AccountBar() {
  const state = useSyncExternalStore(subscribe,getSyncState)
  const [importing,setImporting] = useState(false), [message,setMessage] = useState('')
  return <aside className="oj-account" aria-label="계정 저장">
    <p role="status">{state.message}</p>
    <details open={state.conflict || undefined}><summary className="cursor-pointer mt-1">저장 관리·기존 기록 가져오기</summary>
    <div className="flex flex-wrap gap-2 mt-2">
      <button disabled={state.busy || state.conflict} onClick={()=>void sync()}>다시 저장·새로고침</button>
      <button disabled={importing || state.busy || state.conflict} onClick={async()=>{setImporting(true);try{const n=await importLegacy();setMessage(n+'개 가져왔어요. 기존 기록도 보관돼요.')}catch{setMessage('기록을 가져오지 못했어요. 다시 시도해 주세요.')}finally{setImporting(false)}}}>{importing?'가져오는 중…':'기존 가계부 가져오기'}</button>
      <button onClick={()=>void exportJSON()}>파일로 백업</button>
      {state.conflict&&<button onClick={()=>void useAccountCopy()}>계정 기록 불러오기</button>}
    </div>{message&&<p role="status" className="mt-2">{message}</p>}
    <p className="mt-2 opacity-70">브라우저 기록을 지우기 전 계정 저장이나 파일 백업을 확인해 주세요.</p></details>
  </aside>
}
