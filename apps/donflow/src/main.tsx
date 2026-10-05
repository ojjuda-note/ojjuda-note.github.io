import { createRoot } from 'react-dom/client'
import './index.css'
import './ojjuda/types'

const root = createRoot(document.getElementById('root')!)
async function start() {
  let host
  try { host = window.parent.OjjudaDonflowHost?.connect(window) } catch { /* different origin */ }
  if (!host || !host.active()) {
    root.render(<p className="p-6">오쭈다에서 로그인한 뒤 생활 → 가계부를 열어 주세요. <a href="/world.html" target="_top">오쭈다 열기</a></p>)
    return
  }
  window.ojjudaLedger = host
  if (!navigator.locks) throw Error('최신 브라우저에서 가계부를 열어 주세요.')
  await navigator.locks.request('ojjuda-donflow-' + host.owner, { ifAvailable: true }, async lock => {
    if (!lock) {
      root.render(<p className="p-6">다른 창에서 가계부가 열려 있어요. 그 창을 닫고 다시 열어 주세요.</p>)
      return
    }
    const { initialize, stop } = await import('./ojjuda/sync')
    await initialize()
    if (!host.active()) return
    const { default: App } = await import('./App')
    root.render(<App />)
    await new Promise<void>(resolve => {
      const timer = setInterval(() => {
        if (!host.active()) { clearInterval(timer); stop(); root.render(<p className="p-6">로그인이 바뀌었어요. 가계부를 다시 열어 주세요.</p>); resolve() }
      }, 300)
      window.addEventListener('pagehide', () => { clearInterval(timer); stop(); resolve() }, { once: true })
    })
  })
}
start().catch(() => root.render(<p className="p-6">가계부를 열지 못했어요. 저장 공간과 인터넷 연결을 확인한 뒤 <button onClick={() => location.reload()}>다시 열기</button></p>))
