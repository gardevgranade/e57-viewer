'use client'

import { useViewer } from '../../lib/viewerState.js'

export default function PositioningPanel() {
  const { positioningMode, setPositioningMode, moveModelToGround, resetObjectRotation } = useViewer()

  if (!positioningMode) return null

  const btnStyle = (accent: string): React.CSSProperties => ({
    padding: '8px 18px',
    background: 'rgba(255,255,255,0.07)',
    border: `1px solid ${accent}`,
    borderRadius: 8,
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6,
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{
      position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'rgba(15,23,42,0.90)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 12,
      backdropFilter: 'blur(10px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      padding: '8px 12px',
      zIndex: 500,
      fontFamily: 'system-ui, sans-serif',
      pointerEvents: 'auto',
    }}>
      <span style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginRight: 4 }}>POSITIONING</span>
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
      <button style={btnStyle('#22c55e')} onClick={moveModelToGround}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(34,197,94,0.15)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}>
        ↕ Move to Ground
      </button>
      <button style={btnStyle('#94a3b8')} onClick={resetObjectRotation}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}>
        ↺ Reset Rotation
      </button>
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
      <button style={{ ...btnStyle('#ef4444'), color: '#fca5a5' }}
        onClick={() => setPositioningMode(false)}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}>
        ✕ Exit
      </button>
    </div>
  )
}
