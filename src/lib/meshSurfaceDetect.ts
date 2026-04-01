import * as THREE from 'three'
import type { DetectedSurface } from './surfaceDetect.js'

const SURFACE_COLORS = [
  '#ef4444', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#10b981', '#ec4899', '#14b8a6', '#f97316',
]

const NORMAL_DOT_THRESHOLD = Math.cos((20 * Math.PI) / 180) // ≈ 0.940

interface TriData {
  cx: number; cy: number; cz: number
  area: number
  pos: number[]  // 9 world floats
}

interface NormalCluster {
  nx: number; ny: number; nz: number
  tris: TriData[]
}

// ── Union-Find ─────────────────────────────────────────────────────────────

function makeUF(n: number) {
  const p = new Int32Array(n)
  for (let i = 0; i < n; i++) p[i] = i
  function find(i: number): number {
    while (p[i] !== i) { p[i] = p[p[i]!]!; i = p[i]! }
    return i
  }
  return {
    find,
    union(a: number, b: number) { p[find(a)] = find(b) },
  }
}

/**
 * Split tris into spatially connected components.
 *
 * threshold is chosen so that:
 *  - adjacent triangles (centroid distance ≈ avgEdgeLen) are ALWAYS connected
 *  - patches separated by a "real gap" are split
 *
 * threshold = max( 3 × avgEdgeLen,  bboxDiag × 0.10 )
 *
 * The avgEdgeLen term ensures the threshold scales with mesh density so
 * coarsely tessellated walls don't fragment. The bboxDiag term provides
 * a minimum split distance relative to the cluster's overall extent.
 */
function spatialComponents(tris: TriData[], thresholdOverride?: number): Uint32Array {
  const n = tris.length
  if (n === 1) return new Uint32Array(1)

  // Total area and bbox for threshold calculation
  let totalArea = 0
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (const t of tris) {
    totalArea += t.area
    if (t.cx < minX) minX = t.cx; if (t.cx > maxX) maxX = t.cx
    if (t.cy < minY) minY = t.cy; if (t.cy > maxY) maxY = t.cy
    if (t.cz < minZ) minZ = t.cz; if (t.cz > maxZ) maxZ = t.cz
  }
  const diag = Math.sqrt((maxX-minX)**2 + (maxY-minY)**2 + (maxZ-minZ)**2)
  // avgEdgeLen ≈ sqrt(avgTriArea) × 1.4  (rough triangle edge estimate)
  const avgEdge = Math.sqrt(totalArea / n) * 1.4
  const threshold = thresholdOverride ?? Math.max(avgEdge * 3, diag * 0.10)
  const t2 = threshold * threshold

  const uf = makeUF(n)

  // Sort by cx for sweep-line pruning
  const order = Array.from({ length: n }, (_, i) => i)
  order.sort((a, b) => tris[a]!.cx - tris[b]!.cx)

  for (let i = 0; i < n; i++) {
    const ai = order[i]!
    const { cx: ax, cy: ay, cz: az } = tris[ai]!
    for (let j = i + 1; j < n; j++) {
      const bj = order[j]!
      const { cx: bx, cy: by, cz: bz } = tris[bj]!
      const dx = bx - ax
      if (dx * dx > t2) break
      const dy = by - ay, dz = bz - az
      if (dx*dx + dy*dy + dz*dz <= t2) uf.union(ai, bj)
    }
  }

  // Compact IDs
  const assignment = new Uint32Array(n)
  const roots = new Map<number, number>()
  let next = 0
  for (let i = 0; i < n; i++) {
    const r = uf.find(i)
    let id = roots.get(r)
    if (id === undefined) { id = next++; roots.set(r, id) }
    assignment[i] = id
  }
  return assignment
}

// ── Main export ─────────────────────────────────────────────────────────────

export function detectMeshSurfaces(
  root: THREE.Object3D,
): DetectedSurface[] {
  const normalClusters: NormalCluster[] = []

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const geo = child.geometry as THREE.BufferGeometry
    if (!geo) return
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!posAttr) return

    const index = geo.index
    const mat = child.matrixWorld
    const triCount = index ? index.count / 3 : posAttr.count / 3

    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3()
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3()
    const normal = new THREE.Vector3()

    for (let t = 0; t < triCount; t++) {
      const ia = index ? index.getX(t*3)   : t*3
      const ib = index ? index.getX(t*3+1) : t*3+1
      const ic = index ? index.getX(t*3+2) : t*3+2

      va.fromBufferAttribute(posAttr, ia).applyMatrix4(mat)
      vb.fromBufferAttribute(posAttr, ib).applyMatrix4(mat)
      vc.fromBufferAttribute(posAttr, ic).applyMatrix4(mat)

      e1.subVectors(vb, va); e2.subVectors(vc, va)
      normal.crossVectors(e1, e2)
      const area = normal.length() / 2
      if (area < 1e-12) continue
      normal.normalize()

      const tri: TriData = {
        cx: (va.x+vb.x+vc.x)/3, cy: (va.y+vb.y+vc.y)/3, cz: (va.z+vb.z+vc.z)/3,
        area,
        pos: [va.x,va.y,va.z, vb.x,vb.y,vb.z, vc.x,vc.y,vc.z],
      }

      let best: NormalCluster | null = null
      let bestDot = NORMAL_DOT_THRESHOLD
      for (const cl of normalClusters) {
        const len = Math.sqrt(cl.nx*cl.nx + cl.ny*cl.ny + cl.nz*cl.nz)
        if (len < 1e-10) continue
        const dot = (normal.x*cl.nx + normal.y*cl.ny + normal.z*cl.nz) / len
        if (dot > bestDot) { bestDot = dot; best = cl }
      }
      if (best) {
        best.nx += normal.x; best.ny += normal.y; best.nz += normal.z
        best.tris.push(tri)
      } else {
        normalClusters.push({ nx: normal.x, ny: normal.y, nz: normal.z, tris: [tri] })
      }
    }
  })

  if (normalClusters.length === 0) return []

  // Split each normal cluster into spatially connected components
  interface Candidate {
    normalY: number; totalArea: number; centroidY: number
    triPositions: number[]; triCount: number
  }
  const candidates: Candidate[] = []

  for (const cl of normalClusters) {
    if (cl.tris.length === 0) continue
    const len = Math.sqrt(cl.nx*cl.nx + cl.ny*cl.ny + cl.nz*cl.nz) || 1
    const normalY = cl.ny / len

    const assignment = spatialComponents(cl.tris)
    let numComponents = 0
    for (let i = 0; i < assignment.length; i++) {
      if (assignment[i]! + 1 > numComponents) numComponents = assignment[i]! + 1
    }

    for (let c = 0; c < numComponents; c++) {
      let totalArea = 0, centroidYAccum = 0
      const triPositions: number[] = []
      for (let i = 0; i < cl.tris.length; i++) {
        if (assignment[i] !== c) continue
        const tri = cl.tris[i]!
        totalArea += tri.area
        centroidYAccum += tri.cy * tri.area
        triPositions.push(...tri.pos)
      }
      if (totalArea < 1e-10) continue
      candidates.push({
        normalY, totalArea, centroidY: centroidYAccum / totalArea,
        triPositions, triCount: triPositions.length / 9,
      })
    }
  }

  if (candidates.length === 0) return []

  candidates.sort((a, b) => b.totalArea - a.totalArea)

  // Drop fragments smaller than 1% of the largest surface
  const minArea = candidates[0]!.totalArea * 0.01
  const top = candidates.filter(c => c.totalArea >= minArea)

  const centroidYs = top.map(c => c.centroidY)
  const medianY = [...centroidYs].sort((a,b)=>a-b)[Math.floor(centroidYs.length/2)] ?? 0

  const labelCounts: Record<string, number> = {}
  const results: DetectedSurface[] = top.map((c, i) => {
    const base = Math.abs(c.normalY) > 0.65
      ? (c.centroidY >= medianY ? 'Roof' : 'Floor')
      : 'Wall'
    labelCounts[base] = (labelCounts[base] ?? 0) + 1
    return {
      id: `mesh-surface-${i}`,
      label: base,
      color: SURFACE_COLORS[i % SURFACE_COLORS.length]!,
      visible: true,
      normalY: c.normalY,
      centroidY: c.centroidY,
      pointCount: c.triCount,
      pointIndices: [],
      area: c.totalArea,
      worldTriangles: new Float32Array(c.triPositions),
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

// ── Split a surface into spatially disconnected components ──────────────────

/**
 * Attempt to split the worldTriangles of a surface into spatially separate
 * components using a tighter threshold than the global detect pass.
 *
 * thresholdMultiplier: avgEdge multiplier (default 1.5, tighter than global 3)
 * Returns an array of Float32Array (one per component), or the original if
 * only one component is found.
 */
export function splitSurfaceTriangles(
  worldTriangles: Float32Array,
  thresholdMultiplier = 1.5,
): Float32Array[] {
  const triCount = Math.floor(worldTriangles.length / 9)
  if (triCount < 2) return [worldTriangles]

  const tris: TriData[] = []
  let totalArea = 0

  for (let t = 0; t < triCount; t++) {
    const ax = worldTriangles[t*9]!, ay = worldTriangles[t*9+1]!, az = worldTriangles[t*9+2]!
    const bx = worldTriangles[t*9+3]!, by = worldTriangles[t*9+4]!, bz = worldTriangles[t*9+5]!
    const cx = worldTriangles[t*9+6]!, cy = worldTriangles[t*9+7]!, cz = worldTriangles[t*9+8]!
    const e1x = bx-ax, e1y = by-ay, e1z = bz-az
    const e2x = cx-ax, e2y = cy-ay, e2z = cz-az
    const nrmX = e1y*e2z - e1z*e2y
    const nrmY = e1z*e2x - e1x*e2z
    const nrmZ = e1x*e2y - e1y*e2x
    const area = Math.sqrt(nrmX*nrmX + nrmY*nrmY + nrmZ*nrmZ) / 2
    totalArea += area
    tris.push({
      cx: (ax+bx+cx)/3, cy: (ay+by+cy)/3, cz: (az+bz+cz)/3,
      area,
      pos: [ax,ay,az, bx,by,bz, cx,cy,cz],
    })
  }

  const avgEdge = Math.sqrt(totalArea / triCount) * 1.4
  const threshold = avgEdge * thresholdMultiplier

  const assignment = spatialComponents(tris, threshold)
  let numComponents = 0
  for (let i = 0; i < assignment.length; i++) {
    const a = assignment[i]!
    if (a + 1 > numComponents) numComponents = a + 1
  }

  if (numComponents <= 1) return [worldTriangles]

  const buckets: number[][] = Array.from({ length: numComponents }, () => [])
  for (let i = 0; i < tris.length; i++) {
    buckets[assignment[i]!]!.push(...tris[i]!.pos)
  }
  return buckets
    .filter(b => b.length > 0)
    .map(b => new Float32Array(b))
}
