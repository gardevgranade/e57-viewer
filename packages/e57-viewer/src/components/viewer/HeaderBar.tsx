

import { useViewer } from '../../lib/viewerState'

export default function HeaderBar() {
  const {
    streamStatus, fileName, fileSize, fileType,
    totalPoints, loadedPoints,
    surfaces, errorMessage,
  } = useViewer()

  const isStreaming = streamStatus === 'streaming'
  const isDone = streamStatus === 'done'
  const isE57 = fileType === 'e57'
  const isMesh = fileType && fileType !== 'e57'
  const progress = totalPoints > 0 ? Math.min(1, loadedPoints / totalPoints) : 0

  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#0c1017] px-3 text-xs select-none">
      {/* Status dot + file info */}
      <div className="flex items-center gap-2 min-w-0">
        <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          streamStatus === 'error' ? 'bg-red-400' :
          isDone ? 'bg-emerald-400' :
          isStreaming ? 'bg-amber-400 animate-pulse' :
          'bg-white/20'
        }`} />

        {fileName ? (
          <>
            <span className="truncate max-w-[200px] text-white/60 font-medium">{fileName}</span>
            <span className="text-white/20">{formatBytes(fileSize ?? 0)}</span>
            {fileType && (
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-mono text-white/30">
                .{fileType}
              </span>
            )}
          </>
        ) : (
          <span className="text-white/30">No file loaded</span>
        )}
      </div>

      {/* Progress / status center */}
      <div className="flex-1 flex items-center justify-center gap-2">
        {streamStatus === 'error' && errorMessage && (
          <span className="text-red-400 text-[10px]">⚠ {errorMessage}</span>
        )}
        {isStreaming && (
          <div className="flex items-center gap-2">
            <SpinnerIcon className="h-3 w-3 animate-spin text-teal-400" />
            <span className="text-white/40 text-[10px]">
              {isMesh ? 'Loading model…' : (loadedPoints === 0 ? 'Connecting…' : 'Streaming…')}
            </span>
            {isE57 && loadedPoints > 0 && (
              <span className="text-white/30 text-[10px] tabular-nums">{loadedPoints.toLocaleString()} pts</span>
            )}
            {isE57 && totalPoints > 0 && (
              <div className="h-1 w-20 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-teal-400 transition-all duration-300" style={{ width: `${progress * 100}%` }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right info */}
      <div className="flex items-center gap-2 text-[10px] text-white/25 tabular-nums shrink-0">
        {isDone && isE57 && <span>{totalPoints.toLocaleString()} pts</span>}
        {isDone && surfaces.length > 0 && <span>{surfaces.length} surfaces</span>}
      </div>
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
