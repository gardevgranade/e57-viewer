

import { useCallback } from 'react'
import { useViewer } from '../../lib/viewerState'
import type { Quaternion4 } from '../../lib/viewerState'

// Pre-computed orientation presets (applied on top of the base -90°X)
// These represent the objectQuaternion, NOT the final world quaternion.
const S = Math.SQRT1_2

const PRESETS: { label: string; icon: string; desc: string; q: Quaternion4 }[] = [
  { label: 'Original',       icon: '🏠', desc: 'As imported',      q: [0, 0, 0, 1] },
  { label: 'Flip Up/Down',   icon: '🔃', desc: '180° around X',    q: [1, 0, 0, 0] },
  { label: 'Flip Left/Right',icon: '↔️', desc: '180° around Z',    q: [0, 0, 1, 0] },
  { label: 'Turn 180°',      icon: '🔄', desc: '180° around Y',    q: [0, 1, 0, 0] },
  { label: 'Rotate Left',    icon: '↩️', desc: '90° left (Y)',      q: [0, S, 0, S] },
  { label: 'Rotate Right',   icon: '↪️', desc: '90° right (Y)',     q: [0, -S, 0, S] },
  { label: 'Tilt Forward',   icon: '⤵️', desc: '90° forward (X)',   q: [S, 0, 0, S] },
  { label: 'Tilt Backward',  icon: '⤴️', desc: '90° backward (X)',  q: [-S, 0, 0, S] },
  { label: 'Roll Left',      icon: '↶',  desc: '90° roll left (Z)', q: [0, 0, S, S] },
  { label: 'Roll Right',     icon: '↷',  desc: '90° roll right (Z)',q: [0, 0, -S, S] },
]

export default function PositioningPanel() {
  const {
    positioningMode, setPositioningMode,
    moveModelToGround, resetObjectRotation,
    setObjectQuaternion, applyObjectRotation,
    objectQuaternion,
  } = useViewer()

  const applyPreset = useCallback((q: Quaternion4) => {
    setObjectQuaternion(q)
    // Auto-move to ground after a short delay to let the rotation apply
    setTimeout(() => moveModelToGround(), 50)
  }, [setObjectQuaternion, moveModelToGround])

  if (!positioningMode) return null

  const isActive = (q: Quaternion4) => {
    const dot = q[0] * objectQuaternion[0] + q[1] * objectQuaternion[1] +
                q[2] * objectQuaternion[2] + q[3] * objectQuaternion[3]
    return Math.abs(Math.abs(dot) - 1) < 0.01
  }

  return (
    <div style={{
      position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(15,23,42,0.92)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 16,
      backdropFilter: 'blur(12px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      padding: '14px 18px',
      zIndex: 500,
      fontFamily: 'system-ui, sans-serif',
      pointerEvents: 'auto',
      maxWidth: '90vw',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
          🎯 POSITIONING
        </span>
        <button
          type="button"
          onClick={() => setPositioningMode(false)}
          style={{
            background: 'none', border: 'none', color: '#64748b',
            fontSize: 16, cursor: 'pointer', padding: '0 2px',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fca5a5')}
          onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
        >
          ✕
        </button>
      </div>

      {/* Orientation presets grid */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>
          ORIENTATION PRESETS
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5,
        }}>
          {PRESETS.map((p) => {
            const active = isActive(p.q)
            return (
              <button
                type="button"
                key={p.label}
                title={`${p.label} — ${p.desc}`}
                onClick={() => applyPreset(p.q)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 2, padding: '6px 4px',
                  background: active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                  border: active ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                }}
                onMouseLeave={e => {
                  if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
              >
                <span style={{ fontSize: 18 }}>{p.icon}</span>
                <span style={{ fontSize: 9, color: active ? '#a5b4fc' : '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {p.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Fine-tune rotations */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>
          FINE-TUNE ROTATION
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(['x', 'y', 'z'] as const).map((axis) => {
            const colors = { x: '#ef4444', y: '#22c55e', z: '#3b82f6' }
            const c = colors[axis]
            return (
              <div key={axis} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: c, fontSize: 11, fontWeight: 700, width: 14, textAlign: 'center' }}>
                  {axis.toUpperCase()}
                </span>
                {[-90, -45, -15, 15, 45, 90].map((deg) => (
                  <button
                    type="button"
                    key={deg}
                    onClick={() => applyObjectRotation(axis, deg)}
                    style={{
                      flex: 1, padding: '3px 0', fontSize: 10, fontWeight: 600,
                      background: 'rgba(255,255,255,0.05)',
                      border: `1px solid ${c}33`,
                      borderRadius: 5, cursor: 'pointer',
                      color: '#cbd5e1',
                      transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = `${c}22`
                      e.currentTarget.style.borderColor = `${c}88`
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                      e.currentTarget.style.borderColor = `${c}33`
                    }}
                  >
                    {deg > 0 ? '+' : ''}{deg}°
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Actions row */}
      <div style={{ display: 'flex', gap: 6 }}>
        <ActionBtn label="↕ Move to Ground" color="#22c55e" onClick={moveModelToGround} />
        <ActionBtn label="↺ Reset" color="#94a3b8" onClick={() => {
          resetObjectRotation()
          setTimeout(() => moveModelToGround(), 50)
        }} />
      </div>
    </div>
  )
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, padding: '7px 12px', fontSize: 11, fontWeight: 600,
        background: 'rgba(255,255,255,0.06)',
        border: `1px solid ${color}55`,
        borderRadius: 8, cursor: 'pointer',
        color: '#e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        transition: 'all 0.12s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = `${color}22`)}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
    >
      {label}
    </button>
  )
}
