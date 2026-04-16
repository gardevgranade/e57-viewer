import * as THREE from 'three'

export interface PickedRegion {
  area: number
  worldTriangles: Float32Array
  normal: THREE.Vector3
  centroidY: number
}

// Cache adjacency maps by geometry object to avoid recomputing on every click
const adjacencyCache = new WeakMap<THREE.BufferGeometry, Map<string, number[]>>()

export function edgeKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

export function buildAdjacency(geo: THREE.BufferGeometry): Map<string, number[]> {
  const cached = adjacencyCache.get(geo)
  if (cached) return cached

  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
  const indexAttr = geo.index
  const edgeToTris = new Map<string, number[]>()

  let getVI: (flatIdx: number) => number

  if (indexAttr) {
    getVI = (i) => indexAttr.getX(i)
  } else {
    // Non-indexed geometry: weld coincident positions to find shared edges
    const posMap = new Map<string, number>()
    const vIndices = new Int32Array(posAttr.count)
    let next = 0
    for (let i = 0; i < posAttr.count; i++) {
      const key = `${posAttr.getX(i).toFixed(6)}_${posAttr.getY(i).toFixed(6)}_${posAttr.getZ(i).toFixed(6)}`
      let idx = posMap.get(key)
      if (idx === undefined) { idx = next; next += 1; posMap.set(key, idx) }
      vIndices[i] = idx
    }
    getVI = (i) => vIndices[i] ?? 0
  }

  const triCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3

  for (let t = 0; t < triCount; t++) {
    const i0 = getVI(t * 3)
    const i1 = getVI(t * 3 + 1)
    const i2 = getVI(t * 3 + 2)
    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as [number, number][]) {
      const k = edgeKey(a, b)
      let arr = edgeToTris.get(k)
      if (!arr) { arr = []; edgeToTris.set(k, arr) }
      arr.push(t)
    }
  }

  adjacencyCache.set(geo, edgeToTris)
  return edgeToTris
}

export function pickMeshRegion(
  mesh: THREE.Mesh,
  faceIndex: number,
  angleThresholdDeg = 20,
): PickedRegion {
  const geo = mesh.geometry as THREE.BufferGeometry
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
  const indexAttr = geo.index
  const matrix = mesh.matrixWorld
  const cosThreshold = Math.cos((angleThresholdDeg * Math.PI) / 180)

  const getVI = indexAttr
    ? (i: number) => indexAttr.getX(i)
    : (i: number) => i

  // Reusable vectors for normal computation
  const _a = new THREE.Vector3()
  const _b = new THREE.Vector3()
  const _c = new THREE.Vector3()

  function getTriLocalNormal(t: number): THREE.Vector3 {
    _a.fromBufferAttribute(posAttr, getVI(t * 3))
    _b.fromBufferAttribute(posAttr, getVI(t * 3 + 1))
    _c.fromBufferAttribute(posAttr, getVI(t * 3 + 2))
    return new THREE.Vector3()
      .crossVectors(_b.clone().sub(_a), _c.clone().sub(_a))
      .normalize()
  }

  const adjacency = buildAdjacency(geo)
  const seedNormal = getTriLocalNormal(faceIndex)

  const visited = new Set<number>([faceIndex])
  const queue: number[] = [faceIndex]
  const region: number[] = []

  while (queue.length > 0) {
    const tri = queue.pop()
    if (tri === undefined) break
    region.push(tri)

    const i0 = getVI(tri * 3)
    const i1 = getVI(tri * 3 + 1)
    const i2 = getVI(tri * 3 + 2)

    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as [number, number][]) {
      const neighbors = adjacency.get(edgeKey(a, b))
      if (!neighbors) continue
      for (const n of neighbors) {
        if (visited.has(n)) continue
        visited.add(n)
        if (seedNormal.dot(getTriLocalNormal(n)) > cosThreshold) {
          queue.push(n)
        }
      }
    }
  }

  // Build world-space triangle array and compute area + centroid
  const worldTriangles = new Float32Array(region.length * 9)
  let totalArea = 0
  let centroidYAccum = 0
  const normalAccum = new THREE.Vector3()

  const wA = new THREE.Vector3()
  const wB = new THREE.Vector3()
  const wC = new THREE.Vector3()
  const e1 = new THREE.Vector3()
  const e2 = new THREE.Vector3()
  const cross = new THREE.Vector3()

  for (let k = 0; k < region.length; k++) {
    const t = region[k] ?? 0
    wA.fromBufferAttribute(posAttr, getVI(t * 3)).applyMatrix4(matrix)
    wB.fromBufferAttribute(posAttr, getVI(t * 3 + 1)).applyMatrix4(matrix)
    wC.fromBufferAttribute(posAttr, getVI(t * 3 + 2)).applyMatrix4(matrix)

    const base = k * 9
    worldTriangles[base] = wA.x;     worldTriangles[base + 1] = wA.y; worldTriangles[base + 2] = wA.z
    worldTriangles[base + 3] = wB.x; worldTriangles[base + 4] = wB.y; worldTriangles[base + 5] = wB.z
    worldTriangles[base + 6] = wC.x; worldTriangles[base + 7] = wC.y; worldTriangles[base + 8] = wC.z

    e1.subVectors(wB, wA)
    e2.subVectors(wC, wA)
    cross.crossVectors(e1, e2)
    const triArea = cross.length() * 0.5
    totalArea += triArea

    normalAccum.addScaledVector(cross.clone().normalize(), triArea)
    centroidYAccum += ((wA.y + wB.y + wC.y) / 3) * triArea
  }

  return {
    area: totalArea,
    worldTriangles,
    normal: normalAccum.normalize(),
    centroidY: totalArea > 0 ? centroidYAccum / totalArea : 0,
  }
}
