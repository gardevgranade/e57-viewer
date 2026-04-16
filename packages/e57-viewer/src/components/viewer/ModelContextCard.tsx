

import { useEffect, useState } from 'react'
import { useViewer } from '../../lib/viewerState'

export default function ModelContextCard() {
  const {
    setPositioningMode,
    positioningMode, streamStatus, fileType, meshVisible,
  } = useViewer()
  const [showHint, setShowHint] = useState(false)

  const isMesh = fileType && fileType !== 'e57'
  const isDone = streamStatus === 'done'

  // Show hint bar once after model loads
  useEffect(() => {
    if (isDone && isMesh) setShowHint(true)
  }, [isDone, isMesh])

  // Persistent positioning hint bar (shown after model load)
  if (!showHint || !isDone || !isMesh || !meshVisible || positioningMode) return null

  return (
    <div style={{
      position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'rgba(99,102,241,0.12)',
      border: '1px solid rgba(99,102,241,0.3)',
      borderRadius: 10,
      backdropFilter: 'blur(8px)',
      padding: '6px 14px',
      zIndex: 400,
      fontFamily: 'system-ui, sans-serif',
      pointerEvents: 'auto',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 12, color: '#a5b4fc' }}>
        🎯 Model not positioned correctly?
      </span>
      <button
        type="button"
        onClick={() => { setPositioningMode(true); setShowHint(false) }}
        style={{
          background: 'rgba(99,102,241,0.25)',
          border: '1px solid rgba(99,102,241,0.5)',
          borderRadius: 6,
          padding: '3px 10px',
          color: '#c7d2fe',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.4)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.25)')}
      >
        Open Positioning
      </button>
      <button
        type="button"
        onClick={() => setShowHint(false)}
        style={{
          background: 'none', border: 'none', color: '#64748b',
          fontSize: 14, cursor: 'pointer', padding: '0 2px',
        }}
      >✕</button>
    </div>
  )
}
