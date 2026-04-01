import * as THREE from 'three'
import type { DetectedSurface } from './surfaceDetect.js'

const SURFACE_COLORS = [
  '#ef4444', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#10b981', '#ec4899', '#14b8a6', '#f97316',
]

const NORMAL_DOT_THRESHOLD = Math.cos((20 * Math.PI) / 180) // ≈ 0.940

interface TriData {
  cx: number; cy: number; cz: number  // world-space centroid
  area: number
  pos: number[]  // 9 world-space floats [ax,ay,az, bx,by,bz, cx,cy,cz]
}

interface NormalCluster {
  nx: number; ny: number; nz: number  // running average normal (not normalised)
  tris: TriData[]
}

// ── Union-Find ────────────────────────────────────────────────────────────────

function makeUF(n: number) {
  const p = new Int32Array(n)
  for (let i = 0; i < n; i++) p[i] = i
  function find(i: number): number {
    while (p[i] !== i) { p[i] = p[p[i]!]!; i = p[i]! }
    return i
  }
  function union(a: number, b: number) { p[find(a)] = find(b) }
  return { find, union }
}

/**
 * Split a list of triangle centroids into connected components where
 * "connected" = centroid distance ≤ threshold.
 * Returns an array of length n with component IDs (0-based).
 */
function spatialComponents(tris: TriData[], threshold: number): Uint32Array {
  const n = tris.length
  const uf = makeUF(n)
  const t2 = threshold * threshold

  // Sort by X for sweep-line pruning
  const order = Array.from({ length: n }, (_, i) => i)
  order.sort((a, b) => tris[a]!.cx - tris[b]!.cx)

  for (let i = 0; i < n; i++) {
    const ai = order[i]!
    const { cx: ax, cy: ay, cz: az } = tris[ai]!
    for (let j = i + 1; j < n; j++) {
      const bj = order[j]!
      const { cx: bx, cy: by, cz: bz } = tris[bj]!
      const dx = bx - ax
      if (dx * dx > t2) break  // sorted by X, too far → skip rest
      const dy = by - ay, dz = bz - az
      if (dx * dx + dy * dy + dz * dz <= t2) uf.union(ai, bj)
    }
  }

  // Compact component IDs
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

// ── Main export ───────────────────────────────────────────────────────────────

export function detectMeshSurfaces(
  root: THREE.Object3D,
  numSurfaces: number,
): DetectedSurface[] {
  const normalClusters: NormalCluster[] = []

  // Step 1: group triangles by normal direction
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
      const ia = index ? index.getX(t * 3)     : t * 3
      const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1
      const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2

      va.fromBufferAttribute(posAttr, ia).applyMatrix4(mat)
      vb.fromBufferAttribute(posAttr, ib).applyMatrix4(mat)
      vc.fromBufferAttribute(posAttr, ic).applyMatrix4(mat)

      e1.subVectors(vb, va); e2.subVectors(vc, va)
      normal.crossVectors(e1, e2)
      const area = normal.length() / 2
      if (area < 1e-12) continue
      normal.normalize()

      const tri: TriData = {
        cx: (va.x + vb.x + vc.x) / 3,
        cy: (va.y + vb.y + vc.y) / 3,
        cz: (va.z + vb.z + vc.z) / 3,
        area,
        pos: [va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z],
      }

      let best: NormalCluster | null = null
      let bestDot = NORMAL_DOT_THRESHOLD
      for (const cl of normalClusters) {
        const len = Math.sqrt(cl.nx * cl.nx + cl.ny * cl.ny + cl.nz * cl.nz)
        if (len < 1e-10) continue
        const dot = (normal.x * cl.nx + normal.y * cl.ny + normal.z * cl.nz) / len
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

  // Step 2: within each normal cluster, split by spatial proximity
  interface Candidate {
    normalY: number
    totalArea: number
    centroidY: number
    triPositions: number[]
    triCount: number
  }
  const candidates: Candidate[] = []

  for (const cl of normalClusters) {
    if (cl.tris.length === 0) continue

    const len = Math.sqrt(cl.nx * cl.nx + cl.ny * cl.ny + cl.nz * cl.nz) || 1
    const normalY = cl.ny / len

    // Compute cluster bounding box to derive the gap threshold
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    let minZ = Infinity, maxZ = -Infinity
    for (const tri of cl.tris) {
      if (tri.cx < minX) minX = tri.cx; if (tri.cx > maxX) maxX = tri.cx
      if (tri.cy < minY) minY = tri.cy; if (tri.cy > maxY) maxY = tri.cy
      if (tri.cz < minZ) minZ = tri.cz; if (tri.cz > maxZ) maxZ = tri.cz
    }
    const diag = Math.sqrt(
      (maxX - minX) ** 2 + (maxY - minY) ** 2 + (maxZ - minZ) ** 2
    )
    // Threshold = 8% of cluster extent. Keeps small seam gaps together,
    // splits areas that are far apart (different roof slopes, separate walls).
    const threshold = Math.max(diag * 0.08, 0.01)

    const assignment = spatialComponents(cl.tris, threshold)
    const numComponents = Math.max(...Array.from(assignment)) + 1

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
        normalY,
        totalArea,
        centroidY: centroidYAccum / totalArea,
        triPositions,
        triCount: triPositions.length / 9,
      })
    }
  }

  if (candidates.length === 0) return []

  candidates.sort((a, b) => b.totalArea - a.totalArea)
  const top = candidates.slice(0, numSurfaces)

  const centroidYs = top.map(c => c.centroidY)
  const medianY = [...centroidYs].sort((a, b) => a - b)[Math.floor(centroidYs.length / 2)] ?? 0

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
