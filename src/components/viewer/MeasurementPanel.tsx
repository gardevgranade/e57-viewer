'use client'

import { useState } from 'react'
import { useViewer } from '../../lib/viewerState.js'
import type { SavedMeasurement } from '../../lib/viewerState.js'
import { useUnits } from '../../lib/units.js'

function dist3(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2)
}

function polygonArea3D(pts: Array<{ x: number; y: number; z: number }>): number {
  if (pts.length < 3) return 0
  let nx = 0, ny = 0, nz = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    nx += a.y * b.z - a.z * b.y
    ny += a.z * b.x - a.x * b.z
    nz += a.x * b.y - a.y * b.x
  }
  return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2
}

// ── Single measurement row ───────────────────────────────────────────────────

function MeasurementRow({
  m,
  onRename,
  onDelete,
  fmt,
  fmtArea,
}: {
  m: SavedMeasurement
  onRename: (id: string, label: string) => void
  onDelete: (id: string) => void
  fmt: (v: number) => string
  fmtArea: (v: number) => string
}) {
  const [expanded, setExpanded] = useState(false)

  const pts = m.points
  const segments = pts.slice(0, -1).map((p, i) => ({
    idx: i,
    length: dist3(p, pts[i + 1]),
  }))
  const closingLength = m.isClosed && pts.length >= 3
    ? dist3(pts[pts.length - 1], pts[0])
    : 0
  const totalDist = segments.reduce((s, seg) => s + seg.length, 0) + closingLength
  const area = m.isClosed ? polygonArea3D(pts) : 0

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 6px',
      }}>
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            background: 'none', border: 'none', color: '#94a3b8',
            cursor: 'pointer', fontSize: 9, padding: 0, flexShrink: 0,
            width: 12, textAlign: 'center',
          }}
        >
          {expanded ? '▼' : '▶'}
        </button>

        {/* Color indicator */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: m.isClosed ? '#4ade80' : '#f97316',
        }} />

        {/* Editable label */}
        <input
          value={m.label}
          onChange={e => onRename(m.id, e.target.value)}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            color: '#e2e8f0', fontSize: 11, fontWeight: 500,
            outline: 'none', minWidth: 0,
          }}
        />

        {/* Total length */}
        <span style={{ color: '#94a3b8', fontSize: 10, flexShrink: 0, fontFamily: 'monospace' }}>
          {fmt(totalDist)}
        </span>

        {/* Delete */}
        <button
          onClick={() => onDelete(m.id)}
          title="Delete measurement"
          style={{
            background: 'none', border: 'none', color: '#475569',
            cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1, flexShrink: 0,
          }}
        >
          🗑
        </button>
      </div>

      {/* Area badge (closed polygons) */}
      {m.isClosed && area > 0 && (
        <div style={{
          padding: '0 6px 4px 25px',
          fontSize: 10, color: '#4ade80', fontFamily: 'monospace', fontWeight: 600,
        }}>
          ⬡ {fmtArea(area)}
        </div>
      )}

      {/* Expanded: segment details */}
      {expanded && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          padding: '4px 6px 4px 25px',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {segments.map((seg, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 10, color: '#64748b',
            }}>
              <span>Segment {i + 1}</span>
              <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>
                {fmt(seg.length)}
              </span>
            </div>
          ))}
          {m.isClosed && closingLength > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 10, color: '#64748b',
            }}>
              <span>Closing</span>
              <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>
                {fmt(closingLength)}
              </span>
            </div>
          )}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 10, fontWeight: 700, color: '#e2e8f0',
            borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 3, marginTop: 1,
          }}>
            <span>Total</span>
            <span style={{ fontFamily: 'monospace' }}>{fmt(totalDist)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function MeasurementPanel() {
  const {
    savedMeasurements, removeMeasurement, updateMeasurementLabel, clearAllMeasurements,
    measureActive, setMeasureActive,
  } = useViewer()
  const { fmtLength, fmtArea } = useUnits()
  const [open, setOpen] = useState(true)

  if (savedMeasurements.length === 0 && !measureActive) return null

  return (
    <div style={{
      position: 'absolute', bottom: 12, left: 12, zIndex: 10,
      background: 'rgba(13,17,23,0.90)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      minWidth: 240, maxWidth: 280,
      maxHeight: 'calc(100vh - 100px)',
      display: 'flex', flexDirection: 'column',
      backdropFilter: 'blur(8px)',
      fontFamily: 'system-ui, sans-serif', fontSize: 12, color: '#e2e8f0',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: open ? 8 : 10 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            📏 Measurements
            {savedMeasurements.length > 0 && (
              <span style={{ color: '#64748b', fontWeight: 400, fontSize: 11, marginLeft: 6 }}>
                {savedMeasurements.length}
              </span>
            )}
          </span>
          <button
            onClick={() => setOpen(o => !o)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
          >
            {open ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ overflowY: 'auto', padding: '0 12px 10px', flex: 1, minHeight: 0 }}>
          {/* Measurement list */}
          {savedMeasurements.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
              {savedMeasurements.map(m => (
                <MeasurementRow
                  key={m.id}
                  m={m}
                  onRename={updateMeasurementLabel}
                  onDelete={removeMeasurement}
                  fmt={fmtLength}
                  fmtArea={fmtArea}
                />
              ))}
            </div>
          )}

          {savedMeasurements.length === 0 && (
            <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', padding: '8px 0' }}>
              No measurements yet
            </div>
          )}

          {/* Bottom actions */}
          <div style={{ display: 'flex', gap: 5 }}>
            <button
              onClick={() => setMeasureActive(true)}
              style={{
                flex: 1, padding: '5px 0',
                background: measureActive ? '#4c1d95' : '#1e293b',
                border: `1px solid ${measureActive ? '#7c3aed' : '#334155'}`,
                borderRadius: 5, color: measureActive ? '#ddd6fe' : '#94a3b8',
                fontWeight: 600, cursor: 'pointer', fontSize: 11,
              }}
            >
              {measureActive ? '📏 Measuring…' : '+ New'}
            </button>
            {savedMeasurements.length > 0 && (
              <button
                onClick={clearAllMeasurements}
                style={{
                  padding: '5px 10px',
                  background: '#1e293b', border: '1px solid #334155',
                  borderRadius: 5, color: '#94a3b8',
                  fontWeight: 600, cursor: 'pointer', fontSize: 11,
                }}
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
