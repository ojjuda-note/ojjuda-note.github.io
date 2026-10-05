import AccountBar from '@/ojjuda/AccountBar'
import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'

export default function Layout() {
  useTheme()
  const location = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])
  const items = [{to:'/', label:'가계부', icon:'✎'}, {to:'/stats',label:'통계',icon:'▥'}, {to:'/settings',label:'설정',icon:'⚙'}]
  return <div className="min-h-screen flex flex-col">
    <header className="px-4 pt-4 pb-2 flex items-center justify-between gap-2">
      <h1 className="text-lg font-bold">오쭈다 가계부</h1>
      <button className="oj-small-button" onClick={()=>window.ojjudaLedger.expand()}>크게 보기·접기</button>
    </header>
    <AccountBar />
    <main className="flex-1 p-4 pb-24 max-w-3xl mx-auto w-full" aria-label="가계부 내용"><Outlet /></main>
    <nav className="oj-bottom-nav" aria-label="가계부 메뉴">
      <div className="flex max-w-3xl mx-auto">
        {items.map(({to,label,icon})=><NavLink key={to} to={to} end={to==='/'} className={({isActive})=>cn('flex-1 flex flex-col items-center gap-1 py-2 text-xs',isActive?'text-primary font-bold':'text-muted-foreground')}><span aria-hidden="true" className="text-xl">{icon}</span>{label}</NavLink>)}
      </div>
    </nav>
  </div>
}
