/**
 * Web Worker for surface detection (both point cloud and mesh).
 * Runs CPU-intensive detection off the main thread.
 */

import { detectSurfaces } from './surfaceDetect'
import type { DetectedSurface } from './surfaceDetect'

// ── Mesh detection (pure computation, no THREE.js) ──────────────────────────

const SURFACE_COLORS = [
  '#ef4444', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#10b981', '#ec4899', '#14b8a6', '#f97316',
]

const NORMAL_DOT_THRESHOLD = Math.cos((20 * Math.PI) / 180)

interface TriData {
  cx: number; cy: number; cz: number
  area: number
  pos: number[]
}

interface NormalCluster {
  nx: number; ny: number; nz: number
  tris: TriData[]
}

function makeUF(n: number) {
  const p = new Int32Array(n)
  for (let i = 0; i < n; i++) p[i] = i
  function find(i: number): number {
    let current = i
    while (p[current] !== current) { p[current] = (p[(p[current] ?? 0)] ?? 0); current = (p[current] ?? 0) }
    return current
  }
  return {
    find,
    union(a: number, b: number) { p[find(a)] = find(b) },
  }
}

function spatialComponents(tris: TriData[], thresholdOverride?: number): Uint32Array {
  const n = tris.length
  if (n === 1) return new Uint32Array(1)

  let totalArea = 0
  let maxX = -Infinity, minX = Infinity
  let maxY = -Infinity, minY = Infinity
  let maxZ = -Infinity, minZ = Infinity
  for (const t of tris) {
    totalArea += t.area
    if (t.cx < minX) minX = t.cx; if (t.cx > maxX) maxX = t.cx
    if (t.cy < minY) minY = t.cy; if (t.cy > maxY) maxY = t.cy
    if (t.cz < minZ) minZ = t.cz; if (t.cz > maxZ) maxZ = t.cz
  }
  const diag = Math.hypot(maxX-minX, maxY-minY, maxZ-minZ)
  const avgEdge = Math.sqrt(totalArea / n) * 1.4
  const threshold = thresholdOverride ?? Math.max(avgEdge * 3, diag * 0.1)
  const t2 = threshold * threshold

  const uf = makeUF(n)
  const order = Array.from({ length: n }, (_, i) => i)
  order.sort((a, b) => (tris[a]?.cx ?? 0) - (tris[b]?.cx ?? 0))

  for (let i = 0; i < n; i++) {
    const ai = (order[i] ?? 0)
    const triAi = tris[ai]
    if (!triAi) continue
    const { cx: ax, cy: ay, cz: az } = triAi
    for (let j = i + 1; j < n; j++) {
      const bj = (order[j] ?? 0)
      const triBj = tris[bj]
      if (!triBj) continue
      const { cx: bx, cy: by, cz: bz } = triBj
      const dx = bx - ax
      if (dx * dx > t2) break
      const dy = by - ay, dz = bz - az
      if (dx*dx + dy*dy + dz*dz <= t2) uf.union(ai, bj)
    }
  }

  const assignment = new Uint32Array(n)
  const roots = new Map<number, number>()
  let next = 0
  for (let i = 0; i < n; i++) {
    // oxlint-disable-next-line no-array-callback-reference -- uf.find is not Array.find
    const r = uf.find(i)
    let id = roots.get(r)
    if (id === undefined) { id = next; next += 1; roots.set(r, id) }
    assignment[i] = id
  }
  return assignment
}

/**
 * Mesh surface detection from pre-extracted triangle data (no THREE.js needed).
 * triPositions: flat Float32Array of world-space triangle verts [ax,ay,az, bx,by,bz, cx,cy,cz, ...]
 * triNormals: flat Float32Array of per-triangle normals [nx,ny,nz, ...]
 * triAreas: Float32Array of per-triangle area
 */
function detectMeshSurfacesFromData(
  triPositions: Float32Array,
  triNormals: Float32Array,
  triAreas: Float32Array,
): DetectedSurface[] {
  const triCount = triAreas.length
  if (triCount === 0) return []

  const normalClusters: NormalCluster[] = []

  for (let t = 0; t < triCount; t++) {
    const nx = (triNormals[t * 3] ?? 0), ny = (triNormals[t * 3 + 1] ?? 0), nz = (triNormals[t * 3 + 2] ?? 0)
    const area = (triAreas[t] ?? 0)
    if (area < 1e-12) continue

    const base = t * 9
    const ax = (triPositions[base] ?? 0), ay = (triPositions[base+1] ?? 0), az = (triPositions[base+2] ?? 0)
    const bx = (triPositions[base+3] ?? 0), by = (triPositions[base+4] ?? 0), bz = (triPositions[base+5] ?? 0)
    const cx = (triPositions[base+6] ?? 0), cy = (triPositions[base+7] ?? 0), cz = (triPositions[base+8] ?? 0)

    const tri: TriData = {
      cx: (ax+bx+cx)/3, cy: (ay+by+cy)/3, cz: (az+bz+cz)/3,
      area,
      pos: [ax,ay,az, bx,by,bz, cx,cy,cz],
    }

    let best: NormalCluster | null = null
    let bestDot = NORMAL_DOT_THRESHOLD
    for (const cl of normalClusters) {
      const len = Math.hypot(cl.nx, cl.ny, cl.nz)
      if (len < 1e-10) continue
      const dot = (nx*cl.nx + ny*cl.ny + nz*cl.nz) / len
      if (dot > bestDot) { bestDot = dot; best = cl }
    }
    if (best) {
      best.nx += nx; best.ny += ny; best.nz += nz
      best.tris.push(tri)
    } else {
      normalClusters.push({ nx, ny, nz, tris: [tri] })
    }
  }

  if (normalClusters.length === 0) return []

  interface Candidate {
    nx: number; ny: number; nz: number
    normalY: number; totalArea: number; centroidY: number
    triPositions: number[]; triCount: number
  }
  const candidates: Candidate[] = []

  for (const cl of normalClusters) {
    if (cl.tris.length === 0) continue
    const len = Math.hypot(cl.nx, cl.ny, cl.nz) || 1
    const normalY = cl.ny / len
    const cnx = cl.nx / len, cny = cl.ny / len, cnz = cl.nz / len

    const assignment = spatialComponents(cl.tris)
    let numComponents = 0
    for (let i = 0; i < assignment.length; i++) {
      if ((assignment[i] ?? 0) + 1 > numComponents) numComponents = (assignment[i] ?? 0) + 1
    }

    for (let c = 0; c < numComponents; c++) {
      let centroidYAccum = 0, totalArea = 0
      const triPos: number[] = []
      for (let i = 0; i < cl.tris.length; i++) {
        if (assignment[i] !== c) continue
        const tri = cl.tris[i]
        if (!tri) continue
        totalArea += tri.area
        centroidYAccum += tri.cy * tri.area
        triPos.push(...tri.pos)
      }
      if (totalArea < 1e-10) continue
      candidates.push({
        nx: cnx, ny: cny, nz: cnz,
        normalY, totalArea, centroidY: centroidYAccum / totalArea,
        triPositions: triPos, triCount: triPos.length / 9,
      })
    }
  }

  if (candidates.length === 0) return []

  candidates.sort((a, b) => b.totalArea - a.totalArea)
  const topCandidate = candidates[0]
  if (!topCandidate) return []
  const minArea = topCandidate.totalArea * 0.01
  const top = candidates.filter(c => c.totalArea >= minArea)

  const centroidYs = top.map(c => c.centroidY)
  const medianY = [...centroidYs].sort((a: number, b: number) => a - b)[Math.floor(centroidYs.length/2)] ?? 0

  const labelCounts: Record<string, number> = {}
  const results: DetectedSurface[] = top.map((c, i) => {
    const base = Math.abs(c.normalY) > 0.65
      ? (c.centroidY >= medianY ? 'Roof' : 'Floor')
      : 'Wall'
    labelCounts[base] = (labelCounts[base] ?? 0) + 1
    return {
      id: `mesh-surface-${i}`,
      label: base,
      color: (SURFACE_COLORS[i % SURFACE_COLORS.length] ?? '#888888'),
      visible: true,
      normalY: c.normalY,
      centroidY: c.centroidY,
      pointCount: c.triCount,
      pointIndices: [],
      area: c.totalArea,
      worldTriangles: new Float32Array(c.triPositions),
      normal: [c.nx, c.ny, c.nz] as [number, number, number],
    }
  })

  const seen: Record<string, number> = {}
  for (const s of results) {
    if ((labelCounts[s.label] ?? 0) > 1) {
      seen[s.label] = (seen[s.label] ?? 0) + 1
      s.label = `${s.label} ${seen[s.label]}`
    }
  }
  return results
}

// ── Worker message handler ──────────────────────────────────────────────────

export type DetectWorkerRequest =
  | { type: 'pointcloud'; worldPos: Float32Array; count: number }
  | { type: 'mesh'; triPositions: Float32Array; triNormals: Float32Array; triAreas: Float32Array }

export interface DetectWorkerResponse {
  type: 'result'
  surfaces: DetectedSurface[]
  /** Transferable worldTriangles arrays */
  transfers: ArrayBuffer[]
}

globalThis.addEventListener('message', (e: MessageEvent<DetectWorkerRequest>) => {
  const req = e.data
  let surfaces: DetectedSurface[]

  if (req.type === 'pointcloud') {
    surfaces = detectSurfaces(req.worldPos, req.count)
  } else {
    surfaces = detectMeshSurfacesFromData(req.triPositions, req.triNormals, req.triAreas)
  }

  // Collect transferable buffers
  const transfers: ArrayBuffer[] = []
  for (const s of surfaces) {
    if (s.worldTriangles) transfers.push(s.worldTriangles.buffer as ArrayBuffer)
  }

  const resp: DetectWorkerResponse = { type: 'result', surfaces, transfers }
  ;(globalThis as unknown as Worker).postMessage(resp, transfers)
})
