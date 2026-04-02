'use client'

import { useEffect, useRef, useState } from 'react'
import { useViewer } from '../../lib/viewerState.js'

export default function ModelContextCard() {
  const {
    modelClickPos, setModelClickPos, setPositioningMode,
    positioningMode, streamStatus, fileType, meshVisible,
  } = useViewer()
  const cardRef = useRef<HTMLDivElement>(null)
  const [showHint, setShowHint] = useState(false)

  const isMesh = fileType && fileType !== 'e57'
  const isDone = streamStatus === 'done'

  // Show hint bar once after model loads
  useEffect(() => {
    if (isDone && isMesh) setShowHint(true)
  }, [isDone, isMesh])

  // Close context card on outside click
  useEffect(() => {
    if (!modelClickPos) return
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setModelClickPos(null)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [modelClickPos, setModelClickPos])

  return (
    <>
      {/* Persistent positioning hint bar (shown after model load) */}
      {showHint && isDone && isMesh && meshVisible && !positioningMode && !modelClickPos && (
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
            onClick={() => setShowHint(false)}
            style={{
              background: 'none', border: 'none', color: '#64748b',
              fontSize: 14, cursor: 'pointer', padding: '0 2px',
            }}
          >✕</button>
        </div>
      )}

      {/* Context card on model click */}
      {modelClickPos && (() => {
        const W = 160, H = 80
        const x = Math.min(Math.max(modelClickPos.x, 8), window.innerWidth - W - 8)
        const y = Math.min(Math.max(modelClickPos.y, 8), window.innerHeight - H - 8)

        return (
          <div ref={cardRef} style={{
            position: 'fixed', left: x, top: y, zIndex: 1000,
            background: 'rgba(15,23,42,0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            padding: '6px 4px',
            minWidth: W,
            fontFamily: 'system-ui, sans-serif',
          }}>
            <button
              onClick={() => {
                setPositioningMode(true)
                setModelClickPos(null)
                setShowHint(false)
              }}
              style={{
                width: '100%', padding: '7px 14px', textAlign: 'left',
                background: 'none', border: 'none', color: '#e2e8f0',
                fontSize: 13, cursor: 'pointer', borderRadius: 7,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span>🎯</span>
              <span>Positioning</span>
            </button>
          </div>
        )
      })()}
    </>
  )
}
