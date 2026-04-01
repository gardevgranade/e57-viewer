import * as THREE from 'three'
import type { DetectedSurface } from './surfaceDetect.js'
import { buildAdjacency, edgeKey } from './meshPicker.js'

const SURFACE_COLORS = [
  '#ef4444', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#10b981', '#ec4899', '#14b8a6', '#f97316',
]

const COS_THRESHOLD = Math.cos((20 * Math.PI) / 180) // ~0.940

interface Candidate {
  area: number
  normalY: number
  centroidY: number
  triPositions: number[]
  triCount: number
}

export function detectMeshSurfaces(
  root: THREE.Object3D,
  numSurfaces: number,
): DetectedSurface[] {
  const candidates: Candidate[] = []

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const geo = child.geometry as THREE.BufferGeometry
    if (!geo) return
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!posAttr) return

    const mat = child.matrixWorld
    const index = geo.index
    const getVI = index ? (i: number) => index.getX(i) : (i: number) => i
    const triCount = index ? index.count / 3 : posAttr.count / 3
    if (triCount === 0) return

    // Build / retrieve edge adjacency
    const adj = buildAdjacency(geo)

    // Compute local (object-space) normal per triangle
    const localNormals: THREE.Vector3[] = new Array(triCount)
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3()
    for (let t = 0; t < triCount; t++) {
      _a.fromBufferAttribute(posAttr, getVI(t * 3))
      _b.fromBufferAttribute(posAttr, getVI(t * 3 + 1))
      _c.fromBufferAttribute(posAttr, getVI(t * 3 + 2))
      localNormals[t] = new THREE.Vector3()
        .crossVectors(_b.clone().sub(_a), _c.clone().sub(_a))
        .normalize()
    }

    // Step 1 — cluster triangles by normal similarity
    interface Cluster { normalSum: THREE.Vector3; tris: number[] }
    const clusters: Cluster[] = []
    for (let t = 0; t < triCount; t++) {
      const n = localNormals[t]!
      let best: Cluster | null = null
      let bestDot = COS_THRESHOLD
      for (const cl of clusters) {
        const dot = n.dot(cl.normalSum.clone().normalize())
        if (dot > bestDot) { bestDot = dot; best = cl }
      }
      if (best) {
        best.normalSum.add(n)
        best.tris.push(t)
      } else {
        clusters.push({ normalSum: n.clone(), tris: [t] })
      }
    }

    // Step 2 — within each normal cluster, split into connected components
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mat)

    for (const cluster of clusters) {
      const clWorldNormal = cluster.normalSum.clone()
        .normalize()
        .applyMatrix3(normalMatrix)
        .normalize()

      const unvisited = new Set(cluster.tris)

      while (unvisited.size > 0) {
        // BFS from an arbitrary unvisited triangle in this cluster
        const start = unvisited.values().next().value!
        unvisited.delete(start)
        const component: number[] = [start]
        const queue: number[] = [start]

        while (queue.length > 0) {
          const t = queue.pop()!
          const i0 = getVI(t * 3), i1 = getVI(t * 3 + 1), i2 = getVI(t * 3 + 2)
          for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as [number, number][]) {
            const neighbors = adj.get(edgeKey(a, b))
            if (!neighbors) continue
            for (const nb of neighbors) {
              if (!unvisited.has(nb)) continue
              unvisited.delete(nb)
              component.push(nb)
              queue.push(nb)
            }
          }
        }

        // Compute world-space area, centroid, triangle positions
        let area = 0, centroidYAccum = 0
        const triPositions: number[] = []
        const wA = new THREE.Vector3(), wB = new THREE.Vector3(), wC = new THREE.Vector3()
        const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), cross = new THREE.Vector3()

        for (const t of component) {
          wA.fromBufferAttribute(posAttr, getVI(t * 3)).applyMatrix4(mat)
          wB.fromBufferAttribute(posAttr, getVI(t * 3 + 1)).applyMatrix4(mat)
          wC.fromBufferAttribute(posAttr, getVI(t * 3 + 2)).applyMatrix4(mat)

          e1.subVectors(wB, wA)
          e2.subVectors(wC, wA)
          cross.crossVectors(e1, e2)
          const triArea = cross.length() * 0.5
          area += triArea
          centroidYAccum += ((wA.y + wB.y + wC.y) / 3) * triArea

          triPositions.push(
            wA.x, wA.y, wA.z,
            wB.x, wB.y, wB.z,
            wC.x, wC.y, wC.z,
          )
        }

        if (area < 1e-10) continue

        candidates.push({
          area,
          normalY: clWorldNormal.y,
          centroidY: centroidYAccum / area,
          triPositions,
          triCount: component.length,
        })
      }
    }
  })

  if (candidates.length === 0) return []

  // Sort by area descending, take top N
  candidates.sort((a, b) => b.area - a.area)
  const top = candidates.slice(0, numSurfaces)

  const centroidYs = top.map(c => c.centroidY)
  const sorted = [...centroidYs].sort((a, b) => a - b)
  const medianY = sorted[Math.floor(sorted.length / 2)] ?? 0

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
      area: c.area,
      worldTriangles: new Float32Array(c.triPositions),
    }
  })

  // Disambiguate duplicate labels
  const seen: Record<string, number> = {}
  for (const s of results) {
    if ((labelCounts[s.label] ?? 0) > 1) {
      seen[s.label] = (seen[s.label] ?? 0) + 1
      s.label = `${s.label} ${seen[s.label]}`
    }
  }

  return results
}
