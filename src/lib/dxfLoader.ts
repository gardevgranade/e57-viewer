import * as THREE from 'three'
import DxfParser from 'dxf-parser'

/**
 * Parse a DXF string and return a Three.js Group containing all entities.
 * Resolves INSERT block references with position/rotation/scale.
 */
export function parseDxfToThree(dxfText: string): THREE.Group {
  const parser = new DxfParser()
  const dxf = parser.parseSync(dxfText)
  if (!dxf) throw new Error('Failed to parse DXF file')

  // Diagnostic: log entity type counts
  if (dxf.entities) {
    const counts = new Map<string, number>()
    for (const e of dxf.entities) {
      counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
    }
    console.log('[DXF] Entity types:', Object.fromEntries(counts))
    console.log('[DXF] Total entities:', dxf.entities.length)
    if (dxf.blocks) {
      console.log('[DXF] Blocks:', Object.keys(dxf.blocks).join(', '))
    }
  }

  const root = new THREE.Group()

  // Collect layer colors
  const layerColors = new Map<string, number>()
  if (dxf.tables?.layer?.layers) {
    for (const [name, layer] of Object.entries(dxf.tables.layer.layers)) {
      if ((layer as any).color != null) {
        layerColors.set(name, aciToHex((layer as any).color))
      }
    }
  }

  // Collect block definitions
  const blocks = new Map<string, any[]>()
  if (dxf.blocks) {
    for (const [name, block] of Object.entries(dxf.blocks)) {
      const b = block as any
      if (b.entities && b.entities.length > 0) {
        blocks.set(name, b.entities)
      }
    }
  }

  function getColor(entity: any): number {
    if (entity.color != null && entity.color !== 256 && entity.color !== 0) {
      return aciToHex(entity.color)
    }
    if (entity.layer && layerColors.has(entity.layer)) return layerColors.get(entity.layer)!
    return DEFAULT_LINE_COLOR
  }

  // Batched geometry collectors
  const linesByColor = new Map<number, number[]>()
  const facesByColor = new Map<number, number[]>()

  function addLineSeg(color: number, pts: THREE.Vector3[]) {
    if (pts.length < 2) return
    if (!linesByColor.has(color)) linesByColor.set(color, [])
    const arr = linesByColor.get(color)!
    for (let i = 0; i < pts.length - 1; i++) {
      arr.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z)
    }
  }

  function addFaceTri(color: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
    if (!facesByColor.has(color)) facesByColor.set(color, [])
    const arr = facesByColor.get(color)!
    arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }

  /** Process a list of entities, optionally applying a transform (for INSERT blocks). */
  function processEntities(entities: any[], transform?: THREE.Matrix4, depth = 0) {
    if (depth > 10) return // prevent infinite block recursion

    for (const entity of entities) {
      const color = getColor(entity)

      switch (entity.type) {
        case 'LINE': {
          const e = entity as any
          if (e.vertices && e.vertices.length >= 2) {
            const pts = e.vertices.map((v: any) => toVec3(v))
            if (transform) pts.forEach((p: THREE.Vector3) => p.applyMatrix4(transform))
            // Skip degenerate lines
            if (pts.length === 2 && pts[0].distanceTo(pts[1]) < 1e-6) break
            addLineSeg(color, pts)
          }
          break
        }

        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const e = entity as any
          const verts = e.vertices
          if (verts && verts.length >= 2) {
            const pts = verts.map((v: any) => toVec3(v))
            if (e.shape || e.closed) pts.push(pts[0].clone())
            if (transform) pts.forEach((p: THREE.Vector3) => p.applyMatrix4(transform))
            addLineSeg(color, pts)
          }
          break
        }

        case 'CIRCLE': {
          const e = entity as any
          const cx = e.center?.x ?? 0, cy = e.center?.y ?? 0, cz = e.center?.z ?? 0
          const r = e.radius ?? 1
          if (r < 1e-8) break
          const curve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2, false, 0)
          const pts = curve.getPoints(64).map(p => new THREE.Vector3(p.x + cx, p.y + cy, cz))
          pts.push(pts[0].clone())
          if (transform) pts.forEach(p => p.applyMatrix4(transform))
          addLineSeg(color, pts)
          break
        }

        case 'ARC': {
          const e = entity as any
          const cx = e.center?.x ?? 0, cy = e.center?.y ?? 0, cz = e.center?.z ?? 0
          const r = e.radius ?? 1
          if (r < 1e-8) break
          const sa = ((e.startAngle ?? 0) * Math.PI) / 180
          const ea = ((e.endAngle ?? 360) * Math.PI) / 180
          const curve = new THREE.EllipseCurve(0, 0, r, r, sa, ea, false, 0)
          const pts = curve.getPoints(64).map(p => new THREE.Vector3(p.x + cx, p.y + cy, cz))
          if (transform) pts.forEach(p => p.applyMatrix4(transform))
          addLineSeg(color, pts)
          break
        }

        case 'ELLIPSE': {
          const e = entity as any
          const cx = e.center?.x ?? 0, cy = e.center?.y ?? 0, cz = e.center?.z ?? 0
          const mx = e.majorAxisEndPoint?.x ?? 1, my = e.majorAxisEndPoint?.y ?? 0
          const ratio = e.axisRatio ?? 1
          const majorR = Math.sqrt(mx * mx + my * my)
          if (majorR < 1e-8) break
          const minorR = majorR * ratio
          const rotation = Math.atan2(my, mx)
          const sa = e.startAngle ?? 0
          const ea = e.endAngle ?? Math.PI * 2
          const curve = new THREE.EllipseCurve(0, 0, majorR, minorR, sa, ea, false, rotation)
          const pts = curve.getPoints(64).map(p => new THREE.Vector3(p.x + cx, p.y + cy, cz))
          if (transform) pts.forEach(p => p.applyMatrix4(transform))
          addLineSeg(color, pts)
          break
        }

        case '3DFACE': {
          const e = entity as any
          const verts = e.vertices
          if (verts && verts.length >= 3) {
            const v = verts.map((vt: any) => toVec3(vt))
            if (transform) v.forEach((p: THREE.Vector3) => p.applyMatrix4(transform))
            addFaceTri(color, v[0], v[1], v[2])
            if (verts.length >= 4) addFaceTri(color, v[0], v[2], v[3])
          }
          break
        }

        case 'SOLID': {
          const e = entity as any
          const pts = e.points
          if (pts && pts.length >= 3) {
            const v = pts.map((vt: any) => toVec3(vt))
            if (transform) v.forEach((p: THREE.Vector3) => p.applyMatrix4(transform))
            addFaceTri(color, v[0], v[1], v[2])
            if (pts.length >= 4) addFaceTri(color, v[0], v[2], v[3])
          }
          break
        }

        case 'POINT': {
          const e = entity as any
          const p = new THREE.Vector3(e.position?.x ?? 0, e.position?.y ?? 0, e.position?.z ?? 0)
          if (transform) p.applyMatrix4(transform)
          const geo = new THREE.BufferGeometry().setFromPoints([p])
          root.add(new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.05 })))
          break
        }

        case 'SPLINE': {
          const e = entity as any
          if (e.controlPoints && e.controlPoints.length >= 2) {
            const pts = e.controlPoints.map((v: any) => toVec3(v))
            if (transform) pts.forEach((p: THREE.Vector3) => p.applyMatrix4(transform))
            if (pts.length >= 4) {
              const curve = new THREE.CatmullRomCurve3(pts)
              const linePoints = curve.getPoints(pts.length * 10)
              addLineSeg(color, linePoints)
            } else {
              addLineSeg(color, pts)
            }
          }
          break
        }

        case 'INSERT': {
          const e = entity as any
          const blockName = e.name
          const blockEntities = blocks.get(blockName)
          if (!blockEntities) break

          // Build transform matrix for this INSERT
          const mat = new THREE.Matrix4()
          const pos = new THREE.Vector3(e.position?.x ?? 0, e.position?.y ?? 0, e.position?.z ?? 0)
          const sx = e.xScale ?? 1, sy = e.yScale ?? 1, sz = e.zScale ?? 1
          const rotDeg = e.rotation ?? 0
          const rotRad = (rotDeg * Math.PI) / 180

          mat.makeTranslation(pos.x, pos.y, pos.z)
          if (rotRad !== 0) {
            const rm = new THREE.Matrix4().makeRotationZ(rotRad)
            mat.multiply(rm)
          }
          if (sx !== 1 || sy !== 1 || sz !== 1) {
            mat.multiply(new THREE.Matrix4().makeScale(sx, sy, sz))
          }

          // Compose with parent transform
          const combined = transform ? new THREE.Matrix4().copy(transform).multiply(mat) : mat
          processEntities(blockEntities, combined, depth + 1)
          break
        }

        default:
          break
      }
    }
  }

  if (dxf.entities) {
    processEntities(dxf.entities)
  }

  // Post-process: detect and remove "origin fan" lines
  // If many line segments share a common endpoint far from the centroid, remove them
  for (const [color, verts] of linesByColor) {
    const filtered = filterOriginFan(verts)
    linesByColor.set(color, filtered)
  }

  // Build batched line geometry (LineSegments for performance)
  for (const [color, verts] of linesByColor) {
    if (verts.length === 0) continue
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    root.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color })))
  }

  // Build batched face geometry
  for (const [color, verts] of facesByColor) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.computeVertexNormals()
    root.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide, shininess: 20 })))
  }

  return root
}

function toVec3(v: any): THREE.Vector3 {
  return new THREE.Vector3(v.x ?? 0, v.y ?? 0, v.z ?? 0)
}

// Bright default for dark backgrounds
const DEFAULT_LINE_COLOR = 0x8cb4d4

/**
 * Detect and remove "origin fan" artifacts.
 * When many line segments share a common endpoint (within a small tolerance),
 * and those segments are much longer than the median segment, remove them.
 * verts is a flat array: [x1,y1,z1, x2,y2,z2, x1,y1,z1, x2,y2,z2, ...]
 */
function filterOriginFan(verts: number[]): number[] {
  const segCount = verts.length / 6
  if (segCount < 20) return verts // too few lines to have a fan problem

  // Count how often each endpoint appears (quantized to grid)
  const GRID = 0.01
  const endpointCounts = new Map<string, number>()
  const quantize = (x: number) => Math.round(x / GRID) * GRID

  for (let i = 0; i < verts.length; i += 6) {
    const k1 = `${quantize(verts[i])},${quantize(verts[i + 1])},${quantize(verts[i + 2])}`
    const k2 = `${quantize(verts[i + 3])},${quantize(verts[i + 4])},${quantize(verts[i + 5])}`
    endpointCounts.set(k1, (endpointCounts.get(k1) ?? 0) + 1)
    endpointCounts.set(k2, (endpointCounts.get(k2) ?? 0) + 1)
  }

  // Find the most common endpoint
  let maxKey = ''
  let maxCount = 0
  for (const [k, c] of endpointCounts) {
    if (c > maxCount) { maxCount = c; maxKey = k }
  }

  // If a single point is shared by >15% of all segments, it's likely a fan artifact
  const fanThreshold = Math.max(10, segCount * 0.15)
  if (maxCount < fanThreshold) return verts

  // Calculate median segment length for non-fan lines
  const fanParts = maxKey.split(',').map(Number)
  const fanPt = new THREE.Vector3(fanParts[0], fanParts[1], fanParts[2])

  const lengths: number[] = []
  for (let i = 0; i < verts.length; i += 6) {
    const a = new THREE.Vector3(verts[i], verts[i + 1], verts[i + 2])
    const b = new THREE.Vector3(verts[i + 3], verts[i + 4], verts[i + 5])
    lengths.push(a.distanceTo(b))
  }
  lengths.sort((a, b) => a - b)
  const medianLen = lengths[Math.floor(lengths.length / 2)]

  // Remove segments that touch the fan point AND are significantly longer than median
  const longThreshold = medianLen * 3
  const result: number[] = []
  let removed = 0

  for (let i = 0; i < verts.length; i += 6) {
    const a = new THREE.Vector3(verts[i], verts[i + 1], verts[i + 2])
    const b = new THREE.Vector3(verts[i + 3], verts[i + 4], verts[i + 5])
    const len = a.distanceTo(b)

    const touchesFan = a.distanceTo(fanPt) < GRID * 2 || b.distanceTo(fanPt) < GRID * 2
    if (touchesFan && len > longThreshold) {
      removed++
      continue
    }
    result.push(verts[i], verts[i + 1], verts[i + 2], verts[i + 3], verts[i + 4], verts[i + 5])
  }

  if (removed > 0) {
    console.log(`[DXF] Removed ${removed} fan lines converging at (${fanPt.x.toFixed(2)}, ${fanPt.y.toFixed(2)}, ${fanPt.z.toFixed(2)})`)
  }
  return result
}

/**
 * Convert AutoCAD Color Index (ACI) to hex RGB.
 * Remaps dark/black colors to bright alternatives for dark backgrounds.
 */
function aciToHex(aci: number): number {
  const ACI_MAP: Record<number, number> = {
    0: 0x8cb4d4, // ByBlock — bright on dark bg
    1: 0xff4444, // Red
    2: 0xffff44, // Yellow
    3: 0x44ff44, // Green
    4: 0x44ffff, // Cyan
    5: 0x4488ff, // Blue (brighter)
    6: 0xff44ff, // Magenta
    7: 0xe0e0e0, // White/Black → light grey
    8: 0x999999, // Dark grey → medium grey
    9: 0xcccccc, // Light grey
    10: 0xff6666,
    11: 0xffaa66,
    30: 0xff7744,
    40: 0xffaa00,
    50: 0xcccc00,
    70: 0x66cc66,
    90: 0x66cccc,
    110: 0x6688cc,
    130: 0x6666ff,
    150: 0xaa66ff,
    170: 0xcc66cc,
    200: 0xcc9999,
    250: 0xaaaaaa,
  }
  if (ACI_MAP[aci] !== undefined) return ACI_MAP[aci]
  // For unmapped indices, generate a bright pastel from hue
  if (aci >= 10 && aci <= 249) {
    const hue = ((aci - 10) / 240) * 360
    const c = new THREE.Color().setHSL(hue / 360, 0.6, 0.65)
    return c.getHex()
  }
  return DEFAULT_LINE_COLOR
}
