'use client'

import { useState, useRef, useEffect } from 'react'
import { useViewer } from '../../lib/viewerState.js'

export default function LassoOverlay() {
  const {
    lassoMode, setLassoMode,
    lassoPath, setLassoPath,
    setLassoDrawingComplete,
    lassoSelectedIds, setLassoSelectedIds,
    updateSurface, removeSurface,
    surfaceGroups, addGroup,
  } = useViewer()

  const [isDrawing, setIsDrawing] = useState(false)
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null)
  const [showGroupMenu, setShowGroupMenu] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!lassoSelectedIds) return
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        clearSelection()
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [lassoSelectedIds])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lassoMode) {
        clearSelection()
        setLassoMode(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lassoMode])

  function clearSelection() {
    setLassoSelectedIds(null)
    setLassoPath([])
    setShowGroupMenu(false)
    setPopupPos(null)
  }

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!lassoMode) return
    e.preventDefault()
    e.stopPropagation()
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

  if (!lassoMode) return null

  const pathD = lassoPath.length > 1
    ? `M ${lassoPath.map(p => `${p.x},${p.y}`).join(' L ')} Z`
    : ''

  const count = lassoSelectedIds?.length ?? 0

  function doHide() {
    lassoSelectedIds?.forEach(id => updateSurface(id, { visible: false }))
    clearSelection()
  }

  function doGroupNew() {
    const id = `group-${Date.now()}`
    const label = `Lasso Group ${surfaceGroups.length + 1}`
    addGroup({ id, label, parentId: null })
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

  const W = 210
  const popX = popupPos ? Math.min(Math.max(popupPos.x, 8), window.innerWidth - W - 8) : 0
  const popY = popupPos ? Math.min(Math.max(popupPos.y - 20, 8), window.innerHeight - 260) : 0

  return (
    <>
      <svg
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          cursor: 'crosshair',
          pointerEvents: 'auto',
          width: '100vw', height: '100vh',
          userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {pathD && (
          <path
            d={pathD}
            fill="rgba(99,102,241,0.10)"
            stroke="#6366f1"
            strokeWidth={2}
            strokeDasharray="6 3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      {!lassoSelectedIds && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 300, background: 'rgba(15,23,42,0.88)',
          border: '1px solid rgba(99,102,241,0.4)',
          borderRadius: 20, padding: '6px 16px',
          color: '#a5b4fc', fontSize: 12, fontWeight: 600,
          pointerEvents: 'none', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>✏️</span> Draw to select surfaces · Esc to exit
        </div>
      )}

      {lassoSelectedIds !== null && popupPos && (
        <div ref={popupRef} style={{
          position: 'fixed', left: popX, top: popY, zIndex: 300,
          background: 'rgba(13,17,23,0.96)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, minWidth: W,
          backdropFilter: 'blur(12px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          fontFamily: 'system-ui, sans-serif',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
              {count === 0 ? 'No surfaces selected' : `${count} surface${count !== 1 ? 's' : ''} selected`}
            </span>
            <button onClick={clearSelection}
              style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
          </div>

          {count > 0 && (
            <div style={{ padding: '4px' }}>
              <PopupBtn icon="🙈" label="Hide" onClick={doHide} />
              <PopupBtn icon="📁" label="Group Selection" onClick={doGroupNew} />

              <PopupBtn
                icon="📂"
                label="Move to Group…"
                onClick={() => setShowGroupMenu(v => !v)}
                arrow={showGroupMenu ? '▾' : '▸'}
              />
              {showGroupMenu && surfaceGroups.length > 0 && (
                <div style={{ paddingLeft: 28, paddingBottom: 4 }}>
                  {surfaceGroups.map(g => (
                    <button key={g.id} onClick={() => doMoveToGroup(g.id)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '4px 8px', background: 'none', border: 'none',
                        color: '#cbd5e1', fontSize: 11, cursor: 'pointer', borderRadius: 5,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              )}
              {showGroupMenu && surfaceGroups.length === 0 && (
                <div style={{ paddingLeft: 28, paddingBottom: 4, color: '#475569', fontSize: 11 }}>
                  No groups yet — use "Group Selection" above
                </div>
              )}

              <PopupBtn icon="🗑" label="Delete" onClick={doDelete} danger />
            </div>
          )}
        </div>
      )}
    </>
  )
}

function PopupBtn({
  icon, label, onClick, danger, arrow,
}: {
  icon: string; label: string; onClick: () => void; danger?: boolean; arrow?: string
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px',
        background: hov ? (danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)') : 'none',
        border: 'none', borderRadius: 6,
        color: danger ? (hov ? '#fca5a5' : '#ef4444') : '#e2e8f0',
        fontSize: 12, cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 14, width: 18 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {arrow && <span style={{ color: '#64748b', fontSize: 10 }}>{arrow}</span>}
    </button>
  )
}
