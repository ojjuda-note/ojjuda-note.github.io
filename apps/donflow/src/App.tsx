import { useEffect, Component, type ReactNode } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import Dashboard from '@/pages/Dashboard'
import Structure from '@/pages/Structure'
import DataInput from '@/pages/DataInput'
import { seedCategories, db } from '@/db'
import { useLiveQuery } from 'dexie-react-hooks'

class ErrorBoundary extends Component<{children: ReactNode}, {error: Error | null}> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) return (
      <div style={{padding:'40px 20px',maxWidth:600,margin:'0 auto',fontFamily:'system-ui',color:'#e0e0e0',textAlign:'center'}}>
        <h2 style={{fontSize:24,marginBottom:16}}>가계부 화면을 불러오지 못했어요</h2>
        <p style={{color:'#aaa',marginBottom:24}}>
          저장된 기록을 지우지 않고 다시 열어 보세요.
        </p>
        <div style={{display:'flex',gap:12,justifyContent:'center',marginBottom:32}}>
          <button
            onClick={() => window.location.reload()}
            style={{padding:'10px 24px',background:'#3b82f6',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontSize:14,fontWeight:600}}
          >
            새로고침
          </button>
          <button
            onClick={() => { this.setState({ error: null }) }}
            style={{padding:'10px 24px',background:'#374151',color:'#e0e0e0',border:'1px solid #4b5563',borderRadius:8,cursor:'pointer',fontSize:14}}
          >
            다시 시도
          </button>
        </div>
        <details style={{textAlign:'left',background:'#1e1e1e',padding:16,borderRadius:8,border:'1px solid #333'}}>
          <summary style={{cursor:'pointer',color:'#888',fontSize:13}}>오류 내용</summary>
          <pre style={{color:'#ef4444',fontSize:12,marginTop:8,overflow:'auto',whiteSpace:'pre-wrap'}}>{this.state.error.message}{'\n'}{this.state.error.stack}</pre>
        </details>
      </div>
    )
    return this.props.children
  }
}

function AppRoutes() {


  // Check if user has set up income → redirect to structure if not
  const salary = useLiveQuery(async () => {
    const s = await db.appSettings.where('key').equals('monthlySalary').first()
    return s ? Number(s.value) : 0
  })

  const hasSetup = salary != null && salary > 0

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/structure" element={<Structure />} />
        <Route path="/data" element={<DataInput />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </ErrorBoundary>
  )
}
