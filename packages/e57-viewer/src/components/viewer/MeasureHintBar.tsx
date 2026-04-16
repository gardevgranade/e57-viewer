

import { useViewer } from '../../lib/viewerState'

export default function MeasureHintBar() {
  const { measureActive, measureSnap, setMeasureSnap } = useViewer()

  if (!measureActive) return null

  return (
    <div className="pointer-events-none absolute bottom-12 left-0 right-0 flex justify-center p-3">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-orange-500/20 bg-orange-500/10 px-3 py-1.5 text-[11px] text-orange-300 backdrop-blur-sm">
        <span>Click to place points · <span className="opacity-50">Esc to clear</span></span>
        <button
          type="button"
          onClick={() => setMeasureSnap(!measureSnap)}
          className={[
            'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition border',
            measureSnap
              ? 'bg-yellow-400/20 border-yellow-400/50 text-yellow-300'
              : 'bg-white/5 border-white/20 text-white/40',
          ].join(' ')}
          title="Toggle snap to surface edges & corners"
        >
          🧲 {measureSnap ? 'Snap' : 'No Snap'}
        </button>
      </div>
    </div>
  )
}
