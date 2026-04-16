import { useViewer } from '../../lib/viewerState'

export default function ViewerControls() {
  const {
    streamStatus,
    totalPoints,
    loadedPoints,
    hasColor,
    hasIntensity,
    pointSize,
    colorMode,
    fileType,
    measureActive,
    setPointSize,
    setColorMode,
    errorMessage,
    measureSnap,
    setMeasureSnap,
  } = useViewer()

  const isMesh = fileType && fileType !== 'e57'
  const isStreaming = streamStatus === 'streaming'
  const isUploading = streamStatus === 'uploading'
  const isConnecting = isStreaming && loadedPoints === 0
  const progress = totalPoints > 0 ? Math.min(1, loadedPoints / totalPoints) : 0

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex flex-col gap-2 p-3">
      {/* Error banner */}
      {streamStatus === 'error' && errorMessage && (
        <div className="pointer-events-auto rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 backdrop-blur-sm">
          ⚠ {errorMessage}
        </div>
      )}

      {/* Uploading */}
      {isUploading && (
        <div className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-[11px] text-white/50">
            <SpinnerIcon className="h-3 w-3 animate-spin text-teal-400" />
            Uploading…
          </div>
        </div>
      )}

      {/* Streaming progress */}
      {isStreaming && (
        <div className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 backdrop-blur-sm">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/50">
            <span className="flex items-center gap-2">
              <SpinnerIcon className="h-3 w-3 animate-spin text-teal-400" />
              {isMesh ? 'Loading model…' : (isConnecting ? 'Connecting…' : 'Streaming…')}
            </span>
            {!isMesh && <span className="tabular-nums">{loadedPoints.toLocaleString()} pts</span>}
          </div>
          {!isMesh && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={[
                  'h-full rounded-full transition-all duration-300',
                  isConnecting ? 'w-1/3 animate-pulse bg-teal-400/50' : 'bg-teal-400',
                ].join(' ')}
                style={isConnecting ? {} : { width: totalPoints > 0 ? `${progress * 100}%` : '0%' }}
              />
            </div>
          )}
        </div>
      )}

      {/* Point cloud settings (only for E57) */}
      {!isMesh && (streamStatus === 'done' || isStreaming) && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-white/[0.06] bg-black/60 px-3 py-1.5 backdrop-blur-sm">
          <label className="flex items-center gap-1.5 text-[10px] text-white/50">
            Size
            <input
              type="range"
              min={0.5}
              max={6}
              step={0.5}
              value={pointSize}
              onChange={(e) => setPointSize(Number.parseFloat(e.target.value))}
              className="w-16 accent-teal-400"
            />
            <span className="w-4 text-right tabular-nums text-white/40">{pointSize}</span>
          </label>
          <div className="h-3 w-px bg-white/[0.06]" />
          <label className="flex items-center gap-1.5 text-[10px] text-white/50">
            Color
            <select
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value as 'rgb' | 'intensity' | 'height')}
              className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/70 outline-none hover:bg-white/10 transition"
            >
              {hasColor && <option value="rgb">RGB</option>}
              {hasIntensity && <option value="intensity">Intensity</option>}
              <option value="height">Height</option>
              {!hasColor && !hasIntensity && <option value="rgb">Default</option>}
            </select>
          </label>
        </div>
      )}

      {/* Measure hint bar */}
      {measureActive && (
        <div className="pointer-events-auto flex items-center justify-center gap-3 rounded-lg border border-orange-500/20 bg-orange-500/10 px-3 py-1.5 text-[11px] text-orange-300 backdrop-blur-sm">
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
      )}
    </div>
  )
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
