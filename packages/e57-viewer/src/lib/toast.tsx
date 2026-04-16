import { createContext, useCallback, useContext, useRef, useState } from 'react'

export type ToastLevel = 'info' | 'success' | 'warning' | 'error'

interface Toast {
  id: number
  message: string
  level: ToastLevel
  duration: number
}

interface ToastCtx {
  toasts: Toast[]
  addToast: (message: string, level?: ToastLevel, duration?: number) => void
  dismissToast: (id: number) => void
}

const Ctx = createContext<ToastCtx>({
  toasts: [],
  addToast: () => { /* noop */ },
  dismissToast: () => { /* noop */ },
})

export function useToast() {
  return useContext(Ctx)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const addToast = useCallback(
    (message: string, level: ToastLevel = 'info', duration = 4000) => {
      nextId.current += 1
      const id = nextId.current
      setToasts((t) => [...t.slice(-4), { id, message, level, duration }])
      if (duration > 0) setTimeout(() => dismissToast(id), duration)
    },
    [dismissToast],
  )

  return (
    <Ctx.Provider value={{ toasts, addToast, dismissToast }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </Ctx.Provider>
  )
}

const LEVEL_STYLES: Record<ToastLevel, { bg: string; border: string; icon: string }> = {
  info:    { bg: 'bg-slate-800/90', border: 'border-slate-600/40', icon: 'ℹ️' },
  success: { bg: 'bg-emerald-950/90', border: 'border-emerald-500/40', icon: '✓' },
  warning: { bg: 'bg-amber-950/90', border: 'border-amber-500/40', icon: '⚠' },
  error:   { bg: 'bg-red-950/90', border: 'border-red-500/40', icon: '✕' },
}

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-16 right-4 z-[9000] flex flex-col-reverse gap-2">
      {toasts.map((t) => {
        const s = LEVEL_STYLES[t.level]
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-2 text-xs text-white/90 shadow-lg backdrop-blur-md transition-all ${s.bg} ${s.border}`}
            style={{ animation: 'slideInRight 0.2s ease-out' }}
          >
            <span className="shrink-0 text-sm">{s.icon}</span>
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="ml-2 text-white/40 hover:text-white/80 transition"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
