import { SHORTCUTS } from '@/hooks/useKeyboardShortcuts'

interface Props {
  open: boolean
  onClose: () => void
}

export default function KeyboardShortcutsHelp({ open, onClose }: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-background border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">⌨️ Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map(s => (
            <div key={s.key} className="flex items-center justify-between py-1">
              <span className="text-sm text-muted-foreground">{s.description}</span>
              <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono font-semibold">
                {s.label}
              </kbd>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4 text-center">
          Press <kbd className="px-1 bg-muted rounded font-mono">?</kbd> to toggle
        </p>
      </div>
    </div>
  )
}
