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
    setPointSize,
    setColorMode,
    setShowMesh,
    errorMessage,
  } = useViewer()

  const isDone = streamStatus === 'done'
  const isStreaming = streamStatus === 'streaming'
  const isUploading = streamStatus === 'uploading'
  const isConnecting = isStreaming && loadedPoints === 0
  const progress = totalPoints > 0 ? Math.min(1, loadedPoints / totalPoints) : 0

  return (
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
            {isConnecting ? (
              <span className="flex items-center gap-2">
                <SpinnerIcon className="h-3 w-3 animate-spin text-teal-400" />
                Connecting to stream…
              </span>
            ) : (
              <span>Streaming point cloud…</span>
            )}
            <span>{loadedPoints.toLocaleString()} pts</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={[
                'h-full rounded-full transition-all duration-300',
                isConnecting ? 'w-1/3 animate-pulse bg-teal-400/50' : 'bg-teal-400',
              ].join(' ')}
              style={isConnecting ? {} : { width: totalPoints > 0 ? `${progress * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* Controls panel */}
      {(isDone || isStreaming) && (
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/60 px-4 py-3 backdrop-blur-sm">
          {/* Stats */}
          {isDone && (
            <span className="text-xs text-white/50">
              {totalPoints.toLocaleString()} pts
            </span>
          )}

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
