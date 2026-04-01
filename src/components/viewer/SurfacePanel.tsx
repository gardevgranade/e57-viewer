'use client'

import { useState } from 'react'
import { useViewer } from '../../lib/viewerState.js'
import type { PickedSurface, SurfaceGroup } from '../../lib/viewerState.js'
import { detectSurfaces } from '../../lib/surfaceDetect.js'
import { detectMeshSurfaces, splitSurfaceTriangles } from '../../lib/meshSurfaceDetect.js'
import { extractBoundaryPolygon } from '../../lib/surfaceBoundary.js'
import * as THREE from 'three'

function fmtArea(m2: number) {
  if (m2 < 0.01) return `${(m2 * 1e4).toFixed(1)} cm²`
  if (m2 < 10000) return `${m2.toFixed(2)} m²`
  return `${(m2 / 10000).toFixed(2)} ha`
}

function groupTotalArea(groupId: string | null, surfaces: PickedSurface[]): number {
  return surfaces
    .filter(s => s.groupId === groupId && s.area != null)
    .reduce((sum, s) => sum + (s.area ?? 0), 0)
}

// --- SurfaceRow ---

interface SurfaceRowProps {
  surf: PickedSurface
  groups: SurfaceGroup[]
  onUpdate: (id: string, patch: Partial<Pick<PickedSurface, 'label' | 'color' | 'visible' | 'groupId'>>) => void
  onRemove: (id: string) => void
  onSplit: (id: string) => void
  onTrace: (id: string) => void
  /** Extra info line shown below the main row (slope, elevation, etc.) */
  param?: string
}

function SurfaceRow({ surf, groups, onUpdate, onRemove, onSplit, onTrace, param }: SurfaceRowProps) {
  return (
    <div>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      background: 'rgba(255,255,255,0.03)', borderRadius: param ? '5px 5px 0 0' : 5, padding: '3px 5px',
      opacity: surf.visible ? 1 : 0.45,
    }}>
      {/* Color swatch / picker */}
      <label style={{ cursor: 'pointer', flexShrink: 0, position: 'relative' }}>
        <div style={{
          width: 15, height: 15, borderRadius: 3,
          background: surf.color, border: '2px solid rgba(255,255,255,0.2)',
        }} />
        <input
          type="color"
          value={surf.color}
          onChange={e => onUpdate(surf.id, { color: e.target.value })}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
        />
      </label>

      {/* Label */}
      <input
        value={surf.label}
        onChange={e => onUpdate(surf.id, { label: e.target.value })}
        style={{
          flex: 1, background: 'transparent', border: 'none',
          color: '#e2e8f0', fontSize: 11, fontWeight: 500,
          outline: 'none', minWidth: 0,
        }}
      />

      {/* Area or point count */}
      <span style={{ color: '#64748b', fontSize: 10, flexShrink: 0 }}>
        {surf.area != null
          ? fmtArea(surf.area)
          : surf.pointCount != null
            ? surf.pointCount > 1000
              ? `${(surf.pointCount / 1000).toFixed(1)}k pts`
              : `${surf.pointCount} pts`
            : ''}
      </span>

      {/* Group assignment dropdown */}
      {groups.length > 0 && (
        <select
          value={surf.groupId ?? ''}
          onChange={e => onUpdate(surf.id, { groupId: e.target.value || null })}
          style={{
            background: '#1e293b', border: '1px solid #334155',
            color: '#94a3b8', fontSize: 10, borderRadius: 3, padding: '1px 2px',
            cursor: 'pointer', maxWidth: 64,
          }}
        >
          <option value="">None</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      )}

      {/* Visibility toggle */}
      <button
        onClick={() => onUpdate(surf.id, { visible: !surf.visible })}
        title={surf.visible ? 'Hide' : 'Show'}
        style={{ background: 'none', border: 'none', color: surf.visible ? '#e2e8f0' : '#334155', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}
      >
        {surf.visible ? '👁' : '🙈'}
      </button>

      {/* Trace perimeter with measure tool */}
      {surf.worldTriangles && surf.worldTriangles.length >= 27 && (
        <button
          onClick={() => onTrace(surf.id)}
          title="Trace perimeter with measure tool"
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}
        >
          📏
        </button>
      )}

      {/* Split surface */}
      {surf.worldTriangles && surf.worldTriangles.length >= 18 && (
        <button
          onClick={() => onSplit(surf.id)}
          title="Split into disconnected parts"
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}
        >
          ✂️
        </button>
      )}

      {/* Delete */}
      <button
        onClick={() => onRemove(surf.id)}
        title="Delete surface"
        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}
      >
        🗑
      </button>
    </div>
    {param && (
      <div style={{
        background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 5px 5px',
        padding: '2px 8px', fontSize: 10, color: '#64748b',
      }}>
        {param}
      </div>
    )}
    </div>
  )
}

// --- SurfacePanel ---

const BTN_BASE: React.CSSProperties = {
  background: '#1e293b', border: '1px solid #334155',
  borderRadius: 5, color: '#94a3b8', cursor: 'pointer',
  fontSize: 11, fontWeight: 600,
}

export default function SurfacePanel() {
  const {
    streamStatus, fileType,
    surfaces, setSurfaces, updateSurface, addSurface: _addSurface, removeSurface, replaceSurface,
    surfaceGroups, addGroup, removeGroup, updateGroup,
    setSurfaceColorMode, surfaceColorMode,
    pickSurfaceMode, setPickSurfaceMode,
    pointCloudGeoRef, meshObjectRef,
    meshVisible, setMeshVisible,
    traceSurfaceMeasure,
  } = useViewer()

  const [detecting, setDetecting] = useState(false)
  const [open, setOpen] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [filterType, setFilterType] = useState<'all' | 'roof' | 'floor' | 'wall'>('all')

  const isMesh = fileType && fileType !== 'e57'
  if (streamStatus !== 'done') return null

  function toggleGroupCollapsed(id: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleGroupVisibility(groupId: string) {
    const inGroup = surfaces.filter(s => s.groupId === groupId)
    const anyVisible = inGroup.some(s => s.visible)
    for (const s of inGroup) updateSurface(s.id, { visible: !anyVisible })
  }

  async function handleDetect() {
    setDetecting(true)
    await new Promise(r => setTimeout(r, 30))
    try {
      const geoData = pointCloudGeoRef.current
      if (!geoData) return
      const { geometry, matrixWorld, count } = geoData
      const posAttr = geometry.getAttribute('position')
      const worldPos = new Float32Array(count * 3)
      const v = new THREE.Vector3()
      for (let i = 0; i < count; i++) {
        v.fromBufferAttribute(posAttr, i).applyMatrix4(matrixWorld)
        worldPos[i * 3] = v.x
        worldPos[i * 3 + 1] = v.y
        worldPos[i * 3 + 2] = v.z
      }
      const detected = detectSurfaces(worldPos, count)
      const picked: PickedSurface[] = detected.map(d => ({
        id: d.id,
        label: d.label,
        color: d.color,
        visible: d.visible,
        groupId: null,
        pointIndices: d.pointIndices,
        pointCount: d.pointCount,
        area: d.area,
        worldTriangles: d.worldTriangles,
        normal: d.normal,
      }))
      setSurfaces(picked)
    } finally {
      setDetecting(false)
    }
  }

  async function handleMeshDetect() {
    const obj = meshObjectRef.current
    if (!obj) return
    setDetecting(true)
    await new Promise(r => setTimeout(r, 30))
    try {
      const detected = detectMeshSurfaces(obj)
      const picked: PickedSurface[] = detected.map(d => ({
        id: d.id, label: d.label, color: d.color, visible: d.visible,
        groupId: null, area: d.area, worldTriangles: d.worldTriangles,
        pointIndices: [], pointCount: d.pointCount, normal: d.normal,
      }))
      setSurfaces(picked)
    } finally {
      setDetecting(false)
    }
  }

  function handleClearAll() {
    setSurfaces([])
    setSurfaceColorMode(false)
    if (pickSurfaceMode) setPickSurfaceMode(false)
  }

  function handleSplit(id: string) {
    const surf = surfaces.find(s => s.id === id)
    if (!surf?.worldTriangles) return
    const parts = splitSurfaceTriangles(surf.worldTriangles)
    if (parts.length <= 1) return // nothing to split
    const COLORS = ['#ef4444','#3b82f6','#8b5cf6','#f59e0b','#10b981','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16']
    const replacements: PickedSurface[] = parts.map((wt, i) => {
      const triCount = Math.floor(wt.length / 9)
      let area = 0
      for (let t = 0; t < triCount; t++) {
        const ax = wt[t*9]!, ay = wt[t*9+1]!, az = wt[t*9+2]!
        const bx = wt[t*9+3]!, by = wt[t*9+4]!, bz = wt[t*9+5]!
        const cx = wt[t*9+6]!, cy = wt[t*9+7]!, cz = wt[t*9+8]!
        const e1x=bx-ax,e1y=by-ay,e1z=bz-az,e2x=cx-ax,e2y=cy-ay,e2z=cz-az
        const nx=e1y*e2z-e1z*e2y, ny=e1z*e2x-e1x*e2z, nz=e1x*e2y-e1y*e2x
        area += Math.sqrt(nx*nx+ny*ny+nz*nz) / 2
      }
      return {
        id: crypto.randomUUID(),
        label: `${surf.label} ${i + 1}`,
        color: COLORS[i % COLORS.length]!,
        visible: surf.visible,
        groupId: surf.groupId,
        area,
        worldTriangles: wt,
        pointIndices: [],
        pointCount: triCount,
      }
    })
    replaceSurface(id, replacements)
  }

  function handleTrace(id: string) {
    const surf = surfaces.find(s => s.id === id)
    if (!surf?.worldTriangles) return
    const pts = extractBoundaryPolygon(surf.worldTriangles)
    if (!pts || pts.length < 3) return
    traceSurfaceMeasure(pts)
  }

  // Derive surface type from label for filtering
  function surfaceType(label: string): 'roof' | 'floor' | 'wall' | 'other' {
    const l = label.toLowerCase()
    if (l.startsWith('roof')) return 'roof'
    if (l.startsWith('floor')) return 'floor'
    if (l.startsWith('wall')) return 'wall'
    return 'other'
  }

  function matchesFilter(surf: PickedSurface) {
    if (filterType === 'all') return true
    return surfaceType(surf.label) === filterType
  }

  // Slope angle in degrees (from horizontal): arccos(|normalY|)
  function slopeAngle(normal: [number, number, number] | undefined): string | null {
    if (!normal) return null
    const absy = Math.abs(normal[1])
    const angle = Math.acos(Math.min(1, absy)) * 180 / Math.PI
    return `${angle.toFixed(1)}°`
  }

  // Centroid Y elevation from worldTriangles
  function elevation(wt: Float32Array | undefined): string | null {
    if (!wt || wt.length < 9) return null
    let sum = 0
    const n = Math.floor(wt.length / 9)
    for (let i = 0; i < n; i++) sum += wt[i*9+1]!
    return `Y: ${(sum / n).toFixed(2)} m`
  }

  function handleAddGroup() {
    addGroup({ id: `group-${Date.now()}`, label: `Group ${surfaceGroups.length + 1}` })
  }

  const ungroupedSurfaces = surfaces.filter(s => s.groupId === null && matchesFilter(s))

  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, zIndex: 10,
      background: 'rgba(13,17,23,0.90)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: '10px 12px',
      minWidth: 248, maxWidth: 288,
      backdropFilter: 'blur(8px)',
      fontFamily: 'system-ui, sans-serif', fontSize: 12, color: '#e2e8f0',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: open ? 8 : 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Surfaces</span>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
        >
          {open ? '▲' : '▼'}
        </button>
      </div>

      {open && (
        <>
          {/* ── Filter pills + hide model ── */}
          {surfaces.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
              {(['all', 'roof', 'floor', 'wall'] as const).map(ft => (
                <button key={ft} onClick={() => setFilterType(ft)} style={{
                  padding: '1px 7px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  background: filterType === ft ? '#334155' : 'transparent',
                  border: '1px solid #334155', borderRadius: 10,
                  color: filterType === ft ? '#e2e8f0' : '#64748b',
                }}>
                  {ft === 'all' ? 'All' : ft.charAt(0).toUpperCase() + ft.slice(1)}
                </button>
              ))}
              {isMesh && (
                <button onClick={() => setMeshVisible(!meshVisible)} style={{
                  marginLeft: 'auto', padding: '1px 7px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  background: meshVisible ? 'transparent' : '#1e293b',
                  border: `1px solid ${meshVisible ? '#334155' : '#7c3aed'}`,
                  borderRadius: 10, color: meshVisible ? '#64748b' : '#c4b5fd',
                }}>
                  {meshVisible ? '👁 Model' : '🙈 Model'}
                </button>
              )}
            </div>
          )}

          {/* ── Mesh: pick-surface toggle + auto-detect ── */}
          {isMesh && (
            <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={() => setPickSurfaceMode(!pickSurfaceMode)}
                style={{
                  width: '100%', padding: '6px 0',
                  background: pickSurfaceMode ? '#4c1d95' : '#1e293b',
                  border: `1px solid ${pickSurfaceMode ? '#7c3aed' : '#334155'}`,
                  borderRadius: 6, color: pickSurfaceMode ? '#ddd6fe' : '#94a3b8',
                  fontWeight: 600, cursor: 'pointer', fontSize: 12,
                }}
              >
                🖱 {pickSurfaceMode ? 'Picking… (click to stop)' : 'Pick Surface'}
              </button>
              {pickSurfaceMode && (
                <div style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center' }}>
                  Click any face to select it
                </div>
              )}

              {/* Auto-detect row */}
              <button
                onClick={handleMeshDetect}
                disabled={detecting}
                style={{
                  width: '100%', padding: '4px 0',
                  background: detecting ? '#1e293b' : '#0f4c75',
                  border: `1px solid ${detecting ? '#334155' : '#1a6fa8'}`,
                  borderRadius: 5, color: detecting ? '#64748b' : '#7dd3fc',
                  fontWeight: 600, cursor: detecting ? 'not-allowed' : 'pointer', fontSize: 11,
                }}
              >
                {detecting ? '⏳…' : '🔍 Auto-Detect All'}
              </button>
            </div>
          )}

          {/* ── E57: detect button ── */}
          {!isMesh && (
            <button
              onClick={handleDetect}
              disabled={detecting}
              style={{
                width: '100%', padding: '6px 0',
                background: detecting ? '#1e293b' : '#1d4ed8',
                border: 'none', borderRadius: 6,
                color: detecting ? '#64748b' : '#fff',
                fontWeight: 600, cursor: detecting ? 'not-allowed' : 'pointer',
                fontSize: 12, marginBottom: 8,
              }}
            >
              {detecting ? '⏳ Analyzing…' : '🔍 Detect All Surfaces'}
            </button>
          )}

          {/* ── Surface list ── */}
          {surfaces.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 340, overflowY: 'auto', marginBottom: 8 }}>

              {/* Groups */}
              {surfaceGroups.map(group => {
                const inGroup = surfaces.filter(s => s.groupId === group.id && matchesFilter(s))
                const collapsed = collapsedGroups.has(group.id)
                const anyVisible = inGroup.some(s => s.visible)
                const totalArea = groupTotalArea(group.id, surfaces)

                return (
                  <div key={group.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden' }}>
                    {/* Group header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 6px',
                      borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <button
                        onClick={() => toggleGroupCollapsed(group.id)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 10, padding: 0, flexShrink: 0 }}
                      >
                        {collapsed ? '▶' : '▼'}
                      </button>
                      <input
                        value={group.label}
                        onChange={e => updateGroup(group.id, { label: e.target.value })}
                        style={{
                          flex: 1, background: 'transparent', border: 'none',
                          color: '#f59e0b', fontSize: 11, fontWeight: 700,
                          outline: 'none', minWidth: 0,
                        }}
                      />
                      {totalArea > 0 && (
                        <span style={{ color: '#64748b', fontSize: 10, flexShrink: 0 }}>{fmtArea(totalArea)}</span>
                      )}
                      <button
                        onClick={() => toggleGroupVisibility(group.id)}
                        title={anyVisible ? 'Hide group' : 'Show group'}
                        style={{ background: 'none', border: 'none', color: anyVisible ? '#e2e8f0' : '#334155', cursor: 'pointer', fontSize: 12, padding: 0, flexShrink: 0 }}
                      >
                        {anyVisible ? '👁' : '🙈'}
                      </button>
                      <button
                        onClick={() => removeGroup(group.id)}
                        title="Delete group"
                        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 11, padding: 0, flexShrink: 0 }}
                      >
                        🗑
                      </button>
                    </div>

                    {/* Group surfaces */}
                    {!collapsed && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '3px 4px' }}>
                        {inGroup.length === 0
                          ? <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', padding: '4px 0' }}>No surfaces</div>
                          : inGroup.map(surf => {
                              const type = surfaceType(surf.label)
                              const p = type === 'roof'
                                ? `Slope: ${slopeAngle(surf.normal) ?? '—'}`
                                : type === 'floor'
                                  ? elevation(surf.worldTriangles) ?? undefined
                                  : undefined
                              return (
                                <SurfaceRow key={surf.id} surf={surf} groups={surfaceGroups}
                                  onUpdate={updateSurface} onRemove={removeSurface}
                                  onSplit={handleSplit} onTrace={handleTrace} param={p} />
                              )
                            })
                        }
                        {inGroup.length > 0 && (
                          <div style={{ color: '#475569', fontSize: 10, textAlign: 'right', paddingRight: 4 }}>
                            {inGroup.length} surface{inGroup.length !== 1 ? 's' : ''}
                            {totalArea > 0 ? ` · ${fmtArea(totalArea)}` : ''}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Ungrouped */}
              {ungroupedSurfaces.length > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 6px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <span style={{ flex: 1, color: '#64748b', fontSize: 11, fontWeight: 600 }}>Ungrouped</span>
                    {groupTotalArea(null, surfaces) > 0 && (
                      <span style={{ color: '#64748b', fontSize: 10 }}>{fmtArea(groupTotalArea(null, surfaces))}</span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{ungroupedSurfaces.length} surface{ungroupedSurfaces.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '3px 4px' }}>
                    {ungroupedSurfaces.map(surf => {
                      const type = surfaceType(surf.label)
                      const p = type === 'roof'
                        ? `Slope: ${slopeAngle(surf.normal) ?? '—'}`
                        : type === 'floor'
                          ? elevation(surf.worldTriangles) ?? undefined
                          : undefined
                      return (
                        <SurfaceRow key={surf.id} surf={surf} groups={surfaceGroups}
                          onUpdate={updateSurface} onRemove={removeSurface}
                          onSplit={handleSplit} onTrace={handleTrace} param={p} />
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Bottom toolbar ── */}
          <div style={{ display: 'flex', gap: 5, marginBottom: surfaces.length > 0 ? 6 : 0 }}>
            <button onClick={handleAddGroup} style={{ ...BTN_BASE, flex: 1, padding: '4px 0' }}>
              + New Group
            </button>
            <button onClick={handleClearAll} style={{ ...BTN_BASE, padding: '4px 10px' }}>
              Clear All
            </button>
          </div>

          {/* ── Colors toggle ── */}
          {surfaces.length > 0 && (
            <button
              onClick={() => setSurfaceColorMode(!surfaceColorMode)}
              style={{
                width: '100%', padding: '4px 0', fontSize: 11, fontWeight: 600,
                background: surfaceColorMode ? '#166534' : '#1e293b',
                border: `1px solid ${surfaceColorMode ? '#16a34a' : '#334155'}`,
                borderRadius: 5, color: surfaceColorMode ? '#4ade80' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              {surfaceColorMode ? '● Colors ON' : '○ Colors OFF'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
