'use client'

import { useEffect, useRef, useState } from 'react'
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

function fmtArea(m2: number) {
  if (m2 < 0.0001) return `${(m2 * 1e6).toFixed(0)} mm²`
  if (m2 < 1)      return `${(m2 * 1e4).toFixed(2)} cm²`
  return `${m2.toFixed(4)} m²`
}

/** 3-D polygon area via cross-product accumulation (works for any planar polygon) */
function polygonArea3D(pts: MeasurePoint[]): number {
  if (pts.length < 3) return 0
  let nx = 0, ny = 0, nz = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    nx += a.y * b.z - a.z * b.y
    ny += a.z * b.x - a.x * b.z
    nz += a.x * b.y - a.y * b.x
  }
  return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2
}

/** Centroid of a polygon */
function centroid(pts: MeasurePoint[]): [number, number, number] {
  const n = pts.length
  return [
    pts.reduce((s, p) => s + p.x, 0) / n,
    pts.reduce((s, p) => s + p.y, 0) / n,
    pts.reduce((s, p) => s + p.z, 0) / n,
  ]
}

function makeRaycaster(bbox: ReturnType<typeof useViewer>['bbox']) {
  const span = bbox
    ? Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, bbox.maxZ - bbox.minZ)
    : 10
  const rc = new THREE.Raycaster()
  rc.params.Points = { threshold: Math.max(span * 0.003, 0.01) }
  return rc
}

export default function MeasureTool({ flyCameraRef }: MeasureToolProps) {
  const { measureActive, bbox } = useViewer()
  const { camera, gl, scene } = useThree()
  const [points, setPoints] = useState<MeasurePoint[]>([])
  const [isClosed, setIsClosed] = useState(false)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const draggingIdxRef = useRef<number | null>(null)
  const justDraggedRef = useRef(false)
  // Set by sphere onPointerDown so the click handler knows which sphere was hit
  const sphereClickRef = useRef<number | null>(null)

  // Keep ref in sync with state
  useEffect(() => { draggingIdxRef.current = draggingIdx }, [draggingIdx])

  // Tell FlyCamera not to orbit on left-click while measure is active
  useEffect(() => {
    flyCameraRef.current?.setMeasureMode(measureActive)
  }, [measureActive, flyCameraRef])

  // Escape = clear everything (works regardless of measure mode)
  useEffect(() => {
    if (points.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPoints([]); setIsClosed(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [points.length])

  // Drag: pointermove + pointerup on the canvas
  useEffect(() => {
    if (draggingIdx === null) return

    const rc = makeRaycaster(bbox)

    const onMove = (e: PointerEvent) => {
      const idx = draggingIdxRef.current
      if (idx === null) return
      // Once we start moving, this is definitely a drag (not a click)
      sphereClickRef.current = null
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
      const hits = rc
        .intersectObjects(scene.children, true)
        .filter((h) => h.object instanceof THREE.Points || h.object instanceof THREE.Mesh)
      if (hits.length > 0) {
        const p = hits[0].point
        setPoints((prev) => prev.map((pt, i) => i === idx ? { x: p.x, y: p.y, z: p.z } : pt))
      }
    }

    const onUp = () => {
      justDraggedRef.current = true
      setDraggingIdx(null)
      setHoveredIdx(null)
      flyCameraRef.current?.setMeasureMode(measureActive)
    }

    gl.domElement.addEventListener('pointermove', onMove)
    gl.domElement.addEventListener('pointerup', onUp)
    return () => {
      gl.domElement.removeEventListener('pointermove', onMove)
      gl.domElement.removeEventListener('pointerup', onUp)
    }
  }, [draggingIdx, bbox, camera, gl, scene, measureActive, flyCameraRef])

  // Click → add point or close polygon (only in measure mode)
  useEffect(() => {
    if (!measureActive) return

    const rc = makeRaycaster(bbox)

    const onClick = (e: MouseEvent) => {
      // Skip if drag just ended
      if (justDraggedRef.current) { justDraggedRef.current = false; return }
      // Skip if polygon is already closed
      if (isClosed) return

      // Check if user clicked an existing sphere
      const hitSphereIdx = sphereClickRef.current
      sphereClickRef.current = null

      if (hitSphereIdx !== null) {
        // Clicked the first point with ≥2 segments → close the polygon
        if (hitSphereIdx === 0 && points.length >= 3) {
          setIsClosed(true)
        }
        // Any other existing point: use its exact position as the new endpoint
        // (allows connecting chains through existing points without duplicating)
        else if (hitSphereIdx !== points.length - 1) {
          const existing = points[hitSphereIdx]
          setPoints((prev) => [...prev, { ...existing }])
        }
        // Clicking the last point: no-op
        return
      }

      // Normal click: raycast model surface
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
      const hits = rc
        .intersectObjects(scene.children, true)
        .filter((h) => h.object instanceof THREE.Points || h.object instanceof THREE.Mesh)
      if (hits.length > 0) {
        const p = hits[0].point
        setPoints((prev) => [...prev, { x: p.x, y: p.y, z: p.z }])
      }
    }

    gl.domElement.addEventListener('click', onClick)
    return () => gl.domElement.removeEventListener('click', onClick)
  }, [measureActive, camera, gl, scene, bbox, isClosed, points])

  if (points.length === 0) return null

  const span = bbox
    ? Math.max(bbox.maxX - bbox.minX, bbox.maxZ - bbox.minZ)
    : 5
  const dotRadius = Math.max(span * 0.004, 0.01)

  const linePoints = points.map((p) => [p.x, p.y, p.z] as [number, number, number])
  // Close the line visually
  const closedLinePoints = isClosed ? [...linePoints, linePoints[0]] : linePoints

  const totalDist =
    points.length >= 2
      ? points.slice(0, -1).reduce((s, p, i) => s + dist3(p, points[i + 1]), 0)
      : 0
  const closingDist = isClosed ? dist3(points[points.length - 1], points[0]) : 0
  const perimeter = totalDist + closingDist
  const area = isClosed ? polygonArea3D(points) : 0

  return (
    <>
      {/* Dots at each picked point */}
      {points.map((p, i) => {
        const isFirst = i === 0
        // Highlight the first point as a "close" target when polygon can be closed
        const canClose = isFirst && !isClosed && points.length >= 3 && measureActive
        return (
          <mesh
            key={i}
            position={[p.x, p.y, p.z]}
            renderOrder={999}
            onPointerEnter={(e) => { e.stopPropagation(); setHoveredIdx(i) }}
            onPointerLeave={() => { if (draggingIdx === null) setHoveredIdx(null) }}
            onPointerDown={(e) => {
              e.stopPropagation()
              sphereClickRef.current = i
              // Block orbit for the duration of the drag
              flyCameraRef.current?.setMeasureMode(true)
              setDraggingIdx(i)
              setHoveredIdx(i)
              gl.domElement.setPointerCapture(e.pointerId)
            }}
          >
            <sphereGeometry args={[canClose ? dotRadius * 1.5 : dotRadius, 10, 10]} />
            <meshBasicMaterial
              color={
                draggingIdx === i ? '#fbbf24'
                : canClose && hoveredIdx === i ? '#4ade80'
                : canClose ? '#22c55e'
                : hoveredIdx === i ? '#fb923c'
                : '#f97316'
              }
              depthTest={false}
            />
          </mesh>
        )
      })}

      {/* Polyline (+ closing edge when closed) */}
      {closedLinePoints.length >= 2 && (
        <Line
          points={closedLinePoints}
          color="#f97316"
          lineWidth={2}
          depthTest={false}
        />
      )}

      {/* Per-segment distance labels — only when hovering either endpoint */}
      {points.slice(0, -1).map((p, i) => {
        if (hoveredIdx !== i && hoveredIdx !== i + 1) return null
        const q = points[i + 1]
        const d = dist3(p, q)
        const dh = Math.sqrt((q.x - p.x) ** 2 + (q.z - p.z) ** 2)
        const dv = Math.abs(q.y - p.y)
        const [mx, my, mz] = mid3(p, q)
        return (
          <Html key={i} position={[mx, my + dotRadius * 2, mz]} center occlude={false}>
            <div style={{
              background: 'rgba(0,0,0,0.82)', color: '#f97316',
              padding: '4px 9px', borderRadius: 6, fontSize: 12,
              fontFamily: 'monospace', whiteSpace: 'nowrap',
              pointerEvents: 'none', border: '1px solid rgba(249,115,22,0.5)', lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 700 }}>{fmt(d)}</div>
              {(dh > 0.001 || dv > 0.001) && (
                <div style={{ fontSize: 10, color: '#fcd34d' }}>↔ {fmt(dh)}  ↕ {fmt(dv)}</div>
              )}
            </div>
          </Html>
        )
      })}

      {/* Closing-edge label when hovering last or first point of closed polygon */}
      {isClosed && (hoveredIdx === 0 || hoveredIdx === points.length - 1) && (() => {
        const a = points[points.length - 1]
        const b = points[0]
        const d = dist3(a, b)
        const [mx, my, mz] = mid3(a, b)
        return (
          <Html position={[mx, my + dotRadius * 2, mz]} center occlude={false}>
            <div style={{
              background: 'rgba(0,0,0,0.82)', color: '#4ade80',
              padding: '4px 9px', borderRadius: 6, fontSize: 12,
              fontFamily: 'monospace', whiteSpace: 'nowrap',
              pointerEvents: 'none', border: '1px solid rgba(74,222,128,0.5)',
            }}>
              {fmt(d)}
            </div>
          </Html>
        )
      })()}

      {/* Summary label at last point when hovering it */}
      {points.length >= 2 && hoveredIdx === points.length - 1 && (() => {
        const last = points[points.length - 1]
        return (
          <Html position={[last.x, last.y + dotRadius * 4, last.z]} center occlude={false}>
            <div style={{
              background: 'rgba(0,0,0,0.9)', color: '#fff',
              padding: '5px 10px', borderRadius: 5, fontSize: 11,
              fontFamily: 'monospace', whiteSpace: 'nowrap',
              pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.2)',
              lineHeight: 1.6,
            }}>
              {points.length >= 3 && <div>∑ {fmt(perimeter)}</div>}
              {isClosed && area > 0 && (
                <div style={{ color: '#4ade80', fontWeight: 700 }}>⬡ {fmtArea(area)}</div>
              )}
            </div>
          </Html>
        )
      })()}

      {/* Area label at polygon centroid when closed */}
      {isClosed && area > 0 && (() => {
        const [cx, cy, cz] = centroid(points)
        return (
          <Html position={[cx, cy + dotRadius * 2, cz]} center occlude={false}>
            <div style={{
              background: 'rgba(0,0,0,0.75)', color: '#4ade80',
              padding: '3px 8px', borderRadius: 5, fontSize: 11,
              fontFamily: 'monospace', whiteSpace: 'nowrap',
              pointerEvents: 'none', border: '1px solid rgba(74,222,128,0.4)',
            }}>
              ⬡ {fmtArea(area)}
            </div>
          </Html>
        )
      })()}
    </>
  )
}
