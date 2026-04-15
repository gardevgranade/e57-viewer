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

/** Angle (in degrees) between vectors (prev→vertex) and (vertex→next), 0–180 */
function angleBetween(prev: MeasurePoint, vertex: MeasurePoint, next: MeasurePoint): number {
  const ax = prev.x - vertex.x, ay = prev.y - vertex.y, az = prev.z - vertex.z
  const bx = next.x - vertex.x, by = next.y - vertex.y, bz = next.z - vertex.z
  const dot = ax * bx + ay * by + az * bz
  const la = Math.sqrt(ax * ax + ay * ay + az * az)
  const lb = Math.sqrt(bx * bx + by * by + bz * bz)
  if (la < 1e-12 || lb < 1e-12) return 0
  return Math.acos(Math.max(-1, Math.min(1, dot / (la * lb)))) * (180 / Math.PI)
}

/** Snap an angle (degrees) to nearest multiple of 15° */
function snapAngle15(deg: number): number {
  return Math.round(deg / 15) * 15
}

/** Given prevPt, fromPt, and a candidate target, compute the nearest 15° guide direction
 *  Returns { snappedAngle, guideEnd } where guideEnd is a point along the snapped direction.
 *  Uses the plane defined by the three points (or fallback to world-up). */
function computeAngleGuide(
  prevPt: MeasurePoint,
  fromPt: MeasurePoint,
  targetPt: MeasurePoint,
  guideLength: number,
): { angleDeg: number; snappedAngle: number; guideEnd: [number, number, number] } {
  const dirIn = new THREE.Vector3(fromPt.x - prevPt.x, fromPt.y - prevPt.y, fromPt.z - prevPt.z)
  const dirOut = new THREE.Vector3(targetPt.x - fromPt.x, targetPt.y - fromPt.y, targetPt.z - fromPt.z)
  const outLen = dirOut.length()
  if (dirIn.length() < 1e-12 || outLen < 1e-12) {
    return { angleDeg: 0, snappedAngle: 0, guideEnd: [fromPt.x, fromPt.y, fromPt.z] }
  }

  // Compute plane normal (cross of the two directions)
  const normal = new THREE.Vector3().crossVectors(dirIn, dirOut)
  if (normal.length() < 1e-12) {
    // Collinear — pick an arbitrary perpendicular
    normal.set(0, 1, 0)
    if (Math.abs(dirIn.dot(normal)) > 0.99 * dirIn.length()) normal.set(1, 0, 0)
    normal.crossVectors(dirIn, normal)
  }
  normal.normalize()

  const angleDeg = angleBetween(prevPt, fromPt, targetPt)
  const snappedAngle = snapAngle15(angleDeg)

  // Rotate dirIn (reversed to point away from prevPt→fromPt) by snappedAngle around normal
  const inDir = dirIn.clone().normalize()
  const snappedRad = snappedAngle * (Math.PI / 180)

  // Determine rotation sign: is the actual angle CW or CCW around normal?
  const cross = new THREE.Vector3().crossVectors(inDir, dirOut.clone().normalize())
  const sign = cross.dot(normal) >= 0 ? 1 : -1

  const rotated = inDir.clone().applyAxisAngle(normal, sign * snappedRad).multiplyScalar(guideLength)

  return {
    angleDeg,
    snappedAngle,
    guideEnd: [fromPt.x + rotated.x, fromPt.y + rotated.y, fromPt.z + rotated.z],
  }
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

function SavedMeasurementView({ m, dotRadius, onDelete, onContinue, onUpdatePoints, fmt, fmtArea, highlightedSegIdx, measureActive, flyCameraRef, measureSnap, snapCandidates }: {
  m: SavedMeasurement
  dotRadius: number
  onDelete: (id: string) => void
  onContinue: (id: string) => void
  onUpdatePoints: (id: string, points: MeasurePoint[], isClosed: boolean) => void
  fmt: (v: number) => string
  fmtArea: (v: number) => string
  /** Segment index highlighted from the panel (null = none, -1 = whole measurement) */
  highlightedSegIdx: number | null
  measureActive: boolean
  flyCameraRef: React.RefObject<FlyCameraHandle | null>
  measureSnap: boolean
  snapCandidates: SnapCand[]
}) {
  const [hovered, setHovered] = useState<'line' | number | null>(null)
  const [showMenu, setShowMenu] = useState<{ type: 'segment'; segIdx: number } | { type: 'point'; ptIdx: number } | null>(null)
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [dragPoints, setDragPoints] = useState<MeasurePoint[] | null>(null)
  const draggingIdxRef = useRef<number | null>(null)
  const didMoveRef = useRef(false)
  const { camera, gl, scene } = useThree()
  const { bbox } = useViewer()

  // Keep ref in sync
  draggingIdxRef.current = draggingIdx

  // Close context menu on click outside
  useEffect(() => {
    if (!showMenu) return
    const onClick = () => setShowMenu(null)
    window.addEventListener('pointerdown', onClick)
    return () => window.removeEventListener('pointerdown', onClick)
  }, [showMenu])

  // Drag handler for saved measurement points
  useEffect(() => {
    if (draggingIdx === null) return
    const rc = makeRaycaster(bbox)
    didMoveRef.current = false

    const onMove = (e: PointerEvent) => {
      const idx = draggingIdxRef.current
      if (idx === null) return
      didMoveRef.current = true
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1

      // Try snap first
      if (measureSnap && snapCandidates.length > 0) {
        const snap = findSnap(e.clientX, e.clientY, camera, rect, snapCandidates)
        if (snap) {
          const p = snap.pos
          setDragPoints(prev => {
            const pts = prev ?? [...m.points]
            return pts.map((pt, i) => i === idx ? { x: p.x, y: p.y, z: p.z } : pt)
          })
          return
        }
      }

      rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
      const hits = rc.intersectObjects(scene.children, true)
        .filter(h => (h.object instanceof THREE.Points || h.object instanceof THREE.Mesh) && !h.object.userData?.isMeasurement)
      if (hits.length > 0) {
        const p = hits[0].point
        setDragPoints(prev => {
          const pts = prev ?? [...m.points]
          return pts.map((pt, i) => i === idx ? { x: p.x, y: p.y, z: p.z } : pt)
        })
      }
    }

    const onUp = () => {
      setDraggingIdx(null)
      flyCameraRef.current?.setMeasureMode(false)
      if (didMoveRef.current && dragPoints) {
        onUpdatePoints(m.id, dragPoints, m.isClosed)
      }
      setDragPoints(null)
    }

    gl.domElement.addEventListener('pointermove', onMove)
    gl.domElement.addEventListener('pointerup', onUp)
    return () => {
      gl.domElement.removeEventListener('pointermove', onMove)
      gl.domElement.removeEventListener('pointerup', onUp)
    }
  }, [draggingIdx, bbox, camera, gl, scene, m, dragPoints, onUpdatePoints, flyCameraRef, measureSnap, snapCandidates])

  if (!m.visible) return null

  const isWholeHighlighted = highlightedSegIdx === -1
  const pts = dragPoints ?? m.points

  const totalDist = pts.length >= 2
    ? pts.slice(0, -1).reduce((s, p, i) => s + dist3(p, pts[i + 1]), 0)
    : 0
  const closingDist = m.isClosed ? dist3(pts[pts.length - 1], pts[0]) : 0
  const perimeter = totalDist + closingDist
  const area = m.isClosed ? polygonArea3D(pts) : 0

  return (
    <>
      {/* Lines — per-segment so we can highlight individually */}
      {pts.length >= 2 && pts.slice(0, -1).map((p, i) => {
        const q = pts[i + 1]
        const segHighlighted = isWholeHighlighted || highlightedSegIdx === i
        return (
          <Line
            key={`line-${i}`}
            points={[[p.x, p.y, p.z], [q.x, q.y, q.z]]}
            color={segHighlighted ? '#facc15' : '#f97316'}
            lineWidth={segHighlighted ? 4 : 2}
            depthTest={false}
          />
        )
      })}
      {/* Closing segment */}
      {m.isClosed && pts.length >= 3 && (() => {
        const segIdx = pts.length - 1
        const segHighlighted = isWholeHighlighted || highlightedSegIdx === segIdx
        return (
          <Line
            points={[[pts[pts.length - 1].x, pts[pts.length - 1].y, pts[pts.length - 1].z], [pts[0].x, pts[0].y, pts[0].z]]}
            color={segHighlighted ? '#facc15' : '#f97316'}
            lineWidth={segHighlighted ? 4 : 2}
            depthTest={false}
          />
        )
      })()}

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
            onPointerEnter={(e) => { e.stopPropagation(); setHovered(h => typeof h === 'number' ? h : 'line') }}
            onPointerLeave={() => { setHovered(h => h === 'line' ? null : h); setShowMenu(s => s?.type === 'segment' ? null : s) }}
            onClick={(e) => { e.stopPropagation(); setShowMenu({ type: 'segment', segIdx: i }) }}
          >
            <sphereGeometry args={[dotRadius * 2.5, 4, 4]} />
            <meshBasicMaterial transparent opacity={0} depthTest={false} />
          </mesh>
        )
      })}

      {/* Measurement dots (draggable to edit, click endpoint to continue) */}
      {pts.map((p, i) => {
        const isEnd = i === 0 || i === pts.length - 1
        const dotHighlighted = isWholeHighlighted || highlightedSegIdx === i || highlightedSegIdx === i - 1
        const isDragging = draggingIdx === i
        const canDrag = !measureActive
        return (
          <mesh
            key={`dot-${i}`}
            position={[p.x, p.y, p.z]}
            renderOrder={999}
            userData={{ isMeasurement: true }}
            onPointerEnter={(e) => { e.stopPropagation(); setHovered(i) }}
            onPointerLeave={() => { if (draggingIdx === null) setHovered(null) }}
            onPointerOut={() => { if (draggingIdx === null) setHovered(h => h === i ? null : h) }}
            onPointerDown={(e) => {
              if (!canDrag) return
              e.stopPropagation()
              flyCameraRef.current?.setMeasureMode(true)
              setDraggingIdx(i)
              setDragPoints([...m.points])
              gl.domElement.setPointerCapture(e.pointerId)
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (didMoveRef.current) { didMoveRef.current = false; return }
              if (!measureActive) {
                // Show point context menu when not measuring
                setShowMenu({ type: 'point', ptIdx: i })
                return
              }
              if (isEnd && !m.isClosed) onContinue(m.id)
            }}
          >
            <sphereGeometry args={[dotRadius * (isDragging ? 1.4 : hovered === i ? 1.3 : dotHighlighted ? 1.2 : 1), 10, 10]} />
            <meshBasicMaterial
              color={isDragging ? '#fbbf24' : hovered === i && canDrag ? '#fbbf24' : hovered === i && isEnd && !m.isClosed ? '#4ade80' : dotHighlighted ? '#facc15' : '#f97316'}
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

      {/* Context menu on segment click — add point / delete measurement */}
      {showMenu?.type === 'segment' && (() => {
        const i = showMenu.segIdx
        const p = pts[i], q = pts[i + 1]
        const [mx, my, mz] = mid3(p, q)
        const btnStyle: React.CSSProperties = {
          display: 'block', width: '100%', padding: '3px 8px',
          background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', fontSize: 10,
        }
        return (
          <Html position={[mx, my + dotRadius * 10, mz]} center occlude={false}>
            <div style={{
              background: 'rgba(15,15,25,0.95)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6, padding: '2px 0', minWidth: 100, fontFamily: 'system-ui',
              fontSize: 10, boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
            }}>
              <button
                onClick={() => {
                  const newPt = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 }
                  const newPts = [...m.points]
                  newPts.splice(i + 1, 0, newPt)
                  onUpdatePoints(m.id, newPts, m.isClosed)
                  setShowMenu(null)
                }}
                style={{ ...btnStyle, color: '#60a5fa' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(96,165,250,0.15)' }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'none' }}
              >
                ＋ Add point
              </button>
              <button
                onClick={() => { onDelete(m.id); setShowMenu(null) }}
                style={{ ...btnStyle, color: '#ef4444' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(239,68,68,0.15)' }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'none' }}
              >
                🗑 Delete
              </button>
            </div>
          </Html>
        )
      })()}

      {/* Context menu on point click */}
      {showMenu?.type === 'point' && (() => {
        const i = showMenu.ptIdx
        const p = pts[i]
        const canDeletePt = pts.length > 2
        const hasNextSeg = i < pts.length - 1 || m.isClosed
        const hasPrevSeg = i > 0 || m.isClosed
        const btnStyle: React.CSSProperties = {
          display: 'block', width: '100%', padding: '3px 8px',
          background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', fontSize: 10,
        }
        return (
          <Html position={[p.x, p.y + dotRadius * 10, p.z]} center occlude={false}>
            <div style={{
              background: 'rgba(15,15,25,0.95)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6, padding: '2px 0', minWidth: 100, fontFamily: 'system-ui',
              fontSize: 10, boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
            }}>
              {hasNextSeg && (() => {
                const nextIdx = (i + 1) % pts.length
                const q = pts[nextIdx]
                return (
                  <button
                    onClick={() => {
                      const midPt = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 }
                      const newPts = [...m.points]
                      newPts.splice(i + 1, 0, midPt)
                      onUpdatePoints(m.id, newPts, m.isClosed)
                      setShowMenu(null)
                    }}
                    style={{ ...btnStyle, color: '#60a5fa' }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(96,165,250,0.15)' }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'none' }}
                  >
                    ＋ Add after
                  </button>
                )
              })()}
              {hasPrevSeg && (() => {
                const prevIdx = (i - 1 + pts.length) % pts.length
                const q = pts[prevIdx]
                return (
                  <button
                    onClick={() => {
                      const midPt = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 }
                      const newPts = [...m.points]
                      newPts.splice(i, 0, midPt)
                      onUpdatePoints(m.id, newPts, m.isClosed)
                      setShowMenu(null)
                    }}
                    style={{ ...btnStyle, color: '#60a5fa' }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(96,165,250,0.15)' }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'none' }}
                  >
                    ＋ Add before
                  </button>
                )
              })()}
              {canDeletePt && (
                <button
                  onClick={() => {
                    const newPts = m.points.filter((_, idx) => idx !== i)
                    const newClosed = m.isClosed && newPts.length >= 3 ? m.isClosed : false
                    onUpdatePoints(m.id, newPts, newClosed)
                    setShowMenu(null)
                  }}
                  style={{ ...btnStyle, color: '#ef4444' }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(239,68,68,0.15)' }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'none' }}
                >
                  ✕ Remove point
                </button>
              )}
              <button
                onClick={() => { onDelete(m.id); setShowMenu(null) }}
                style={{ ...btnStyle, color: '#ef4444' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(239,68,68,0.15)' }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'none' }}
              >
                🗑 Delete
              </button>
            </div>
          </Html>
        )
      })()}

      {/* Tooltip on point hover */}
      {typeof hovered === 'number' && draggingIdx === null && (() => {
        const isEnd = hovered === 0 || hovered === pts.length - 1
        const canContinue = isEnd && !m.isClosed && measureActive
        const canDrag = !measureActive
        if (!canContinue && !canDrag) return null
        return (
          <Html position={[pts[hovered].x, pts[hovered].y + dotRadius * 3, pts[hovered].z]} center occlude={false}>
            <div style={{
              background: 'rgba(15,15,25,0.9)',
              color: canDrag ? '#fbbf24' : '#4ade80',
              padding: '3px 8px', borderRadius: 5, fontSize: 10,
              fontFamily: 'system-ui', whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: `1px solid ${canDrag ? 'rgba(251,191,36,0.3)' : 'rgba(74,222,128,0.3)'}`,
            }}>
              {canDrag ? 'Drag to edit' : 'Click to continue measuring'}
            </div>
          </Html>
        )
      })()}
    </>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function MeasureTool({ flyCameraRef }: MeasureToolProps) {
  const {
    measureActive, measureSnap, bbox, measureTraceSerial, measureTracePts, setMeasureActive, surfaces,
    savedMeasurements, addMeasurement, removeMeasurement, updateMeasurement,
    highlightedMeasurementId, highlightedSegmentIdx,
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
      addMeasurement({ id: nextMeasureId(), label: `Measurement ${n}`, points: [...points], isClosed, visible: true })
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
      if (e.key === 'Enter' && points.length >= 2) { saveActive(); setMeasureActive(false) }
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
      addMeasurement({ id: nextMeasureId(), label: `Measurement ${n}`, points: [...points], isClosed, visible: true })
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
          onUpdatePoints={updateMeasurement}
          fmt={fmt}
          fmtArea={fmtArea}
          highlightedSegIdx={highlightedMeasurementId === m.id ? (highlightedSegmentIdx ?? -1) : null}
          measureActive={measureActive}
          flyCameraRef={flyCameraRef}
          measureSnap={measureSnap}
          snapCandidates={snapCandidates}
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

      {/* Preview line from last point to ghost + angle guide */}
      {ghost && !isClosed && measureActive && points.length >= 1 && (() => {
        const lastPt = points[points.length - 1]
        const ghostPt: MeasurePoint = { x: ghost.pos.x, y: ghost.pos.y, z: ghost.pos.z }
        const previewFrom: [number, number, number] = [lastPt.x, lastPt.y, lastPt.z]
        const previewTo: [number, number, number] = [ghostPt.x, ghostPt.y, ghostPt.z]
        const previewDist = dist3(lastPt, ghostPt)

        // Angle guide only when we have a previous segment
        const hasPrev = points.length >= 2
        const prevPt = hasPrev ? points[points.length - 2] : null

        let angleInfo: ReturnType<typeof computeAngleGuide> | null = null
        if (hasPrev && prevPt && previewDist > 1e-6) {
          angleInfo = computeAngleGuide(prevPt, lastPt, ghostPt, previewDist * 0.8)
        }

        // Midpoint for the distance label
        const [mx, my, mz] = mid3(lastPt, ghostPt)

        return (
          <>
            {/* Dashed preview line */}
            <Line
              points={[previewFrom, previewTo]}
              color="#f97316"
              lineWidth={1}
              dashed
              dashSize={dotRadius * 2}
              gapSize={dotRadius * 1.5}
              depthTest={false}
            />

            {/* Preview distance label */}
            {previewDist > 1e-4 && (
              <Html position={[mx, my + dotRadius * 2, mz]} center occlude={false}>
                <div style={{
                  background: 'rgba(0,0,0,0.75)', color: '#f97316',
                  padding: '2px 7px', borderRadius: 5, fontSize: 10,
                  fontFamily: 'monospace', whiteSpace: 'nowrap',
                  pointerEvents: 'none', border: '1px solid rgba(249,115,22,0.3)',
                  opacity: 0.8,
                }}>
                  {fmt(previewDist)}
                </div>
              </Html>
            )}

            {/* 15° snap guide line */}
            {angleInfo && Math.abs(angleInfo.angleDeg - angleInfo.snappedAngle) < 14 && (
              <Line
                points={[previewFrom, angleInfo.guideEnd]}
                color="#7c3aed"
                lineWidth={1}
                dashed
                dashSize={dotRadius * 1.5}
                gapSize={dotRadius * 1}
                depthTest={false}
              />
            )}

            {/* Angle badge at the vertex */}
            {angleInfo && (
              <Html position={[lastPt.x, lastPt.y + dotRadius * 3, lastPt.z]} center occlude={false}>
                <div style={{
                  background: 'rgba(0,0,0,0.82)',
                  color: Math.abs(angleInfo.angleDeg - angleInfo.snappedAngle) < 2 ? '#a78bfa' : '#94a3b8',
                  padding: '2px 7px', borderRadius: 5, fontSize: 10,
                  fontFamily: 'monospace', whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  border: `1px solid ${Math.abs(angleInfo.angleDeg - angleInfo.snappedAngle) < 2 ? 'rgba(167,139,250,0.5)' : 'rgba(148,163,184,0.3)'}`,
                }}>
                  {angleInfo.angleDeg.toFixed(1)}°
                  {Math.abs(angleInfo.angleDeg - angleInfo.snappedAngle) < 2 && (
                    <span style={{ color: '#a78bfa', marginLeft: 3 }}>⟨{angleInfo.snappedAngle}°⟩</span>
                  )}
                </div>
              </Html>
            )}
          </>
        )
      })()}

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

      {/* Angle labels at interior vertices of active measurement */}
      {points.length >= 3 && points.map((p, i) => {
        // For open polylines: angles at vertices 1..n-2 (interior)
        // For closed: angles at all vertices
        if (!isClosed && (i === 0 || i === points.length - 1)) return null
        const prev = isClosed
          ? points[(i - 1 + points.length) % points.length]
          : points[i - 1]
        const next = isClosed
          ? points[(i + 1) % points.length]
          : points[i + 1]
        const angle = angleBetween(prev, p, next)
        return (
          <Html key={`angle-${i}`} position={[p.x, p.y - dotRadius * 2.5, p.z]} center occlude={false}>
            <div style={{
              background: 'rgba(0,0,0,0.7)', color: '#a78bfa',
              padding: '1px 5px', borderRadius: 4, fontSize: 9,
              fontFamily: 'monospace', whiteSpace: 'nowrap',
              pointerEvents: 'none', border: '1px solid rgba(167,139,250,0.3)',
            }}>
              {angle.toFixed(1)}°
            </div>
          </Html>
        )
      })}

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

      {/* Finish button near last point */}
      {points.length >= 2 && measureActive && (() => {
        const last = points[points.length - 1]
        return (
          <Html position={[last.x, last.y - dotRadius * 12, last.z]} center occlude={false}>
            <button
              onClick={(e) => { e.stopPropagation(); saveActive(); setMeasureActive(false) }}
              style={{
                background: '#16a34a', color: '#fff',
                border: 'none', borderRadius: 5, padding: '3px 10px',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'system-ui, sans-serif',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                whiteSpace: 'nowrap',
                marginTop: 16,
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#22c55e' }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = '#16a34a' }}
            >
              ✓ Finish
            </button>
          </Html>
        )
      })()}
    </>
  )
}

