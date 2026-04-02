'use client'

import { useState, useRef, useEffect } from 'react'
import { useViewer } from '../../lib/viewerState.js'

export default function LassoOverlay() {
  const {
    lassoMode, setLassoMode,
    lassoPath, setLassoPath,
    setLassoDrawingComplete,
    lassoTriangleMode, setLassoTriangleMode,
    lassoSelectedIds, setLassoSelectedIds,
    lassoSelectedTriangles, setLassoSelectedTriangles,
    surfaces, updateSurface, removeSurface, addSurface,
    surfaceGroups, addGroup,
    updateSurfaceGeometry,
  } = useViewer()

  const [isDrawing, setIsDrawing] = useState(false)
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null)
  const [showGroupMenu, setShowGroupMenu] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

  const hasSelection = lassoTriangleMode
    ? (lassoSelectedTriangles !== null)
    : (lassoSelectedIds !== null)

  useEffect(() => {
    if (!hasSelection) return
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) clearSelection()
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [hasSelection])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lassoMode) { clearSelection(); setLassoMode(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lassoMode])

  function clearSelection() {
    setLassoSelectedIds(null)
    setLassoSelectedTriangles(null)
    setLassoPath([])
    setShowGroupMenu(false)
    setPopupPos(null)
  }

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!lassoMode) return
    e.preventDefault(); e.stopPropagation()
    setIsDrawing(true)
    clearSelection()
    setLassoPath([{ x: e.clientX, y: e.clientY }])
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing) return
    e.preventDefault()
    setLassoPath([...lassoPath, { x: e.clientX, y: e.clientY }])
  }

  const handleMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing) return
    e.preventDefault()
    setIsDrawing(false)
    if (lassoPath.length < 3) { setLassoPath([]); return }
    setPopupPos({ x: e.clientX, y: e.clientY })
    setLassoDrawingComplete(true)
  }

  // ── Surface mode actions ──
  function doHide() {
    lassoSelectedIds?.forEach(id => updateSurface(id, { visible: false }))
    clearSelection()
  }
  function doGroupNew() {
    const id = `group-${Date.now()}`
    addGroup({ id, label: `Lasso Group ${surfaceGroups.length + 1}`, parentId: null })
    lassoSelectedIds?.forEach(sid => updateSurface(sid, { groupId: id }))
    clearSelection()
  }
  function doMoveToGroup(groupId: string) {
    lassoSelectedIds?.forEach(id => updateSurface(id, { groupId }))
    clearSelection()
  }
  function doDelete() {
    lassoSelectedIds?.forEach(id => removeSurface(id))
    clearSelection()
  }

  // ── Triangle mode actions ──
  function buildFilteredTriangles(wt: Float32Array, keep: Set<number>): Float32Array {
    const indices = Array.from({ length: wt.length / 9 }, (_, i) => i).filter(i => keep.has(i))
    const out = new Float32Array(indices.length * 9)
    indices.forEach((ti, ni) => { for (let j = 0; j < 9; j++) out[ni * 9 + j] = wt[ti * 9 + j] })
    return out
  }

  function doDeleteTriangles() {
    if (!lassoSelectedTriangles) return
    for (const { surfaceId, triangleIndices } of lassoSelectedTriangles) {
      const surf = surfaces.find(s => s.id === surfaceId)
      if (!surf?.worldTriangles) continue
      const total = surf.worldTriangles.length / 9
      if (triangleIndices.length >= total) {
        removeSurface(surfaceId)
      } else {
        const removeSet = new Set(triangleIndices)
        const keepSet = new Set(Array.from({ length: total }, (_, i) => i).filter(i => !removeSet.has(i)))
        updateSurfaceGeometry(surfaceId, buildFilteredTriangles(surf.worldTriangles, keepSet))
      }
    }
    clearSelection()
  }

  function doSeparateTriangles() {
    if (!lassoSelectedTriangles) return
    for (const { surfaceId, triangleIndices } of lassoSelectedTriangles) {
      const surf = surfaces.find(s => s.id === surfaceId)
      if (!surf?.worldTriangles) continue
      const total = surf.worldTriangles.length / 9
      const selSet = new Set(triangleIndices)

      // New surface from selected triangles
      const selWt = new Float32Array(triangleIndices.length * 9)
      triangleIndices.forEach((ti, ni) => { for (let j = 0; j < 9; j++) selWt[ni * 9 + j] = surf.worldTriangles![ti * 9 + j] })
      addSurface({
        id: `surf-frag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: 'Fragment',
        color: '#eab308',
        visible: true,
        groupId: surf.groupId,
        area: surf.area ? surf.area * (triangleIndices.length / total) : undefined,
        worldTriangles: selWt,
        pointIndices: [],
        pointCount: 0,
      })

      // Remove selected from original
      if (selSet.size >= total) {
        removeSurface(surfaceId)
      } else {
        const keepSet = new Set(Array.from({ length: total }, (_, i) => i).filter(i => !selSet.has(i)))
        updateSurfaceGeometry(surfaceId, buildFilteredTriangles(surf.worldTriangles, keepSet))
      }
    }
    clearSelection()
  }

  if (!lassoMode) return null

  const pathD = lassoPath.length > 1
    ? `M ${lassoPath.map(p => `${p.x},${p.y}`).join(' L ')} Z`
    : ''

  // Popup counts
  const surfCount = lassoSelectedIds?.length ?? 0
  const triCount = lassoSelectedTriangles?.reduce((s, x) => s + x.triangleIndices.length, 0) ?? 0
  const triSurfCount = lassoSelectedTriangles?.length ?? 0

  const W = 215
  const popX = popupPos ? Math.min(Math.max(popupPos.x, 8), window.innerWidth - W - 8) : 0
  const popY = popupPos ? Math.min(Math.max(popupPos.y - 20, 8), window.innerHeight - 280) : 0

  return (
    <>
      {/* SVG capture layer */}
      <svg
        style={{ position: 'fixed', inset: 0, zIndex: 200, cursor: 'crosshair', pointerEvents: 'auto', width: '100vw', height: '100vh', userSelect: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {pathD && (
          <path d={pathD}
            fill={lassoTriangleMode ? 'rgba(234,179,8,0.10)' : 'rgba(99,102,241,0.10)'}
            stroke={lassoTriangleMode ? '#eab308' : '#6366f1'}
            strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round" strokeLinejoin="round"
          />
        )}
      </svg>

      {/* Hint bar with mode toggle */}
      {!hasSelection && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 300, background: 'rgba(15,23,42,0.88)',
          border: `1px solid ${lassoTriangleMode ? 'rgba(234,179,8,0.4)' : 'rgba(99,102,241,0.4)'}`,
          borderRadius: 20, padding: '5px 6px 5px 14px',
          pointerEvents: 'auto', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 12, color: lassoTriangleMode ? '#fcd34d' : '#a5b4fc', fontWeight: 600 }}>
            ✏️ Draw to select {lassoTriangleMode ? 'triangles' : 'surfaces'} · Esc to exit
          </span>
          {/* Mode toggle */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 2 }}>
            <ModeBtn active={!lassoTriangleMode} label="Surfaces" color="#6366f1" onClick={() => setLassoTriangleMode(false)} />
            <ModeBtn active={lassoTriangleMode} label="Triangles" color="#eab308" onClick={() => setLassoTriangleMode(true)} />
          </div>
        </div>
      )}

      {/* Popup — shown once projection result arrives */}
      {hasSelection && popupPos && (
        <div ref={popupRef} style={{
          position: 'fixed', left: popX, top: popY, zIndex: 300,
          background: 'rgba(13,17,23,0.96)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, minWidth: W, backdropFilter: 'blur(12px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)', fontFamily: 'system-ui, sans-serif', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
              {lassoTriangleMode
                ? (triCount === 0 ? 'No triangles selected' : `${triCount} triangle${triCount !== 1 ? 's' : ''} in ${triSurfCount} surface${triSurfCount !== 1 ? 's' : ''}`)
                : (surfCount === 0 ? 'No surfaces selected' : `${surfCount} surface${surfCount !== 1 ? 's' : ''} selected`)}
            </span>
            <button onClick={clearSelection} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
          </div>

          {lassoTriangleMode ? (
            /* Triangle mode actions */
            triCount > 0 ? (
              <div style={{ padding: '4px' }}>
                <PopupBtn icon="🗑" label="Delete Triangles" onClick={doDeleteTriangles} danger />
                <PopupBtn icon="✂️" label="Separate as Fragment" onClick={doSeparateTriangles} />
              </div>
            ) : null
          ) : (
            /* Surface mode actions */
            surfCount > 0 ? (
              <div style={{ padding: '4px' }}>
                <PopupBtn icon="🙈" label="Hide" onClick={doHide} />
                <PopupBtn icon="📁" label="Group Selection" onClick={doGroupNew} />
                <PopupBtn icon="📂" label="Move to Group…" onClick={() => setShowGroupMenu(v => !v)} arrow={showGroupMenu ? '▾' : '▸'} />
                {showGroupMenu && (
                  <div style={{ paddingLeft: 28, paddingBottom: 4 }}>
                    {surfaceGroups.length === 0
                      ? <div style={{ color: '#475569', fontSize: 11, padding: '3px 0' }}>Use "Group Selection" above</div>
                      : surfaceGroups.map(g => (
                        <button key={g.id} onClick={() => doMoveToGroup(g.id)}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 8px', background: 'none', border: 'none', color: '#cbd5e1', fontSize: 11, cursor: 'pointer', borderRadius: 5 }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          {g.label}
                        </button>
                      ))}
                  </div>
                )}
                <PopupBtn icon="🗑" label="Delete" onClick={doDelete} danger />
              </div>
            ) : null
          )}
        </div>
      )}
    </>
  )
}

function ModeBtn({ active, label, color, onClick }: { active: boolean; label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 10px', borderRadius: 10, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
      background: active ? color : 'transparent',
      color: active ? '#fff' : '#64748b',
    }}>{label}</button>
  )
}

function PopupBtn({ icon, label, onClick, danger, arrow }: { icon: string; label: string; onClick: () => void; danger?: boolean; arrow?: string }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px',
        background: hov ? (danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)') : 'none',
        border: 'none', borderRadius: 6,
        color: danger ? (hov ? '#fca5a5' : '#ef4444') : '#e2e8f0',
        fontSize: 12, cursor: 'pointer',
      }}>
      <span style={{ fontSize: 14, width: 18 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {arrow && <span style={{ color: '#64748b', fontSize: 10 }}>{arrow}</span>}
    </button>
  )
}

