

import { useViewer } from '../../lib/viewerState'
import { useUnits } from '../../lib/units'

export default function StatusBar() {
  const { streamStatus, totalPoints, fileType, fileName, surfaces } = useViewer()
  const { unitSystem } = useUnits()

  const isDone = streamStatus === 'done'
  const isMesh = fileType && fileType !== 'e57'

  return (
    <div className="flex h-full w-full items-center justify-between px-3 text-[10px] text-white/40 select-none">
      {/* Left: file info */}
      <div className="flex items-center gap-3">
        {fileName && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{
              background: isDone ? '#22c55e' : (streamStatus === 'streaming' ? '#f59e0b' : '#64748b')
            }} />
            <span className="max-w-[200px] truncate">{fileName}</span>
            {fileType && <span className="uppercase text-white/25">.{fileType}</span>}
          </span>
        )}
        {isDone && !isMesh && (
          <span>{totalPoints.toLocaleString()} points</span>
        )}
        {isDone && surfaces.length > 0 && (
          <span>{surfaces.length} surfaces</span>
        )}
      </div>

      {/* Center: status */}
      <div className="flex items-center gap-3">
        {streamStatus === 'streaming' && (
          <span className="text-amber-400/60">Loading…</span>
        )}
        {streamStatus === 'error' && (
          <span className="text-red-400/60">Error</span>
        )}
      </div>

      {/* Right: FPS + units */}
      <div className="flex items-center gap-3">
        <span className="tabular-nums">
          <span id="fps-display">--</span> FPS
        </span>
        <span className="text-white/20">|</span>
        <span className="uppercase">{unitSystem}</span>
      </div>
    </div>
  )
}
