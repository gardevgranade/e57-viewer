import * as THREE from 'three'
import type { DetectedSurface } from './surfaceDetect.js'

const SURFACE_COLORS = [
  '#ef4444', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#10b981', '#ec4899', '#14b8a6', '#f97316',
]

const NORMAL_DOT_THRESHOLD = Math.cos((20 * Math.PI) / 180) // ≈ 0.940

interface Cluster {
  nx: number; ny: number; nz: number   // running avg normal (not normalized yet)
  totalArea: number
  sumCx: number; sumCy: number; sumCz: number  // centroid accumulator
  triCount: number
  triPositions: number[]  // flat [x,y,z, x,y,z, x,y,z, ...]
}

export function detectMeshSurfaces(
  root: THREE.Object3D,
  numSurfaces: number,
): DetectedSurface[] {
  const clusters: Cluster[] = []

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
    const edge1 = new THREE.Vector3(), edge2 = new THREE.Vector3()
    const normal = new THREE.Vector3()

    for (let t = 0; t < triCount; t++) {
      let ia: number, ib: number, ic: number
      if (index) {
        ia = index.getX(t * 3)
        ib = index.getX(t * 3 + 1)
        ic = index.getX(t * 3 + 2)
      } else {
        ia = t * 3; ib = t * 3 + 1; ic = t * 3 + 2
      }

      va.fromBufferAttribute(posAttr, ia).applyMatrix4(mat)
      vb.fromBufferAttribute(posAttr, ib).applyMatrix4(mat)
      vc.fromBufferAttribute(posAttr, ic).applyMatrix4(mat)

      edge1.subVectors(vb, va)
      edge2.subVectors(vc, va)
      normal.crossVectors(edge1, edge2)

      const area = normal.length() / 2
      if (area < 1e-12) continue
      normal.normalize()

      const cx = (va.x + vb.x + vc.x) / 3
      const cy = (va.y + vb.y + vc.y) / 3
      const cz = (va.z + vb.z + vc.z) / 3

      // Find best matching cluster
      let bestCluster: Cluster | null = null
      let bestDot = NORMAL_DOT_THRESHOLD
      for (const cl of clusters) {
        const len = Math.sqrt(cl.nx * cl.nx + cl.ny * cl.ny + cl.nz * cl.nz)
        if (len < 1e-10) continue
        const dot = (normal.x * cl.nx + normal.y * cl.ny + normal.z * cl.nz) / len
        if (dot > bestDot) { bestDot = dot; bestCluster = cl }
      }

      if (bestCluster) {
        bestCluster.nx += normal.x
        bestCluster.ny += normal.y
        bestCluster.nz += normal.z
        bestCluster.totalArea += area
        bestCluster.sumCx += cx * area
        bestCluster.sumCy += cy * area
        bestCluster.sumCz += cz * area
        bestCluster.triCount++
        bestCluster.triPositions.push(
          va.x, va.y, va.z,
          vb.x, vb.y, vb.z,
          vc.x, vc.y, vc.z,
        )
      } else {
        clusters.push({
          nx: normal.x, ny: normal.y, nz: normal.z,
          totalArea: area,
          sumCx: cx * area, sumCy: cy * area, sumCz: cz * area,
          triCount: 1,
          triPositions: [va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z],
        })
      }
    }
  })

  if (clusters.length === 0) return []

  // Sort by area, keep top N
  clusters.sort((a, b) => b.totalArea - a.totalArea)
  const top = clusters.slice(0, numSurfaces)

  const centroidYs = top.map(cl => cl.sumCy / cl.totalArea)
  const sorted = [...centroidYs].sort((a, b) => a - b)
  const medianY = sorted[Math.floor(sorted.length / 2)] ?? 0

  const labelCounts: Record<string, number> = {}
  const results: DetectedSurface[] = top.map((cl, i) => {
    const len = Math.sqrt(cl.nx * cl.nx + cl.ny * cl.ny + cl.nz * cl.nz) || 1
    const normalY = cl.ny / len
    const centroidY = cl.sumCy / cl.totalArea

    let base: string
    if (Math.abs(normalY) > 0.65) {
      base = centroidY >= medianY ? 'Roof' : 'Floor'
    } else {
      base = 'Wall'
    }
    labelCounts[base] = (labelCounts[base] ?? 0) + 1

    return {
      id: `mesh-surface-${i}`,
      label: base,
      color: SURFACE_COLORS[i % SURFACE_COLORS.length]!,
      visible: true,
      normalY,
      centroidY,
      pointCount: cl.triCount,
      pointIndices: [],
      area: cl.totalArea,
      worldTriangles: new Float32Array(cl.triPositions),
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
