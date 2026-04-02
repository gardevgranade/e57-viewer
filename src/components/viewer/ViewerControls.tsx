import { useViewer } from '../../lib/viewerState.js'

export default function ViewerControls() {
  const {
    streamStatus,
    totalPoints,
    loadedPoints,
    hasColor,
    hasIntensity,
    pointSize,
    colorMode,
    showMesh,
    fileType,
    measureActive,
    setPointSize,
    setColorMode,
    setShowMesh,
    setMeasureActive,
    errorMessage,
    measureSnap,
    setMeasureSnap,
  } = useViewer()

  const isMesh = fileType && fileType !== 'e57'
  const isDone = streamStatus === 'done'
  const isStreaming = streamStatus === 'streaming'
  const isUploading = streamStatus === 'uploading'
  const isConnecting = isStreaming && loadedPoints === 0
  const progress = totalPoints > 0 ? Math.min(1, loadedPoints / totalPoints) : 0

  return (
    <>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex flex-col gap-3 p-4">
      {/* Error banner */}
      {streamStatus === 'error' && errorMessage && (
        <div className="pointer-events-auto rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 backdrop-blur-sm">
          ⚠ {errorMessage}
        </div>
      )}

      {/* Uploading banner */}
      {isUploading && (
        <div className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <SpinnerIcon className="h-3 w-3 animate-spin text-teal-400" />
            <span>Uploading file to server…</span>
          </div>
        </div>
      )}

      {/* Streaming / connecting progress */}
      {isStreaming && (
        <div className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between text-xs text-white/60">
            <span className="flex items-center gap-2">
              <SpinnerIcon className="h-3 w-3 animate-spin text-teal-400" />
              {isMesh ? 'Loading model…' : isConnecting ? 'Connecting to stream…' : 'Streaming point cloud…'}
            </span>
            {!isMesh && <span>{loadedPoints.toLocaleString()} pts</span>}
          </div>
          {!isMesh && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
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

      {/* Controls panel */}
      {(isDone || isStreaming) && (
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/60 px-4 py-3 backdrop-blur-sm">
          {/* Stats — hide point count for mesh models */}
          {isDone && !isMesh && (
            <span className="text-xs text-white/50">
              {totalPoints.toLocaleString()} pts
            </span>
          )}

          {/* Point cloud only controls */}
          {!isMesh && (
            <>
              <div className="h-4 w-px bg-white/10" />

              {/* Point size */}
              <label className="flex items-center gap-2 text-xs text-white/70">
                Size
                <input
                  type="range"
                  min={0.5}
                  max={6}
                  step={0.5}
                  value={pointSize}
                  onChange={(e) => setPointSize(parseFloat(e.target.value))}
                  className="w-20 accent-teal-400"
                />
                <span className="w-5 text-right">{pointSize}</span>
              </label>

              <div className="h-4 w-px bg-white/10" />

              {/* Color mode */}
              <label className="flex items-center gap-2 text-xs text-white/70">
                Color
                <select
                  value={colorMode}
                  onChange={(e) => setColorMode(e.target.value as any)}
                  className="rounded-md bg-white/10 px-2 py-1 text-xs text-white outline-none hover:bg-white/20 transition"
                >
                  {hasColor && <option value="rgb">RGB</option>}
                  {hasIntensity && <option value="intensity">Intensity</option>}
                  <option value="height">Height</option>
                  {!hasColor && !hasIntensity && <option value="rgb">Default</option>}
                </select>
              </label>

              {isDone && (
                <>
                  <div className="h-4 w-px bg-white/10" />
                  {/* Mesh toggle */}
                  <button
                    onClick={() => setShowMesh(!showMesh)}
                className={[
                  'rounded-md px-3 py-1 text-xs font-medium transition',
                  showMesh
                    ? 'bg-teal-500/30 text-teal-300 hover:bg-teal-500/20'
                    : 'bg-white/10 text-white/70 hover:bg-white/20',
                ].join(' ')}
              >
                {showMesh ? '✓ Mesh' : 'Mesh'}
              </button>
            </>
          )}
            </>
          )}

          {/* Measure tool — available once something is loaded */}
          {isDone && (
            <>
              <div className="h-4 w-px bg-white/10" />
              <button
                onClick={() => setMeasureActive(!measureActive)}
                className={[
                  'rounded-md px-3 py-1 text-xs font-medium transition flex items-center gap-1.5',
                  measureActive
                    ? 'bg-orange-500/30 text-orange-300 hover:bg-orange-500/20'
                    : 'bg-white/10 text-white/70 hover:bg-white/20',
                ].join(' ')}
                title="Measure distances by clicking points in the scene"
              >
                <RulerIcon className="h-3 w-3" />
                {measureActive ? 'Measuring' : 'Measure'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Measure hint bar */}
      {measureActive && (
        <div className="pointer-events-auto rounded-xl border border-orange-500/20 bg-orange-500/10 px-4 py-2 text-xs text-orange-300 backdrop-blur-sm flex items-center justify-center gap-3">
          <span>Click to place points · <span className="opacity-60">Esc to clear</span></span>
          <button
            onClick={() => setMeasureSnap(!measureSnap)}
            className={[
              'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition border',
              measureSnap
                ? 'bg-yellow-400/20 border-yellow-400/50 text-yellow-300'
                : 'bg-white/5 border-white/20 text-white/40',
            ].join(' ')}
            title="Toggle snap to surface edges & corners"
          >
            🧲 {measureSnap ? 'Snap On' : 'Snap Off'}
          </button>
        </div>
      )}
    </div>
    </>
  )
}

function RulerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.3 8.7L8.7 21.3a2.4 2.4 0 01-3.4 0L2.7 18.7a2.4 2.4 0 010-3.4L15.3 2.7a2.4 2.4 0 013.4 0l2.6 2.6a2.4 2.4 0 010 3.4z"/>
      <path d="M7.5 10.5l2 2M10.5 7.5l2 2M13.5 4.5l2 2"/></svg>
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
