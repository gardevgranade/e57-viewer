export interface DetectedSurface {
  id: string
  label: string
  color: string
  visible: boolean
  normalY: number
  centroidY: number
  pointCount: number
  pointIndices: number[]
  /** Exact area in m² (mesh surfaces only) */
  area?: number
  /** World-space triangle positions flat array [x,y,z, ...] (mesh surfaces only) */
  worldTriangles?: Float32Array
}

const SURFACE_COLORS = [
  '#ef4444', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#10b981', '#ec4899', '#14b8a6', '#f97316',
]

export function detectSurfaces(
  worldPos: Float32Array,
  count: number,
): DetectedSurface[] {
  if (count < 3) return []

  // Compute bounding span and adaptive threshold
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < count; i++) {
    const x = worldPos[i * 3]!
    const y = worldPos[i * 3 + 1]!
    const z = worldPos[i * 3 + 2]!
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
  const threshold = span * 0.005

  // Subsample: pick indices at stride
  const stride = Math.max(1, Math.ceil(count / 50_000))
  let pool: number[] = []
  for (let i = 0; i < count; i += stride) pool.push(i)

  interface PlaneResult {
    nx: number; ny: number; nz: number; d: number
    inliers: number[]
  }

  const foundPlanes: PlaneResult[] = []

  for (;;) {
    if (pool.length < 15) break

    let bestPlane: PlaneResult | null = null
    let bestCount = 0

    for (let iter = 0; iter < 150; iter++) {
      // Pick 3 random indices from pool
      const i0 = pool[Math.floor(Math.random() * pool.length)]!
      let i1 = pool[Math.floor(Math.random() * pool.length)]!
      let i2 = pool[Math.floor(Math.random() * pool.length)]!
      if (i1 === i0) i1 = pool[(pool.indexOf(i0) + 1) % pool.length]!
      if (i2 === i0 || i2 === i1) i2 = pool[(pool.indexOf(i1) + 1) % pool.length]!

      const ax = worldPos[i0 * 3]!, ay = worldPos[i0 * 3 + 1]!, az = worldPos[i0 * 3 + 2]!
      const bx = worldPos[i1 * 3]!, by = worldPos[i1 * 3 + 1]!, bz = worldPos[i1 * 3 + 2]!
      const cx = worldPos[i2 * 3]!, cy = worldPos[i2 * 3 + 1]!, cz = worldPos[i2 * 3 + 2]!

      // (B-A) x (C-A)
      const abx = bx - ax, aby = by - ay, abz = bz - az
      const acx = cx - ax, acy = cy - ay, acz = cz - az
      let nx = aby * acz - abz * acy
      let ny = abz * acx - abx * acz
      let nz = abx * acy - aby * acx
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
      if (len < 1e-10) continue
      nx /= len; ny /= len; nz /= len
      const d = -(nx * ax + ny * ay + nz * az)

      // Count inliers
      const inliers: number[] = []
      for (const idx of pool) {
        const px = worldPos[idx * 3]!, py = worldPos[idx * 3 + 1]!, pz = worldPos[idx * 3 + 2]!
        if (Math.abs(nx * px + ny * py + nz * pz + d) < threshold) {
          inliers.push(idx)
        }
      }

      if (inliers.length > bestCount) {
        bestCount = inliers.length
        bestPlane = { nx, ny, nz, d, inliers }
      }

      // Early exit if > 40% of pool are inliers
      if (bestCount > pool.length * 0.4) break
    }

    if (!bestPlane || bestPlane.inliers.length < 15) break

    foundPlanes.push(bestPlane)

    // Remove inliers from pool
    const inlierSet = new Set(bestPlane.inliers)
    pool = pool.filter(i => !inlierSet.has(i))
  }

  if (foundPlanes.length === 0) return []

  // Classify ALL original points to nearest plane (within threshold * 2.5)
  const expandedThreshold = threshold * 2.5
  const assignment = new Int32Array(count).fill(-1)
  for (let i = 0; i < count; i++) {
    const px = worldPos[i * 3]!, py = worldPos[i * 3 + 1]!, pz = worldPos[i * 3 + 2]!
    let bestDist = expandedThreshold
    let bestPlaneIdx = -1
    for (let pi = 0; pi < foundPlanes.length; pi++) {
      const plane = foundPlanes[pi]!
      const dist = Math.abs(plane.nx * px + plane.ny * py + plane.nz * pz + plane.d)
      if (dist < bestDist) {
        bestDist = dist
        bestPlaneIdx = pi
      }
    }
    assignment[i] = bestPlaneIdx
  }

  // Collect point indices per plane and compute centroid Y
  const planePoints: number[][] = foundPlanes.map(() => [])
  for (let i = 0; i < count; i++) {
    const pi = assignment[i]
    if (pi >= 0) planePoints[pi]!.push(i)
  }

  // Compute centroid Y per plane
  const centroidYs = foundPlanes.map((_, pi) => {
    const pts = planePoints[pi]!
    if (pts.length === 0) return 0
    let sum = 0
    for (const idx of pts) sum += worldPos[idx * 3 + 1]!
    return sum / pts.length
  })

  const medianCentroidY = [...centroidYs].sort((a, b) => a - b)[Math.floor(centroidYs.length / 2)]!

  // Build surfaces with labels
  const labelCounts: Record<string, number> = {}
  const surfaces: DetectedSurface[] = foundPlanes.map((plane, pi) => {
    const pts = planePoints[pi]!
    const centroidY = centroidYs[pi]!
    const normalY = plane.ny

    let baseLabel: string
    if (Math.abs(normalY) > 0.65) {
      baseLabel = centroidY > medianCentroidY ? 'Roof' : 'Floor'
    } else {
      baseLabel = 'Wall'
    }

    labelCounts[baseLabel] = (labelCounts[baseLabel] ?? 0) + 1

    return {
      id: `surface-${pi}`,
      label: baseLabel, // will fix duplicates below
      color: SURFACE_COLORS[pi % SURFACE_COLORS.length]!,
      visible: true,
      normalY,
      centroidY,
      pointCount: pts.length,
      pointIndices: pts,
    }
  })

  // Fix duplicate labels
  const seen: Record<string, number> = {}
  for (const surf of surfaces) {
    const count = labelCounts[surf.label]!
    if (count > 1) {
      seen[surf.label] = (seen[surf.label] ?? 0) + 1
      surf.label = `${surf.label} ${seen[surf.label]}`
    }
  }

  // Sort by pointCount descending
  surfaces.sort((a, b) => b.pointCount - a.pointCount)

  return surfaces
}
