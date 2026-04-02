import * as THREE from 'three'
import DxfParser from 'dxf-parser'

/**
 * Parse a DXF string and return a Three.js Group containing all entities.
 * Supports: LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, 3DFACE, POINT, SPLINE, ELLIPSE, INSERT (as points).
 */
export function parseDxfToThree(dxfText: string): THREE.Group {
  const parser = new DxfParser()
  const dxf = parser.parseSync(dxfText)
  if (!dxf) throw new Error('Failed to parse DXF file')

  const group = new THREE.Group()

  // Collect layer colors
  const layerColors = new Map<string, number>()
  if (dxf.tables?.layer?.layers) {
    for (const [name, layer] of Object.entries(dxf.tables.layer.layers)) {
      if ((layer as any).color != null) {
        layerColors.set(name, aciToHex((layer as any).color))
      }
    }
  }

  function getColor(entity: any): number {
    if (entity.color != null && entity.color !== 256) return aciToHex(entity.color)
    if (entity.layer && layerColors.has(entity.layer)) return layerColors.get(entity.layer)!
    return 0xcccccc
  }

  // 3DFACE triangles — batch by color
  const facesByColor = new Map<number, number[]>()

  if (dxf.entities) {
    for (const entity of dxf.entities) {
      const color = getColor(entity)

      switch (entity.type) {
        case 'LINE': {
          const e = entity as any
          if (e.vertices && e.vertices.length >= 2) {
            const pts = e.vertices.map((v: any) => new THREE.Vector3(v.x ?? 0, v.y ?? 0, v.z ?? 0))
            const geo = new THREE.BufferGeometry().setFromPoints(pts)
            group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })))
          }
          break
        }

        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const e = entity as any
          const verts = e.vertices
          if (verts && verts.length >= 2) {
            const pts = verts.map((v: any) => new THREE.Vector3(v.x ?? 0, v.y ?? 0, v.z ?? 0))
            if (e.shape) pts.push(pts[0].clone())
            const geo = new THREE.BufferGeometry().setFromPoints(pts)
            group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })))
          }
          break
        }

        case 'CIRCLE': {
          const e = entity as any
          const cx = e.center?.x ?? 0, cy = e.center?.y ?? 0, cz = e.center?.z ?? 0
          const r = e.radius ?? 1
          const curve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2, false, 0)
          const pts = curve.getPoints(64)
          const pts3 = pts.map(p => new THREE.Vector3(p.x + cx, p.y + cy, cz))
          pts3.push(pts3[0].clone())
          const geo = new THREE.BufferGeometry().setFromPoints(pts3)
          group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })))
          break
        }

        case 'ARC': {
          const e = entity as any
          const cx = e.center?.x ?? 0, cy = e.center?.y ?? 0, cz = e.center?.z ?? 0
          const r = e.radius ?? 1
          const sa = ((e.startAngle ?? 0) * Math.PI) / 180
          const ea = ((e.endAngle ?? 360) * Math.PI) / 180
          const curve = new THREE.EllipseCurve(0, 0, r, r, sa, ea, false, 0)
          const pts = curve.getPoints(64)
          const pts3 = pts.map(p => new THREE.Vector3(p.x + cx, p.y + cy, cz))
          const geo = new THREE.BufferGeometry().setFromPoints(pts3)
          group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })))
          break
        }

        case 'ELLIPSE': {
          const e = entity as any
          const cx = e.center?.x ?? 0, cy = e.center?.y ?? 0, cz = e.center?.z ?? 0
          const mx = e.majorAxisEndPoint?.x ?? 1, my = e.majorAxisEndPoint?.y ?? 0
          const ratio = e.axisRatio ?? 1
          const majorR = Math.sqrt(mx * mx + my * my)
          const minorR = majorR * ratio
          const rotation = Math.atan2(my, mx)
          const sa = e.startAngle ?? 0
          const ea = e.endAngle ?? Math.PI * 2
          const curve = new THREE.EllipseCurve(0, 0, majorR, minorR, sa, ea, false, rotation)
          const pts = curve.getPoints(64)
          const pts3 = pts.map(p => new THREE.Vector3(p.x + cx, p.y + cy, cz))
          const geo = new THREE.BufferGeometry().setFromPoints(pts3)
          group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })))
          break
        }

        case '3DFACE': {
          const e = entity as any
          const verts = e.vertices
          if (verts && verts.length >= 3) {
            if (!facesByColor.has(color)) facesByColor.set(color, [])
            const arr = facesByColor.get(color)!
            // First triangle
            arr.push(
              verts[0].x ?? 0, verts[0].y ?? 0, verts[0].z ?? 0,
              verts[1].x ?? 0, verts[1].y ?? 0, verts[1].z ?? 0,
              verts[2].x ?? 0, verts[2].y ?? 0, verts[2].z ?? 0,
            )
            // Quad → second triangle
            if (verts.length >= 4) {
              arr.push(
                verts[0].x ?? 0, verts[0].y ?? 0, verts[0].z ?? 0,
                verts[2].x ?? 0, verts[2].y ?? 0, verts[2].z ?? 0,
                verts[3].x ?? 0, verts[3].y ?? 0, verts[3].z ?? 0,
              )
            }
          }
          break
        }

        case 'SOLID': {
          const e = entity as any
          const pts = e.points
          if (pts && pts.length >= 3) {
            if (!facesByColor.has(color)) facesByColor.set(color, [])
            const arr = facesByColor.get(color)!
            arr.push(
              pts[0].x ?? 0, pts[0].y ?? 0, pts[0].z ?? 0,
              pts[1].x ?? 0, pts[1].y ?? 0, pts[1].z ?? 0,
              pts[2].x ?? 0, pts[2].y ?? 0, pts[2].z ?? 0,
            )
            if (pts.length >= 4) {
              arr.push(
                pts[0].x ?? 0, pts[0].y ?? 0, pts[0].z ?? 0,
                pts[2].x ?? 0, pts[2].y ?? 0, pts[2].z ?? 0,
                pts[3].x ?? 0, pts[3].y ?? 0, pts[3].z ?? 0,
              )
            }
          }
          break
        }

        case 'POINT': {
          const e = entity as any
          const x = e.position?.x ?? 0, y = e.position?.y ?? 0, z = e.position?.z ?? 0
          const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y, z)])
          group.add(new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.05 })))
          break
        }

        case 'SPLINE': {
          const e = entity as any
          if (e.controlPoints && e.controlPoints.length >= 2) {
            const pts = e.controlPoints.map((v: any) => new THREE.Vector3(v.x ?? 0, v.y ?? 0, v.z ?? 0))
            if (pts.length >= 4) {
              const curve = new THREE.CatmullRomCurve3(pts)
              const linePoints = curve.getPoints(pts.length * 10)
              const geo = new THREE.BufferGeometry().setFromPoints(linePoints)
              group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })))
            } else {
              const geo = new THREE.BufferGeometry().setFromPoints(pts)
              group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })))
            }
          }
          break
        }

        default:
          // Skip unsupported entities (TEXT, MTEXT, DIMENSION, HATCH, etc.)
          break
      }
    }
  }

  // Batch 3DFACE triangles into meshes
  for (const [color, verts] of facesByColor) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.computeVertexNormals()
    const mat = new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide, shininess: 20 })
    group.add(new THREE.Mesh(geo, mat))
  }

  return group
}

/**
 * Convert AutoCAD Color Index (ACI) to hex RGB.
 * Only maps the most common 10 colors; falls back to grey.
 */
function aciToHex(aci: number): number {
  const ACI_MAP: Record<number, number> = {
    0: 0x000000, // ByBlock
    1: 0xff0000, // Red
    2: 0xffff00, // Yellow
    3: 0x00ff00, // Green
    4: 0x00ffff, // Cyan
    5: 0x0000ff, // Blue
    6: 0xff00ff, // Magenta
    7: 0xffffff, // White/Black
    8: 0x808080, // Dark grey
    9: 0xc0c0c0, // Light grey
  }
  return ACI_MAP[aci] ?? 0xcccccc
}
