/**
 * Extract the ordered boundary polygon of a triangulated surface.
 *
 * Boundary edges are edges that appear only once across all triangles.
 * We then stitch them into an ordered loop by walking vertex adjacency.
 * If multiple loops exist (holes), we return the longest one.
 *
 * Returns null if fewer than 3 boundary vertices are found.
 */
export function extractBoundaryPolygon(
  worldTriangles: Float32Array,
): Array<{ x: number; y: number; z: number }> | null {
  const triCount = Math.floor(worldTriangles.length / 9)
  if (triCount < 1) return null

  const PREC = 5
  function vkey(x: number, y: number, z: number) {
    return `${x.toFixed(PREC)},${y.toFixed(PREC)},${z.toFixed(PREC)}`
  }

  type V3 = { x: number; y: number; z: number }

  // Count how many triangles share each edge
  const edgeCount = new Map<string, number>()
  const edgeVerts = new Map<string, [V3, V3]>()

  for (let t = 0; t < triCount; t++) {
    const vs: V3[] = [
      { x: worldTriangles[t*9]!,   y: worldTriangles[t*9+1]!,  z: worldTriangles[t*9+2]! },
      { x: worldTriangles[t*9+3]!, y: worldTriangles[t*9+4]!,  z: worldTriangles[t*9+5]! },
      { x: worldTriangles[t*9+6]!, y: worldTriangles[t*9+7]!,  z: worldTriangles[t*9+8]! },
    ]
    for (let e = 0; e < 3; e++) {
      const a = vs[e]!
      const b = vs[(e + 1) % 3]!
      const ka = vkey(a.x, a.y, a.z)
      const kb = vkey(b.x, b.y, b.z)
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1)
      if (!edgeVerts.has(key)) edgeVerts.set(key, [a, b])
    }
  }

  // Build vertex adjacency from boundary edges (count === 1)
  const adj = new Map<string, { key: string; pos: V3 }[]>()
  const vpos = new Map<string, V3>()

  for (const [key, count] of edgeCount) {
    if (count !== 1) continue
    const [a, b] = edgeVerts.get(key)!
    const ka = vkey(a.x, a.y, a.z)
    const kb = vkey(b.x, b.y, b.z)
    vpos.set(ka, a)
    vpos.set(kb, b)
    if (!adj.has(ka)) adj.set(ka, [])
    if (!adj.has(kb)) adj.set(kb, [])
    adj.get(ka)!.push({ key: kb, pos: b })
    adj.get(kb)!.push({ key: ka, pos: a })
  }

  if (adj.size < 3) return null

  // Walk all loops, return the longest
  const allVisited = new Set<string>()
  let longestLoop: V3[] = []

  for (const startKey of adj.keys()) {
    if (allVisited.has(startKey)) continue

    const visited = new Set<string>()
    const loop: V3[] = []
    let curKey = startKey

    while (!visited.has(curKey)) {
      visited.add(curKey)
      loop.push(vpos.get(curKey)!)
      const neighbors = adj.get(curKey) ?? []
      const next = neighbors.find(n => !visited.has(n.key))
      if (!next) break
      curKey = next.key
    }

    for (const k of visited) allVisited.add(k)
    if (loop.length > longestLoop.length) longestLoop = loop
  }

  return longestLoop.length >= 3 ? longestLoop : null
}
