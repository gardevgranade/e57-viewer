'use client'

import { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { useViewer } from '../../lib/viewerState.js'
import type { FlyCameraHandle } from './FlyCamera.js'

interface MeasurePoint { x: number; y: number; z: number }

interface MeasureToolProps {
  flyCameraRef: React.RefObject<FlyCameraHandle | null>
}

function dist3(a: MeasurePoint, b: MeasurePoint) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2)
}

function mid3(a: MeasurePoint, b: MeasurePoint): [number, number, number] {
  return [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2]
}

function fmt(m: number) {
  if (m < 0.001) return `${(m * 1000).toFixed(0)} mm`
  if (m < 1)     return `${(m * 100).toFixed(1)} cm`
  return `${m.toFixed(3)} m`
}

export default function MeasureTool({ flyCameraRef }: MeasureToolProps) {
  const { measureActive, bbox } = useViewer()
  const { camera, gl, scene } = useThree()
  const [points, setPoints] = useState<MeasurePoint[]>([])

  // Tell FlyCamera not to orbit on left-click while measure is active
  useEffect(() => {
    flyCameraRef.current?.setMeasureMode(measureActive)
  }, [measureActive, flyCameraRef])

  // Escape = clear points
  useEffect(() => {
    if (!measureActive) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPoints([]) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [measureActive])

  // Clear points when leaving measure mode
  useEffect(() => {
    if (!measureActive) setPoints([])
  }, [measureActive])

  // Click → raycast → add point
  useEffect(() => {
    if (!measureActive) return

    const span = bbox
      ? Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, bbox.maxZ - bbox.minZ)
      : 10
    const raycaster = new THREE.Raycaster()
    raycaster.params.Points = { threshold: Math.max(span * 0.003, 0.01) }

    const onClick = (e: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)

      // Intersect everything; prefer Points then Mesh; skip non-geometry
      const hits = raycaster
        .intersectObjects(scene.children, true)
        .filter((h) => h.object instanceof THREE.Points || h.object instanceof THREE.Mesh)

      if (hits.length > 0) {
        const p = hits[0].point
        setPoints((prev) => [...prev, { x: p.x, y: p.y, z: p.z }])
      }
    }

    gl.domElement.addEventListener('click', onClick)
    return () => gl.domElement.removeEventListener('click', onClick)
  }, [measureActive, camera, gl, scene, bbox])

  if (!measureActive || points.length === 0) return null

  const span = bbox
    ? Math.max(bbox.maxX - bbox.minX, bbox.maxZ - bbox.minZ)
    : 5
  const dotRadius = Math.max(span * 0.004, 0.01)

  const linePoints = points.map((p) => [p.x, p.y, p.z] as [number, number, number])

  const totalDist =
    points.length >= 2
      ? points.slice(0, -1).reduce((s, p, i) => s + dist3(p, points[i + 1]), 0)
      : 0

  return (
    <>
      {/* Dots at each picked point */}
      {points.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]} renderOrder={999}>
          <sphereGeometry args={[dotRadius, 10, 10]} />
          <meshBasicMaterial color="#f97316" depthTest={false} />
        </mesh>
      ))}

      {/* Polyline */}
      {points.length >= 2 && (
        <Line
          points={linePoints}
          color="#f97316"
          lineWidth={2}
          depthTest={false}
        />
      )}

      {/* Per-segment distance labels */}
      {points.slice(0, -1).map((p, i) => {
        const q = points[i + 1]
        const d = dist3(p, q)
        const dh = Math.sqrt((q.x - p.x) ** 2 + (q.z - p.z) ** 2)
        const dv = Math.abs(q.y - p.y)
        const [mx, my, mz] = mid3(p, q)
        return (
          <Html key={i} position={[mx, my + dotRadius * 2, mz]} center occlude={false}>
            <div style={{
              background: 'rgba(0,0,0,0.82)',
              color: '#f97316',
              padding: '4px 9px',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: '1px solid rgba(249,115,22,0.5)',
              lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 700 }}>{fmt(d)}</div>
              {(dh > 0.001 || dv > 0.001) && (
                <div style={{ fontSize: 10, color: '#fcd34d' }}>
                  ↔ {fmt(dh)}  ↕ {fmt(dv)}
                </div>
              )}
            </div>
          </Html>
        )
      })}

      {/* Total label after 2+ segments */}
      {points.length >= 3 && (() => {
        const last = points[points.length - 1]
        return (
          <Html
            position={[last.x, last.y + dotRadius * 4, last.z]}
            center
            occlude={false}
          >
            <div style={{
              background: 'rgba(0,0,0,0.9)',
              color: '#fff',
              padding: '3px 8px',
              borderRadius: 5,
              fontSize: 11,
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: '1px solid rgba(255,255,255,0.2)',
            }}>
              ∑ {fmt(totalDist)}
            </div>
          </Html>
        )
      })()}
    </>
  )
}
