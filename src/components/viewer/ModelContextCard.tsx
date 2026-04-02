'use client'

import { useEffect, useRef } from 'react'
import { useViewer } from '../../lib/viewerState.js'

export default function ModelContextCard() {
  const { modelClickPos, setModelClickPos, setPositioningMode } = useViewer()
  const cardRef = useRef<HTMLDivElement>(null)

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

  if (!modelClickPos) return null

  // Clamp to viewport
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
}
