'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { useViewer } from '../../lib/viewerState.js'
import type { PickedSurface, SavedMeasurement } from '../../lib/viewerState.js'
import { useUnits } from '../../lib/units.js'
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

let _measureIdCounter = 0
function nextMeasureId() {
  return `m-${Date.now()}-${++_measureIdCounter}`
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

// ── Saved measurement rendering ─────────────────────────────────────────────

function SavedMeasurementView({ m, dotRadius, onDelete, onContinue, fmt, fmtArea }: {
  m: SavedMeasurement
  dotRadius: number
  onDelete: (id: string) => void
  onContinue: (id: string) => void
  fmt: (v: number) => string
  fmtArea: (v: number) => string
}) {
  const [hovered, setHovered] = useState<'line' | number | null>(null)
  const [showMenu, setShowMenu] = useState<{ segIdx: number } | null>(null)

  const pts = m.points
  const linePoints = pts.map(p => [p.x, p.y, p.z] as [number, number, number])
  const closedLinePoints = m.isClosed ? [...linePoints, linePoints[0]] : linePoints

  const totalDist = pts.length >= 2
    ? pts.slice(0, -1).reduce((s, p, i) => s + dist3(p, pts[i + 1]), 0)
    : 0
  const closingDist = m.isClosed ? dist3(pts[pts.length - 1], pts[0]) : 0
  const perimeter = totalDist + closingDist
  const area = m.isClosed ? polygonArea3D(pts) : 0

  return (
    <>
      {/* Lines (visible always) */}
      {closedLinePoints.length >= 2 && (
        <Line points={closedLinePoints} color="#f97316" lineWidth={2} depthTest={false} />
      )}

      {/* Clickable line segments for delete */}
      {pts.slice(0, -1).map((p, i) => {
        const q = pts[i + 1]
        const [mx, my, mz] = mid3(p, q)
        return (
          <mesh
            key={`seg-${i}`}
            position={[mx, my, mz]}
            renderOrder={998}
            userData={{ isMeasurement: true }}
            onPointerEnter={(e) => { e.stopPropagation(); setHovered('line') }}
            onPointerLeave={() => { setHovered(null); setShowMenu(null) }}
            onClick={(e) => { e.stopPropagation(); setShowMenu({ segIdx: i }) }}
          >
            <sphereGeometry args={[dotRadius * 2.5, 4, 4]} />
            <meshBasicMaterial transparent opacity={0} depthTest={false} />
          </mesh>
        )
      })}

      {/* Measurement dots (clickable to continue) */}
      {pts.map((p, i) => {
        const isEnd = i === 0 || i === pts.length - 1
        return (
          <mesh
            key={`dot-${i}`}
            position={[p.x, p.y, p.z]}
            renderOrder={999}
            userData={{ isMeasurement: true }}
            onPointerEnter={(e) => { e.stopPropagation(); setHovered(i) }}
            onPointerLeave={() => setHovered(null)}
            onClick={(e) => {
              e.stopPropagation()
              if (isEnd && !m.isClosed) onContinue(m.id)
            }}
          >
            <sphereGeometry args={[dotRadius * (hovered === i ? 1.3 : 1), 10, 10]} />
            <meshBasicMaterial
              color={hovered === i && isEnd && !m.isClosed ? '#4ade80' : '#f97316'}
              depthTest={false}
            />
          </mesh>
        )
      })}

      {/* Segment distance labels on hover */}
      {typeof hovered === 'number' && hovered < pts.length - 1 && (() => {
        const p = pts[hovered], q = pts[hovered + 1]
        const d = dist3(p, q)
        const [mx, my, mz] = mid3(p, q)
        return (
          <Html position={[mx, my + dotRadius * 2, mz]} center occlude={false}>
            <div style={{
              background: 'rgba(0,0,0,0.82)', color: '#f97316',
              padding: '4px 9px', borderRadius: 6, fontSize: 12,
              fontFamily: 'monospace', whiteSpace: 'nowrap',
              pointerEvents: 'none', border: '1px solid rgba(249,115,22,0.5)',
            }}>
              {fmt(d)}
            </div>
          </Html>
        )
      })()}

      {/* Total / area label on last point hover */}
      {typeof hovered === 'number' && hovered === pts.length - 1 && pts.length >= 2 && (() => {
        const last = pts[pts.length - 1]
        return (
          <Html position={[last.x, last.y + dotRadius * 4, last.z]} center occlude={false}>
            <div style={{
              background: 'rgba(0,0,0,0.9)', color: '#fff',
              padding: '5px 10px', borderRadius: 5, fontSize: 11,
              fontFamily: 'monospace', whiteSpace: 'nowrap',
              pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.2)', lineHeight: 1.6,
            }}>
              {pts.length >= 3 && <div>∑ {fmt(perimeter)}</div>}
              {m.isClosed && area > 0 && <div style={{ color: '#4ade80', fontWeight: 700 }}>⬡ {fmtArea(area)}</div>}
            </div>
          </Html>
        )
      })()}

      {/* Centroid area label for closed measurements */}
      {m.isClosed && area > 0 && (() => {
        const [cx, cy, cz] = centroid(pts)
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

      {/* Context menu on line click */}
      {showMenu && (() => {
        const i = showMenu.segIdx
        const p = pts[i], q = pts[i + 1]
        const [mx, my, mz] = mid3(p, q)
        return (
          <Html position={[mx, my + dotRadius * 3, mz]} center occlude={false}>
            <div style={{
              background: 'rgba(15,15,25,0.95)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8, padding: '4px 0', minWidth: 120, fontFamily: 'system-ui',
              fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}>
              <button
                onClick={() => { onDelete(m.id); setShowMenu(null) }}
                style={{
                  display: 'block', width: '100%', padding: '6px 14px',
                  color: '#ef4444', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left', fontSize: 12,
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(239,68,68,0.15)' }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'none' }}
              >
                🗑 Delete measurement
              </button>
            </div>
          </Html>
        )
      })()}

      {/* Tooltip on endpoint hover: "Click to continue" */}
      {typeof hovered === 'number' && (hovered === 0 || hovered === pts.length - 1) && !m.isClosed && (
        <Html position={[pts[hovered].x, pts[hovered].y + dotRadius * 3, pts[hovered].z]} center occlude={false}>
          <div style={{
            background: 'rgba(15,15,25,0.9)', color: '#4ade80',
            padding: '3px 8px', borderRadius: 5, fontSize: 10,
            fontFamily: 'system-ui', whiteSpace: 'nowrap',
            pointerEvents: 'none', border: '1px solid rgba(74,222,128,0.3)',
          }}>
            Click to continue measuring
          </div>
        </Html>
      )}
    </>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function MeasureTool({ flyCameraRef }: MeasureToolProps) {
  const {
    measureActive, measureSnap, bbox, measureTraceSerial, measureTracePts, setMeasureActive, surfaces,
    savedMeasurements, addMeasurement, removeMeasurement,
  } = useViewer()
  const { fmtLength, fmtArea } = useUnits()
  const fmt = fmtLength
  const { camera, gl, scene } = useThree()
  const [points, setPoints] = useState<MeasurePoint[]>([])
  const [isClosed, setIsClosed] = useState(false)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [ghost, setGhost] = useState<{ pos: THREE.Vector3; type: SnapType | 'free' } | null>(null)

  const draggingIdxRef = useRef<number | null>(null)
  const justDraggedRef = useRef(false)
  const didMoveRef = useRef(false)
  const sphereClickRef = useRef<number | null>(null)
  const prevTraceSerialRef = useRef(0)
  const ghostRef = useRef<{ pos: THREE.Vector3; type: SnapType | 'free' } | null>(null)
  const dotRadiusRef = useRef(0.01)

  const snapKey = surfaces.map(s => `${s.id}:${s.visible ? 1 : 0}:${s.worldTriangles?.length ?? 0}`).join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snapCandidates = useMemo(() => extractSnapCandidates(surfaces), [snapKey])

  useEffect(() => { draggingIdxRef.current = draggingIdx }, [draggingIdx])

  // Save active measurement when leaving measure mode or completing
  const saveActive = useCallback(() => {
    if (points.length >= 2) {
      const n = savedMeasurements.length + 1
      addMeasurement({ id: nextMeasureId(), label: `Measurement ${n}`, points: [...points], isClosed })
    }
    setPoints([])
    setIsClosed(false)
    setGhost(null)
  }, [points, isClosed, addMeasurement, savedMeasurements.length])

  // When measure mode deactivates, save current measurement
  const prevActive = useRef(measureActive)
  useEffect(() => {
    if (prevActive.current && !measureActive) {
      saveActive()
    }
    prevActive.current = measureActive
  }, [measureActive, saveActive])

  // Trace surface measure
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

  // Escape to cancel current active measurement
  useEffect(() => {
    if (points.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPoints([]); setIsClosed(false); setGhost(null) }
      // Enter to finish current measurement and save it
      if (e.key === 'Enter' && points.length >= 2) { saveActive() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [points.length, saveActive])

  // Mousemove: ghost / snap tracking
  useEffect(() => {
    if (!measureActive) return

    const rc = makeRaycaster(bbox)

    const onMove = (e: MouseEvent) => {
      if (draggingIdxRef.current !== null) return
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)

      let resolved: { pos: THREE.Vector3; type: SnapType | 'free' } | null = null

      if (measureSnap && snapCandidates.length > 0) {
        const snap = findSnap(e.clientX, e.clientY, camera, rect, snapCandidates)
        if (snap) { resolved = snap; ghostRef.current = resolved; setGhost(resolved); return }
      }

      const hits = rc.intersectObjects(scene.children, true)
        .filter(h => (h.object instanceof THREE.Points || h.object instanceof THREE.Mesh) && !h.object.userData?.isMeasurement)
      if (hits.length > 0) {
        resolved = { pos: hits[0].point, type: 'free' }
      } else {
        resolved = null
      }

      // Snap ghost to first point when close enough to close the polygon
      if (resolved && points.length >= 3) {
        const first = points[0]
        const fp = new THREE.Vector3(first.x, first.y, first.z)
        const d = resolved.pos.distanceTo(fp)
        if (d < dotRadiusRef.current * 5) {
          resolved = { pos: fp, type: 'vertex' }
        }
      }

      ghostRef.current = resolved
      setGhost(resolved)
    }

    gl.domElement.addEventListener('mousemove', onMove)
    return () => gl.domElement.removeEventListener('mousemove', onMove)
  }, [measureActive, measureSnap, snapCandidates, camera, gl, scene, bbox, points])

  // Drag
  useEffect(() => {
    if (draggingIdx === null) return

    const rc = makeRaycaster(bbox)
    didMoveRef.current = false

    const onMove = (e: PointerEvent) => {
      const idx = draggingIdxRef.current
      if (idx === null) return
      didMoveRef.current = true
      sphereClickRef.current = null
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1

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
        .filter(h => (h.object instanceof THREE.Points || h.object instanceof THREE.Mesh) && !h.object.userData?.isMeasurement)
      if (hits.length > 0) {
        const p = hits[0].point
        setPoints(prev => prev.map((pt, i) => i === idx ? { x: p.x, y: p.y, z: p.z } : pt))
      }
    }

    const onUp = () => {
      justDraggedRef.current = didMoveRef.current
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

  // Click: add point
  useEffect(() => {
    if (!measureActive) return

    const rc = makeRaycaster(bbox)

    const onClick = (e: MouseEvent) => {
      if (justDraggedRef.current) { justDraggedRef.current = false; return }
      if (isClosed) {
        // Closed measurement → auto-save and start fresh
        saveActive()
        return
      }

      const hitSphereIdx = sphereClickRef.current
      sphereClickRef.current = null

      if (hitSphereIdx !== null) {
        if (hitSphereIdx === 0 && points.length >= 3) {
          setIsClosed(true)
          return
        }
        if (hitSphereIdx !== points.length - 1) {
          const existing = points[hitSphereIdx]
          setPoints(prev => [...prev, { ...existing }])
        }
        return
      }

      const g = ghostRef.current
      if (g) {
        // Auto-close if clicking near first point with enough points
        if (points.length >= 3) {
          const first = points[0]
          const d = Math.sqrt((g.pos.x - first.x) ** 2 + (g.pos.y - first.y) ** 2 + (g.pos.z - first.z) ** 2)
          const closeThreshold = dotRadiusRef.current * 5
          if (d < closeThreshold) {
            setIsClosed(true)
            return
          }
        }
        setPoints(prev => [...prev, { x: g.pos.x, y: g.pos.y, z: g.pos.z }])
        return
      }

      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
      const hits = rc.intersectObjects(scene.children, true)
        .filter(h => (h.object instanceof THREE.Points || h.object instanceof THREE.Mesh) && !h.object.userData?.isMeasurement)
      if (hits.length > 0) {
        const p = hits[0].point
        // Auto-close if near first point
        if (points.length >= 3) {
          const first = points[0]
          const d = Math.sqrt((p.x - first.x) ** 2 + (p.y - first.y) ** 2 + (p.z - first.z) ** 2)
          const closeThreshold = dotRadiusRef.current * 5
          if (d < closeThreshold) {
            setIsClosed(true)
            return
          }
        }
        setPoints(prev => [...prev, { x: p.x, y: p.y, z: p.z }])
      }
    }

    gl.domElement.addEventListener('click', onClick)
    return () => gl.domElement.removeEventListener('click', onClick)
  }, [measureActive, camera, gl, scene, bbox, isClosed, points, saveActive])

  // Continue from a saved measurement's endpoint
  const handleContinue = useCallback((measurementId: string) => {
    const m = savedMeasurements.find(x => x.id === measurementId)
    if (!m || m.isClosed) return
    // Save current active measurement first
    if (points.length >= 2) {
      const n = savedMeasurements.length + 1
      addMeasurement({ id: nextMeasureId(), label: `Measurement ${n}`, points: [...points], isClosed })
    }
    // Load saved measurement back as active
    setPoints([...m.points])
    setIsClosed(false)
    removeMeasurement(measurementId)
    if (!measureActive) setMeasureActive(true)
  }, [savedMeasurements, points, isClosed, addMeasurement, removeMeasurement, measureActive, setMeasureActive])

  const span = bbox ? Math.max(bbox.maxX - bbox.minX, bbox.maxZ - bbox.minZ) : 5
  const dotRadius = Math.max(span * 0.004, 0.01)
  dotRadiusRef.current = dotRadius

  const hasActive = points.length > 0 || ghost
  const hasSaved = savedMeasurements.length > 0

  if (!hasActive && !hasSaved) return null

  const linePoints = points.map(p => [p.x, p.y, p.z] as [number, number, number])
  const closedLinePoints = isClosed ? [...linePoints, linePoints[0]] : linePoints

  const totalDist = points.length >= 2
    ? points.slice(0, -1).reduce((s, p, i) => s + dist3(p, points[i + 1]), 0)
    : 0
  const closingDist = isClosed ? dist3(points[points.length - 1], points[0]) : 0
  const perimeter = totalDist + closingDist
  const area = isClosed ? polygonArea3D(points) : 0

  const ghostColor = ghost?.type === 'vertex' ? '#fbbf24' : ghost?.type === 'edge' ? '#06b6d4' : '#ffffff'

  return (
    <>
      {/* ── Saved measurements (always visible) ── */}
      {savedMeasurements.map(m => (
        <SavedMeasurementView
          key={m.id}
          m={m}
          dotRadius={dotRadius}
          onDelete={removeMeasurement}
          onContinue={handleContinue}
          fmt={fmt}
          fmtArea={fmtArea}
        />
      ))}

      {/* ── Active measurement (being built) ── */}

      {/* Snap ghost indicator */}
      {ghost && !isClosed && measureActive && (
        <>
          <mesh position={ghost.pos.toArray()} renderOrder={1000}>
            <sphereGeometry args={[dotRadius * 1.2, 12, 12]} />
            <meshBasicMaterial color={ghostColor} transparent opacity={0.85} depthTest={false} />
          </mesh>
          {ghost.type === 'vertex' && (
            <mesh position={ghost.pos.toArray()} renderOrder={999}>
              <torusGeometry args={[dotRadius * 2, dotRadius * 0.3, 6, 24]} />
              <meshBasicMaterial color={ghostColor} transparent opacity={0.5} depthTest={false} />
            </mesh>
          )}
          {ghost.type === 'edge' && (
            <mesh position={ghost.pos.toArray()} renderOrder={999}>
              <torusGeometry args={[dotRadius * 1.6, dotRadius * 0.25, 6, 24]} />
              <meshBasicMaterial color={ghostColor} transparent opacity={0.5} depthTest={false} />
            </mesh>
          )}
        </>
      )}

      {/* Active measurement dots */}
      {points.map((p, i) => {
        const isFirst = i === 0
        const canClose = isFirst && !isClosed && points.length >= 3 && measureActive
        return (
          <mesh
            key={i}
            position={[p.x, p.y, p.z]}
            renderOrder={999}
            userData={{ isMeasurement: true }}
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

