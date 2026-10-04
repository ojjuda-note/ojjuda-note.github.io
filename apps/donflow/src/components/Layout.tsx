import AccountBar from '@/ojjuda/AccountBar'
import { useState, useCallback } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/lib/i18n'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useTheme } from '@/hooks/useTheme'
import KeyboardShortcutsHelp from '@/components/KeyboardShortcutsHelp'

export default function Layout() {
  const { lang, setLang, t } = useLanguage()
  const { theme, toggle: toggleTheme } = useTheme()
  const themeIcon = theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '💻'
  const [showShortcuts, setShowShortcuts] = useState(false)
  const toggleShortcuts = useCallback(() => setShowShortcuts(v => !v), [])
  useKeyboardShortcuts(toggleShortcuts)

  const navItems = [
    { to: '/', icon: '📊', label: t('navDashboard') },
    { to: '/structure', icon: '🏗️', label: t('navStructure') },
    { to: '/data', icon: '📥', label: t('navData') },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <KeyboardShortcutsHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      {/* Header */}
      <header className="border-b px-4 py-3 flex items-center justify-between" role="banner">
        <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          {t('headerTitle')}
        </h1>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/maxmini0214/donflow"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary/50"
            title="돈플로우 원본 소스"
            aria-label="돈플로우 원본 소스"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary/50"
            title={`Theme: ${theme}`}
            aria-label={`Switch theme, current: ${theme}`}
          >
            {themeIcon}
          </button>
          <button
            onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary/50"
            title="Switch language"
            aria-label={lang === 'ko' ? 'Switch to English' : '한국어로 전환'}
          >
            {lang === 'ko' ? '🌐 EN' : '🌐 한국어'}
          </button>
          <button
            onClick={toggleShortcuts}
            className="hidden md:flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary/50"
            title="Keyboard shortcuts"
          >
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-secondary/50 text-[10px] font-mono">?</kbd>
            <span>shortcuts</span>
          </button>
        </div>
      </header>

      <AccountBar />
      {/* Main */}
      <main className="flex-1 overflow-y-auto p-4 pb-20 max-w-4xl mx-auto w-full" role="main" aria-label="DonFlow content">
        <Outlet />
      </main>

      <p className="text-center text-xs pb-24 text-muted-foreground">DonFlow 기반 · <a href="/ledger/THIRD_PARTY_NOTICES.txt" target="_blank" rel="noopener noreferrer">라이선스</a></p>
      {/* Privacy Trust Badge */}
      <div className="fixed bottom-12 left-0 right-0 flex justify-center pointer-events-none z-40">
        <span className="text-[10px] text-muted-foreground/50 pointer-events-auto">{t('privacyBadge')}</span>
      </div>

      {/* Bottom Nav — 3 tabs */}
      <nav className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50" aria-label="Main navigation">
        <div className="flex justify-around max-w-4xl mx-auto">
          {navItems.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center py-2 px-3 text-xs gap-1 transition-colors flex-1',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )
              }
            >
              <span className="text-lg">{icon}</span>
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
