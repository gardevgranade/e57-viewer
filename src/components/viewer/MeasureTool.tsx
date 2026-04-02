'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { useViewer } from '../../lib/viewerState.js'
import type { PickedSurface } from '../../lib/viewerState.js'
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

function polygonArea3D(pts: MeasurePoint[]): number {
  if (pts.length < 3) return 0
  let nx = 0, ny = 0, nz = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    nx += a.y * b.z - a.z * b.y
    ny += a.z * b.x - a.x * b.z
    nz += a.x * b.y - a.y * b.x
  }
  return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2
}

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

// ── Snap candidates ──────────────────────────────────────────────────────────

type SnapType = 'vertex' | 'edge'

interface EdgeCand { type: 'edge'; v1: THREE.Vector3; v2: THREE.Vector3 }
interface VertexCand { type: 'vertex'; pos: THREE.Vector3 }
type SnapCand = EdgeCand | VertexCand

const VERTEX_SNAP_PX = 18
const EDGE_SNAP_PX = 22

function extractSnapCandidates(surfaces: PickedSurface[]): SnapCand[] {
  const result: SnapCand[] = []

  for (const surf of surfaces) {
    if (!surf.visible || !surf.worldTriangles) continue
    const wt = surf.worldTriangles
    const triCount = Math.floor(wt.length / 9)
    if (triCount === 0) continue

    // Build edge map: edgeKey → {v1, v2, count}
    const edgeMap = new Map<string, { v1: THREE.Vector3; v2: THREE.Vector3; count: number }>()

    for (let i = 0; i < triCount; i++) {
      const base = i * 9
      const verts = [
        new THREE.Vector3(wt[base],     wt[base + 1], wt[base + 2]),
        new THREE.Vector3(wt[base + 3], wt[base + 4], wt[base + 5]),
        new THREE.Vector3(wt[base + 6], wt[base + 7], wt[base + 8]),
      ]
      for (let j = 0; j < 3; j++) {
        const a = verts[j], b = verts[(j + 1) % 3]
        const ka = `${a.x.toFixed(4)},${a.y.toFixed(4)},${a.z.toFixed(4)}`
        const kb = `${b.x.toFixed(4)},${b.y.toFixed(4)},${b.z.toFixed(4)}`
        const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
        if (edgeMap.has(ek)) edgeMap.get(ek)!.count++
        else edgeMap.set(ek, { v1: a.clone(), v2: b.clone(), count: 1 })
      }
    }

    // Boundary edges (count === 1) + their vertices
    const bverts = new Map<string, THREE.Vector3>()
    for (const { v1, v2, count } of edgeMap.values()) {
      if (count !== 1) continue
      result.push({ type: 'edge', v1, v2 })
      const k1 = `${v1.x.toFixed(4)},${v1.y.toFixed(4)},${v1.z.toFixed(4)}`
      const k2 = `${v2.x.toFixed(4)},${v2.y.toFixed(4)},${v2.z.toFixed(4)}`
      bverts.set(k1, v1)
      bverts.set(k2, v2)
    }
    for (const v of bverts.values()) result.push({ type: 'vertex', pos: v })
  }

  return result
}

function findSnap(
  mx: number, my: number,
  camera: THREE.Camera,
  rect: DOMRect,
  candidates: SnapCand[],
): { pos: THREE.Vector3; type: SnapType } | null {
  let bestV: { pos: THREE.Vector3; dSq: number } | null = null
  let bestE: { pos: THREE.Vector3; dSq: number } | null = null

  for (const cand of candidates) {
    if (cand.type === 'vertex') {
      const ndc = cand.pos.clone().project(camera)
      if (ndc.z > 1) continue
      const sx = (ndc.x + 1) / 2 * rect.width + rect.left
      const sy = (1 - ndc.y) / 2 * rect.height + rect.top
      const dSq = (mx - sx) ** 2 + (my - sy) ** 2
      if (dSq < VERTEX_SNAP_PX ** 2 && (!bestV || dSq < bestV.dSq))
        bestV = { pos: cand.pos.clone(), dSq }
    } else {
      const ps = cand.v1.clone().project(camera)
      const pe = cand.v2.clone().project(camera)
      if (ps.z > 1 && pe.z > 1) continue
      const sx1 = (ps.x + 1) / 2 * rect.width + rect.left, sy1 = (1 - ps.y) / 2 * rect.height + rect.top
      const sx2 = (pe.x + 1) / 2 * rect.width + rect.left, sy2 = (1 - pe.y) / 2 * rect.height + rect.top
      const dx = sx2 - sx1, dy = sy2 - sy1
      const len2 = dx * dx + dy * dy
      const t = len2 > 0.01 ? Math.max(0, Math.min(1, ((mx - sx1) * dx + (my - sy1) * dy) / len2)) : 0
      const cpx = sx1 + t * dx, cpy = sy1 + t * dy
      const dSq = (mx - cpx) ** 2 + (my - cpy) ** 2
      if (dSq < EDGE_SNAP_PX ** 2 && (!bestE || dSq < bestE.dSq))
        bestE = { pos: cand.v1.clone().lerp(cand.v2, t), dSq }
    }
  }

  if (bestV) return { pos: bestV.pos, type: 'vertex' }
  if (bestE) return { pos: bestE.pos, type: 'edge' }
  return null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MeasureTool({ flyCameraRef }: MeasureToolProps) {
  const { measureActive, measureSnap, bbox, measureTraceSerial, measureTracePts, setMeasureActive, surfaces } = useViewer()
  const { camera, gl, scene } = useThree()
  const [points, setPoints] = useState<MeasurePoint[]>([])
  const [isClosed, setIsClosed] = useState(false)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [ghost, setGhost] = useState<{ pos: THREE.Vector3; type: SnapType | 'free' } | null>(null)

  const draggingIdxRef = useRef<number | null>(null)
  const justDraggedRef = useRef(false)
  const sphereClickRef = useRef<number | null>(null)
  const prevTraceSerialRef = useRef(0)
  const ghostRef = useRef<{ pos: THREE.Vector3; type: SnapType | 'free' } | null>(null)

  // Pre-compute snap candidates whenever surface geometry changes
  const snapKey = surfaces.map(s => `${s.id}:${s.visible ? 1 : 0}:${s.worldTriangles?.length ?? 0}`).join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snapCandidates = useMemo(() => extractSnapCandidates(surfaces), [snapKey])

  useEffect(() => { draggingIdxRef.current = draggingIdx }, [draggingIdx])

  useEffect(() => {
    if (measureTraceSerial === 0 || measureTraceSerial === prevTraceSerialRef.current) return
    prevTraceSerialRef.current = measureTraceSerial
    if (measureTracePts.length >= 3) {
      setPoints(measureTracePts)
      setIsClosed(true)
      setMeasureActive(true)
    }
  }, [measureTraceSerial, measureTracePts, setMeasureActive])

  useEffect(() => {
    flyCameraRef.current?.setMeasureMode(measureActive)
  }, [measureActive, flyCameraRef])

  useEffect(() => {
    if (points.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPoints([]); setIsClosed(false); setGhost(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [points.length])

  // ── Mousemove: ghost / snap tracking ──
  useEffect(() => {
    if (!measureActive) return

    const rc = makeRaycaster(bbox)

    const onMove = (e: MouseEvent) => {
      if (draggingIdxRef.current !== null) return // handled by drag effect
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)

      let resolved: { pos: THREE.Vector3; type: SnapType | 'free' } | null = null

      if (measureSnap && snapCandidates.length > 0) {
        const snap = findSnap(e.clientX, e.clientY, camera, rect, snapCandidates)
        if (snap) { resolved = snap; ghostRef.current = resolved; setGhost(resolved); return }
      }

      // Fall back to surface/mesh raycast
      const hits = rc.intersectObjects(scene.children, true)
        .filter(h => h.object instanceof THREE.Points || h.object instanceof THREE.Mesh)
      if (hits.length > 0) {
        const p = hits[0].point
        resolved = { pos: p, type: 'free' }
      } else {
        resolved = null
      }
      ghostRef.current = resolved
      setGhost(resolved)
    }

    gl.domElement.addEventListener('mousemove', onMove)
    return () => gl.domElement.removeEventListener('mousemove', onMove)
  }, [measureActive, measureSnap, snapCandidates, camera, gl, scene, bbox])

  // ── Drag ──
  useEffect(() => {
    if (draggingIdx === null) return

    const rc = makeRaycaster(bbox)

    const onMove = (e: PointerEvent) => {
      const idx = draggingIdxRef.current
      if (idx === null) return
      sphereClickRef.current = null
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1

      // Try snap first
      if (measureSnap && snapCandidates.length > 0) {
        const snap = findSnap(e.clientX, e.clientY, camera, rect, snapCandidates)
        if (snap) {
          const p = snap.pos
          setPoints(prev => prev.map((pt, i) => i === idx ? { x: p.x, y: p.y, z: p.z } : pt))
          return
        }
      }

      rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
      const hits = rc.intersectObjects(scene.children, true)
        .filter(h => h.object instanceof THREE.Points || h.object instanceof THREE.Mesh)
      if (hits.length > 0) {
        const p = hits[0].point
        setPoints(prev => prev.map((pt, i) => i === idx ? { x: p.x, y: p.y, z: p.z } : pt))
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
  }, [draggingIdx, bbox, camera, gl, scene, measureActive, measureSnap, snapCandidates, flyCameraRef])

  // ── Click: add point using ghost/snap ──
  useEffect(() => {
    if (!measureActive) return

    const rc = makeRaycaster(bbox)

    const onClick = (e: MouseEvent) => {
      if (justDraggedRef.current) { justDraggedRef.current = false; return }
      if (isClosed) return

      const hitSphereIdx = sphereClickRef.current
      sphereClickRef.current = null

      if (hitSphereIdx !== null) {
        if (hitSphereIdx === 0 && points.length >= 3) setIsClosed(true)
        else if (hitSphereIdx !== points.length - 1) {
          const existing = points[hitSphereIdx]
          setPoints(prev => [...prev, { ...existing }])
        }
        return
      }

      // Use ghost point if snap resolved it
      const g = ghostRef.current
      if (g) {
        setPoints(prev => [...prev, { x: g.pos.x, y: g.pos.y, z: g.pos.z }])
        return
      }

      // Fallback raw raycast
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
      const hits = rc.intersectObjects(scene.children, true)
        .filter(h => h.object instanceof THREE.Points || h.object instanceof THREE.Mesh)
      if (hits.length > 0) {
        const p = hits[0].point
        setPoints(prev => [...prev, { x: p.x, y: p.y, z: p.z }])
      }
    }

    gl.domElement.addEventListener('click', onClick)
    return () => gl.domElement.removeEventListener('click', onClick)
  }, [measureActive, camera, gl, scene, bbox, isClosed, points])

  if (points.length === 0 && !ghost) return null

  const span = bbox ? Math.max(bbox.maxX - bbox.minX, bbox.maxZ - bbox.minZ) : 5
  const dotRadius = Math.max(span * 0.004, 0.01)

  const linePoints = points.map(p => [p.x, p.y, p.z] as [number, number, number])
  const closedLinePoints = isClosed ? [...linePoints, linePoints[0]] : linePoints

  const totalDist = points.length >= 2
    ? points.slice(0, -1).reduce((s, p, i) => s + dist3(p, points[i + 1]), 0)
    : 0
  const closingDist = isClosed ? dist3(points[points.length - 1], points[0]) : 0
  const perimeter = totalDist + closingDist
  const area = isClosed ? polygonArea3D(points) : 0

  // Ghost snap indicator color
  const ghostColor = ghost?.type === 'vertex' ? '#fbbf24' : ghost?.type === 'edge' ? '#06b6d4' : '#ffffff'

  return (
    <>
      {/* Snap ghost indicator */}
      {ghost && !isClosed && measureActive && (
        <>
          <mesh position={ghost.pos.toArray()} renderOrder={1000}>
            <sphereGeometry args={[dotRadius * 1.2, 12, 12]} />
            <meshBasicMaterial color={ghostColor} transparent opacity={0.85} depthTest={false} />
          </mesh>
          {/* Outer ring for vertex snaps */}
          {ghost.type === 'vertex' && (
            <mesh position={ghost.pos.toArray()} renderOrder={999}>
              <torusGeometry args={[dotRadius * 2, dotRadius * 0.3, 6, 24]} />
              <meshBasicMaterial color={ghostColor} transparent opacity={0.5} depthTest={false} />
            </mesh>
          )}
          {/* Crosshair tick for edge snaps */}
          {ghost.type === 'edge' && (
            <mesh position={ghost.pos.toArray()} renderOrder={999}>
              <torusGeometry args={[dotRadius * 1.6, dotRadius * 0.25, 6, 24]} />
              <meshBasicMaterial color={ghostColor} transparent opacity={0.5} depthTest={false} />
            </mesh>
          )}
        </>
      )}

      {/* Measurement dots */}
      {points.map((p, i) => {
        const isFirst = i === 0
        const canClose = isFirst && !isClosed && points.length >= 3 && measureActive
        return (
          <mesh
            key={i}
            position={[p.x, p.y, p.z]}
            renderOrder={999}
            onPointerEnter={e => { e.stopPropagation(); setHoveredIdx(i) }}
            onPointerLeave={() => { if (draggingIdx === null) setHoveredIdx(null) }}
            onPointerDown={e => {
              e.stopPropagation()
              sphereClickRef.current = i
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

      {points.length >= 2 && closedLinePoints.length >= 2 && (
        <Line points={closedLinePoints} color="#f97316" lineWidth={2} depthTest={false} />
      )}

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

      {isClosed && (hoveredIdx === 0 || hoveredIdx === points.length - 1) && (() => {
        const a = points[points.length - 1], b = points[0]
        const d = dist3(a, b)
        const [mx, my, mz] = mid3(a, b)
        return (
          <Html position={[mx, my + dotRadius * 2, mz]} center occlude={false}>
            <div style={{ background: 'rgba(0,0,0,0.82)', color: '#4ade80', padding: '4px 9px', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap', pointerEvents: 'none', border: '1px solid rgba(74,222,128,0.5)' }}>
              {fmt(d)}
            </div>
          </Html>
        )
      })()}

      {points.length >= 2 && hoveredIdx === points.length - 1 && (() => {
        const last = points[points.length - 1]
        return (
          <Html position={[last.x, last.y + dotRadius * 4, last.z]} center occlude={false}>
            <div style={{ background: 'rgba(0,0,0,0.9)', color: '#fff', padding: '5px 10px', borderRadius: 5, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap', pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
              {points.length >= 3 && <div>∑ {fmt(perimeter)}</div>}
              {isClosed && area > 0 && <div style={{ color: '#4ade80', fontWeight: 700 }}>⬡ {fmtArea(area)}</div>}
            </div>
          </Html>
        )
      })()}

      {isClosed && area > 0 && (() => {
        const [cx, cy, cz] = centroid(points)
        return (
          <Html position={[cx, cy + dotRadius * 2, cz]} center occlude={false}>
            <div style={{ background: 'rgba(0,0,0,0.75)', color: '#4ade80', padding: '3px 8px', borderRadius: 5, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap', pointerEvents: 'none', border: '1px solid rgba(74,222,128,0.4)' }}>
              ⬡ {fmtArea(area)}
            </div>
          </Html>
        )
      })()}
    </>
  )
}

