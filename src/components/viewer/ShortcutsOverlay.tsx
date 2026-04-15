'use client'

interface ShortcutGroup {
  title: string
  items: { keys: string; desc: string }[]
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'General',
    items: [
      { keys: '?', desc: 'Show this help' },
      { keys: 'Esc', desc: 'Cancel / close active tool' },
      { keys: '⌘Z / Ctrl+Z', desc: 'Undo' },
      { keys: '⌘⇧Z / Ctrl+Y', desc: 'Redo' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { keys: 'V', desc: 'Select tool' },
      { keys: 'M', desc: 'Measure tool' },
      { keys: 'F', desc: 'Detect surfaces' },
      { keys: 'L', desc: 'Lasso select' },
      { keys: 'B', desc: 'Box select' },
      { keys: 'P', desc: 'Position model' },
      { keys: 'H', desc: 'Toggle model visibility' },
      { keys: 'G', desc: 'Toggle quad view' },
    ],
  },
  {
    title: 'Camera Navigation',
    items: [
      { keys: 'Left drag', desc: 'Orbit' },
      { keys: 'Right drag', desc: 'Pan' },
      { keys: 'Scroll', desc: 'Zoom' },
      { keys: 'W/A/S/D', desc: 'Fly forward/left/back/right' },
      { keys: 'Q', desc: 'Fly up' },
      { keys: 'E', desc: 'Fly down' },
      { keys: 'Shift + drag', desc: 'Pan' },
    ],
  },
  {
    title: 'Camera Views',
    items: [
      { keys: 'Numpad 1', desc: 'Front view' },
      { keys: 'Numpad 3', desc: 'Right view' },
      { keys: 'Numpad 7', desc: 'Top view' },
      { keys: 'Numpad 5', desc: 'Isometric view' },
      { keys: '0', desc: 'Fit to view' },
    ],
  },
  {
    title: 'Export',
    items: [
      { keys: '⌘⇧S / Ctrl+Shift+S', desc: 'Screenshot' },
    ],
  },
]

interface Props {
  open: boolean
  onClose: () => void
}

export default function ShortcutsOverlay({ open, onClose }: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0f1623] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white/90">⌨️ Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-white/40 transition hover:bg-white/10 hover:text-white/70"
          >
            Esc
          </button>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {SHORTCUTS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/30">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div
                    key={item.keys}
                    className="flex items-center justify-between rounded px-1.5 py-0.5"
                  >
                    <span className="text-xs text-white/50">{item.desc}</span>
                    <kbd className="ml-3 shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-mono text-white/40 border border-white/[0.08]">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 text-center text-[10px] text-white/20">
          Press <kbd className="rounded bg-white/[0.06] px-1 text-white/30">?</kbd> to toggle this overlay
        </div>
      </div>
    </div>
  )
}
