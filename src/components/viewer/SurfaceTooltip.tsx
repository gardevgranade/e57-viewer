'use client'

import { useEffect, useRef } from 'react'
import { useViewer } from '../../lib/viewerState.js'
import { extractBoundaryPolygon } from '../../lib/surfaceBoundary.js'
import { splitSurfaceTriangles } from '../../lib/meshSurfaceDetect.js'
import type { PickedSurface, SurfaceGroup } from '../../lib/viewerState.js'

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

const SPLIT_COLORS = ['#ef4444','#3b82f6','#8b5cf6','#f59e0b','#10b981','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16']

/** Build a flat list of groups ordered depth-first with indent level. */
function flattenGroups(groups: SurfaceGroup[], parentId: string | null = null, depth = 0): Array<{ group: SurfaceGroup; depth: number }> {
  const children = groups.filter(g => g.parentId === parentId)
  const result: Array<{ group: SurfaceGroup; depth: number }> = []
  for (const g of children) {
    result.push({ group: g, depth })
    result.push(...flattenGroups(groups, g.id, depth + 1))
  }
  return result
}

export default function SurfaceTooltip() {
  const {
    surfaces, selectedSurfaceId, selectedSurfacePos,
    setSelectedSurfaceId,
    updateSurface, removeSurface, replaceSurface,
    traceSurfaceMeasure,
    surfaceGroups, addGroup,
  } = useViewer()

  const tooltipRef = useRef<HTMLDivElement>(null)
  const surf = surfaces.find(s => s.id === selectedSurfaceId) ?? null

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
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setSelectedSurfaceId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedSurfaceId, setSelectedSurfaceId])

  if (!surf || !selectedSurfaceId) return null

  const isRoofOrFloor = /^(roof|floor)/i.test(surf.label)
  const type = surf.label.toLowerCase().startsWith('roof') ? 'roof'
    : surf.label.toLowerCase().startsWith('floor') ? 'floor' : null
  const param = type === 'roof'
    ? `Slope: ${slopeAngle(surf.normal) ?? '—'}`
    : type === 'floor' && surf.worldTriangles
      ? (() => {
          const n = Math.floor(surf.worldTriangles.length / 9)
          let sum = 0
          for (let i = 0; i < n; i++) sum += surf.worldTriangles[i*9+1]!
          return `Elevation Y: ${(sum / n).toFixed(2)} m`
        })()
      : null

  // Position: near click, or center of screen if selected from list
  const TW = 256
  const pos = selectedSurfacePos
  const left = pos
    ? Math.min(pos.x + 14, window.innerWidth - TW - 8)
    : Math.round(window.innerWidth / 2 - TW / 2)
  const top = pos
    ? Math.min(pos.y - 10, window.innerHeight - 480)
    : 80

  const flatGroups = flattenGroups(surfaceGroups)

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
        color: SPLIT_COLORS[i % SPLIT_COLORS.length]!, visible: surf.visible,
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

  function handleAddSubgroup() {
    const parentId = surf?.groupId ?? null
    addGroup({ id: `group-${Date.now()}`, label: `Subgroup`, parentId })
  }

  const BTN: React.CSSProperties = {
    flex: 1, padding: '5px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    background: '#1e293b', border: '1px solid #334155', borderRadius: 5, color: '#94a3b8',
  }

  return (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed', left, top, zIndex: 200,
        width: TW,
        background: 'rgba(10,14,20,0.97)',
        border: `1.5px solid ${surf.color}55`,
        borderRadius: 12, padding: '12px 14px',
        backdropFilter: 'blur(12px)',
        fontFamily: 'system-ui, sans-serif', fontSize: 12, color: '#e2e8f0',
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${surf.color}22`,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      {/* ── Header: color swatch + name + close ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Color picker */}
        <label style={{ cursor: 'pointer', flexShrink: 0, position: 'relative' }} title="Change color">
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: surf.color,
            border: '2px solid rgba(255,255,255,0.2)',
            boxShadow: `0 0 0 3px ${surf.color}33`,
          }} />
          <input type="color" value={surf.color}
            onChange={e => updateSurface(surf.id, { color: e.target.value })}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
        </label>

        {/* Name input */}
        <input
          value={surf.label}
          onChange={e => updateSurface(surf.id, { label: e.target.value })}
          placeholder="Surface name"
          style={{
            flex: 1, background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
            color: '#f1f5f9', fontSize: 13, fontWeight: 700,
            outline: 'none', padding: '3px 8px',
          }}
        />

        {/* Close */}
        <button onClick={() => setSelectedSurfaceId(null)}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 15, padding: 0, lineHeight: 1, flexShrink: 0 }}>
          ✕
        </button>
      </div>

      {/* ── Stats ── */}
      {(surf.area != null || param) && (
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {surf.area != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Area</span>
              <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{fmtArea(surf.area)}</span>
            </div>
          )}
          {param && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>{param.split(':')[0]}</span>
              <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{param.split(':')[1]?.trim()}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Group assignment ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group</div>
        <div style={{ display: 'flex', gap: 5 }}>
          <select
            value={surf.groupId ?? ''}
            onChange={e => updateSurface(surf.id, { groupId: e.target.value || null })}
            style={{
              flex: 1, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8',
              fontSize: 11, borderRadius: 6, padding: '4px 6px', cursor: 'pointer',
            }}
          >
            <option value="">— No group —</option>
            {flatGroups.map(({ group, depth }) => (
              <option key={group.id} value={group.id}>
                {'  '.repeat(depth)}{depth > 0 ? '↳ ' : ''}{group.label}
              </option>
            ))}
          </select>
          <button
            title="New group"
            onClick={() => { addGroup({ id: `group-${Date.now()}`, label: 'Group', parentId: null }) }}
            style={{ ...BTN, flex: 'none', padding: '4px 8px', color: '#7dd3fc' }}
          >
            + Group
          </button>
        </div>
        {surf.groupId && (
          <button
            title="Add subgroup inside current group"
            onClick={handleAddSubgroup}
            style={{ ...BTN, color: '#a5b4fc', fontSize: 10 }}
          >
            + Subgroup inside "{surfaceGroups.find(g => g.id === surf.groupId)?.label ?? '...'}"
          </button>
        )}
      </div>

      {/* ── Visibility + type swap ── */}
      <div style={{ display: 'flex', gap: 5 }}>
        <button style={BTN} onClick={() => updateSurface(surf.id, { visible: !surf.visible })}>
          {surf.visible ? '👁 Hide' : '🙈 Show'}
        </button>
        {isRoofOrFloor && (
          <button style={BTN}
            onClick={() => updateSurface(surf.id, { label: swapType(surf.label) })}
            title={/^roof/i.test(surf.label) ? 'Mark as Floor' : 'Mark as Roof'}
          >
            {/^roof/i.test(surf.label) ? '⬇ → Floor' : '⬆ → Roof'}
          </button>
        )}
      </div>

      {/* ── Measure + Split ── */}
      {surf.worldTriangles && surf.worldTriangles.length >= 27 && (
        <div style={{ display: 'flex', gap: 5 }}>
          <button style={{ ...BTN, color: '#7dd3fc' }} onClick={handleTrace}>📏 Measure</button>
          <button style={BTN} onClick={handleSplit}>✂️ Split</button>
        </div>
      )}

      {/* ── Delete ── */}
      <button
        onClick={() => { removeSurface(surf.id); setSelectedSurfaceId(null) }}
        style={{ ...BTN, color: '#f87171', borderColor: '#7f1d1d', padding: '5px 0' }}
      >
        🗑 Delete Surface
      </button>
    </div>
  )
}
