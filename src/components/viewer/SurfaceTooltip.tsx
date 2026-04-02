'use client'

import { useEffect, useRef } from 'react'
import { useViewer } from '../../lib/viewerState.js'
import { extractBoundaryPolygon } from '../../lib/surfaceBoundary.js'
import { splitSurfaceTriangles } from '../../lib/meshSurfaceDetect.js'
import type { PickedSurface } from '../../lib/viewerState.js'

function fmtArea(m2: number) {
  if (m2 < 0.01) return `${(m2 * 1e4).toFixed(1)} cm²`
  if (m2 < 10000) return `${m2.toFixed(2)} m²`
  return `${(m2 / 10000).toFixed(2)} ha`
}

function swapType(label: string) {
  if (/^roof/i.test(label)) return label.replace(/^roof/i, 'Floor')
  if (/^floor/i.test(label)) return label.replace(/^floor/i, 'Roof')
  return label
}

function slopeAngle(normal: [number, number, number] | undefined) {
  if (!normal) return null
  return `${(Math.acos(Math.min(1, Math.abs(normal[1]))) * 180 / Math.PI).toFixed(1)}°`
}

const COLORS = ['#ef4444','#3b82f6','#8b5cf6','#f59e0b','#10b981','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16']

export default function SurfaceTooltip() {
  const {
    surfaces, selectedSurfaceId, selectedSurfacePos,
    setSelectedSurfaceId,
    updateSurface, removeSurface, replaceSurface,
    traceSurfaceMeasure,
    surfaceGroups,
  } = useViewer()

  const tooltipRef = useRef<HTMLDivElement>(null)

  const surf = surfaces.find(s => s.id === selectedSurfaceId) ?? null
  const pos = selectedSurfacePos

  // Close on click outside
  useEffect(() => {
    if (!selectedSurfaceId) return
    function onDown(e: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setSelectedSurfaceId(null)
      }
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
  }, [selectedSurfaceId, setSelectedSurfaceId])

  // Close on Escape
  useEffect(() => {
    if (!selectedSurfaceId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedSurfaceId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedSurfaceId, setSelectedSurfaceId])

  if (!surf || !pos) return null

  const isRoofOrFloor = /^(roof|floor)/i.test(surf.label)
  const type = surf.label.toLowerCase().startsWith('roof') ? 'roof'
    : surf.label.toLowerCase().startsWith('floor') ? 'floor' : null
  const param = type === 'roof' ? `Slope: ${slopeAngle(surf.normal) ?? '—'}`
    : type === 'floor' && surf.worldTriangles
      ? (() => {
          const n = Math.floor(surf.worldTriangles.length / 9)
          let sum = 0
          for (let i = 0; i < n; i++) sum += surf.worldTriangles[i*9+1]!
          return `Elevation Y: ${(sum / n).toFixed(2)} m`
        })()
      : null

  // Clamp position so tooltip stays within viewport
  const TW = 240, TH = 280
  const x = Math.min(pos.x + 12, window.innerWidth - TW - 8)
  const y = Math.min(pos.y - 10, window.innerHeight - TH - 8)

  function handleSplit() {
    if (!surf?.worldTriangles) return
    const parts = splitSurfaceTriangles(surf.worldTriangles)
    if (parts.length <= 1) return
    const replacements: PickedSurface[] = parts.map((wt, i) => {
      const tc = Math.floor(wt.length / 9)
      let area = 0
      for (let t = 0; t < tc; t++) {
        const ax=wt[t*9]!,ay=wt[t*9+1]!,az=wt[t*9+2]!
        const bx=wt[t*9+3]!,by=wt[t*9+4]!,bz=wt[t*9+5]!
        const cx=wt[t*9+6]!,cy=wt[t*9+7]!,cz=wt[t*9+8]!
        const e1x=bx-ax,e1y=by-ay,e1z=bz-az,e2x=cx-ax,e2y=cy-ay,e2z=cz-az
        const nx=e1y*e2z-e1z*e2y,ny=e1z*e2x-e1x*e2z,nz=e1x*e2y-e1y*e2x
        area += Math.sqrt(nx*nx+ny*ny+nz*nz) / 2
      }
      return {
        id: crypto.randomUUID(), label: `${surf.label} ${i+1}`,
        color: COLORS[i % COLORS.length]!, visible: surf.visible,
        groupId: surf.groupId, area, worldTriangles: wt,
        pointIndices: [], pointCount: tc,
      }
    })
    replaceSurface(surf.id, replacements)
    setSelectedSurfaceId(null)
  }

  function handleTrace() {
    if (!surf?.worldTriangles) return
    const pts = extractBoundaryPolygon(surf.worldTriangles)
    if (!pts || pts.length < 3) return
    traceSurfaceMeasure(pts)
    setSelectedSurfaceId(null)
  }

  const BTN: React.CSSProperties = {
    flex: 1, padding: '4px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    background: '#1e293b', border: '1px solid #334155', borderRadius: 5,
    color: '#94a3b8',
  }

  return (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed', left: x, top: y, zIndex: 100,
        width: TW,
        background: 'rgba(13,17,23,0.96)',
        border: `1px solid ${surf.color}44`,
        borderRadius: 10, padding: '10px 12px',
        backdropFilter: 'blur(10px)',
        fontFamily: 'system-ui, sans-serif', fontSize: 12, color: '#e2e8f0',
        boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px ${surf.color}22`,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      {/* Header: color + label + close */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ cursor: 'pointer', flexShrink: 0, position: 'relative' }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: surf.color, border: '2px solid rgba(255,255,255,0.25)' }} />
          <input type="color" value={surf.color}
            onChange={e => updateSurface(surf.id, { color: e.target.value })}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
        </label>
        <input
          value={surf.label}
          onChange={e => updateSurface(surf.id, { label: e.target.value })}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            color: '#e2e8f0', fontSize: 13, fontWeight: 700, outline: 'none',
          }}
        />
        <button onClick={() => setSelectedSurfaceId(null)}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>
          ✕
        </button>
      </div>

      {/* Area + param */}
      {(surf.area != null || param) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, color: '#64748b', fontSize: 11 }}>
          {surf.area != null && <span>Area: <b style={{ color: '#94a3b8' }}>{fmtArea(surf.area)}</b></span>}
          {param && <span>{param}</span>}
        </div>
      )}

      {/* Group assignment */}
      {surfaceGroups.length > 0 && (
        <select value={surf.groupId ?? ''}
          onChange={e => updateSurface(surf.id, { groupId: e.target.value || null })}
          style={{
            background: '#1e293b', border: '1px solid #334155', color: '#94a3b8',
            fontSize: 11, borderRadius: 5, padding: '3px 6px', cursor: 'pointer', width: '100%',
          }}>
          <option value="">No Group</option>
          {surfaceGroups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      )}

      {/* Action buttons row 1 */}
      <div style={{ display: 'flex', gap: 5 }}>
        <button style={BTN} onClick={() => updateSurface(surf.id, { visible: !surf.visible })}>
          {surf.visible ? '👁 Hide' : '🙈 Show'}
        </button>
        {isRoofOrFloor && (
          <button style={BTN} onClick={() => updateSurface(surf.id, { label: swapType(surf.label) })}
            title={/^roof/i.test(surf.label) ? 'Change to Floor' : 'Change to Roof'}>
            {/^roof/i.test(surf.label) ? '⬇ Floor' : '⬆ Roof'}
          </button>
        )}
      </div>

      {/* Action buttons row 2 */}
      {surf.worldTriangles && surf.worldTriangles.length >= 27 && (
        <div style={{ display: 'flex', gap: 5 }}>
          <button style={{ ...BTN, color: '#7dd3fc' }} onClick={handleTrace} title="Trace perimeter">
            📏 Measure
          </button>
          <button style={BTN} onClick={handleSplit} title="Split disconnected parts">
            ✂️ Split
          </button>
        </div>
      )}

      {/* Delete */}
      <button
        onClick={() => { removeSurface(surf.id); setSelectedSurfaceId(null) }}
        style={{ ...BTN, color: '#f87171', borderColor: '#7f1d1d' }}
      >
        🗑 Delete Surface
      </button>
    </div>
  )
}
