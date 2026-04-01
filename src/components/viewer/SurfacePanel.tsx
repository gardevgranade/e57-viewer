'use client'

import { useState } from 'react'
import { useViewer } from '../../lib/viewerState.js'
import { detectSurfaces } from '../../lib/surfaceDetect.js'
import { detectMeshSurfaces } from '../../lib/meshSurfaceDetect.js'
import * as THREE from 'three'

function fmtArea(m2: number) {
  if (m2 < 0.01) return `${(m2 * 1e4).toFixed(1)} cm²`
  if (m2 < 10000) return `${m2.toFixed(2)} m²`
  return `${(m2 / 10000).toFixed(2)} ha`
}

export default function SurfacePanel() {
  const {
    streamStatus, fileType,
    surfaces, setSurfaces, updateSurface, setSurfaceColorMode, surfaceColorMode,
    pointCloudGeoRef, meshObjectRef,
  } = useViewer()
  const [detecting, setDetecting] = useState(false)
  const [numSurfaces, setNumSurfaces] = useState(6)
  const [open, setOpen] = useState(true)

  const isMesh = fileType && fileType !== 'e57'
  const isVisible = streamStatus === 'done'
  if (!isVisible) return null

  async function handleDetect() {
    setDetecting(true)
    await new Promise(r => setTimeout(r, 30))

    try {
      let detected
      if (isMesh) {
        const obj = meshObjectRef.current
        if (!obj) return
        detected = detectMeshSurfaces(obj, numSurfaces)
      } else {
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
        detected = detectSurfaces(worldPos, count, numSurfaces)
      }
      setSurfaces(detected)
    } finally {
      setDetecting(false)
    }
  }

  function handleReset() {
    setSurfaces([])
    setSurfaceColorMode(false)
  }

  return (
    <div style={{
      position: 'absolute',
      top: 12,
      left: 12,
      zIndex: 10,
      background: 'rgba(13,17,23,0.88)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      padding: '10px 12px',
      minWidth: 220,
      maxWidth: 260,
      backdropFilter: 'blur(8px)',
      fontFamily: 'system-ui, sans-serif',
      fontSize: 12,
      color: '#e2e8f0',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
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
          {/* Controls row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ color: '#94a3b8' }}>Count:</span>
            {[3, 5, 8, 10].map(n => (
              <button
                key={n}
                onClick={() => setNumSurfaces(n)}
                style={{
                  background: numSurfaces === n ? '#334155' : 'transparent',
                  border: '1px solid #334155',
                  color: numSurfaces === n ? '#e2e8f0' : '#64748b',
                  borderRadius: 4,
                  padding: '1px 6px',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Detect button */}
          <button
            onClick={handleDetect}
            disabled={detecting}
            style={{
              width: '100%',
              padding: '6px 0',
              background: detecting ? '#1e293b' : '#1d4ed8',
              border: 'none',
              borderRadius: 6,
              color: detecting ? '#64748b' : '#fff',
              fontWeight: 600,
              cursor: detecting ? 'not-allowed' : 'pointer',
              fontSize: 12,
              marginBottom: surfaces.length > 0 ? 10 : 0,
            }}
          >
            {detecting ? '⏳ Analyzing…' : '🔍 Detect Surfaces'}
          </button>

          {/* Surface list */}
          {surfaces.length > 0 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {surfaces.map(surf => (
                  <div key={surf.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '4px 6px',
                    opacity: surf.visible ? 1 : 0.4,
                  }}>
                    {/* Color swatch / picker */}
                    <label style={{ cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: 4,
                        background: surf.color, border: '2px solid rgba(255,255,255,0.2)',
                      }} />
                      <input
                        type="color"
                        value={surf.color}
                        onChange={e => updateSurface(surf.id, { color: e.target.value })}
                        style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                      />
                    </label>

                    {/* Label */}
                    <input
                      value={surf.label}
                      onChange={e => updateSurface(surf.id, { label: e.target.value })}
                      style={{
                        flex: 1, background: 'transparent', border: 'none',
                        color: '#e2e8f0', fontSize: 12, fontWeight: 500,
                        outline: 'none', minWidth: 0,
                      }}
                    />

                    {/* Area (mesh) or point count (point cloud) */}
                    <span style={{ color: '#64748b', fontSize: 10, flexShrink: 0 }}>
                      {surf.area != null
                        ? fmtArea(surf.area)
                        : surf.pointCount > 1000
                          ? `${(surf.pointCount / 1000).toFixed(1)}k pts`
                          : `${surf.pointCount} pts`}
                    </span>

                    {/* Visibility toggle */}
                    <button
                      onClick={() => updateSurface(surf.id, { visible: !surf.visible })}
                      style={{
                        background: 'none', border: 'none',
                        color: surf.visible ? '#e2e8f0' : '#334155',
                        cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1,
                      }}
                      title={surf.visible ? 'Hide' : 'Show'}
                    >
                      {surf.visible ? '👁' : '🙈'}
                    </button>
                  </div>
                ))}
              </div>

              {/* Toggle surface colors / reset */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button
                  onClick={() => setSurfaceColorMode(!surfaceColorMode)}
                  style={{
                    flex: 1, padding: '4px 0', fontSize: 11, fontWeight: 600,
                    background: surfaceColorMode ? '#166534' : '#1e293b',
                    border: '1px solid ' + (surfaceColorMode ? '#16a34a' : '#334155'),
                    borderRadius: 5, color: surfaceColorMode ? '#4ade80' : '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  {surfaceColorMode ? '● Colors ON' : '○ Colors OFF'}
                </button>
                <button
                  onClick={handleReset}
                  style={{
                    padding: '4px 10px', fontSize: 11, fontWeight: 600,
                    background: '#1e293b', border: '1px solid #334155',
                    borderRadius: 5, color: '#94a3b8', cursor: 'pointer',
                  }}
                >
                  Reset
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
