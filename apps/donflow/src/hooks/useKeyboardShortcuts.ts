import { useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export interface ShortcutEntry {
  key: string
  label: string
  description: string
}

export const SHORTCUTS: ShortcutEntry[] = [
  { key: '1', label: '1', description: 'Go to Dashboard' },
  { key: '2', label: '2', description: 'Go to Structure' },
  { key: '3', label: '3', description: 'Go to Data Input' },
  { key: '?', label: '?', description: 'Toggle keyboard shortcuts help' },
]

export function useKeyboardShortcuts(onToggleHelp?: () => void) {
  const navigate = useNavigate()
  const location = useLocation()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // Skip if modifier keys (except shift for ?)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      switch (e.key) {
        case '1':
          e.preventDefault()
          if (location.pathname !== '/') navigate('/')
          break
        case '2':
          e.preventDefault()
          if (location.pathname !== '/structure') navigate('/structure')
          break
        case '3':
          e.preventDefault()
          if (location.pathname !== '/data') navigate('/data')
          break
        case '?':
          e.preventDefault()
          onToggleHelp?.()
          break
      }
    },
    [navigate, location.pathname, onToggleHelp]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
