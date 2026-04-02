'use client'

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useViewer } from '../../lib/viewerState.js'

function pointInPolygon(pt: { x: number; y: number }, poly: Array<{ x: number; y: number }>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi))
      inside = !inside
  }
  return inside
}

export default function LassoTool() {
  const { camera, gl } = useThree()
  const {
    lassoDrawingComplete, lassoPath, lassoTriangleMode, surfaces,
    setLassoSelectedIds, setLassoSelectedTriangles, setLassoDrawingComplete,
  } = useViewer()

  useEffect(() => {
    if (!lassoDrawingComplete || lassoPath.length < 3) {
      if (lassoDrawingComplete) setLassoDrawingComplete(false)
      return
    }

    const rect = gl.domElement.getBoundingClientRect()

    function project(wx: number, wy: number, wz: number) {
      const ndc = new THREE.Vector3(wx, wy, wz).project(camera)
      return {
        x: (ndc.x + 1) / 2 * rect.width + rect.left,
        y: (1 - ndc.y) / 2 * rect.height + rect.top,
        behind: ndc.z > 1,
      }
    }

    if (lassoTriangleMode) {
      // Triangle mode: collect per-triangle centroid hits
      const result: Array<{ surfaceId: string; triangleIndices: number[] }> = []
      for (const s of surfaces) {
        if (!s.visible || !s.worldTriangles || s.worldTriangles.length === 0) continue
        const wt = s.worldTriangles
        const triCount = Math.floor(wt.length / 9)
        const selected: number[] = []
        for (let i = 0; i < triCount; i++) {
          const cx = (wt[i * 9] + wt[i * 9 + 3] + wt[i * 9 + 6]) / 3
          const cy = (wt[i * 9 + 1] + wt[i * 9 + 4] + wt[i * 9 + 7]) / 3
          const cz = (wt[i * 9 + 2] + wt[i * 9 + 5] + wt[i * 9 + 8]) / 3
          const { x, y, behind } = project(cx, cy, cz)
          if (!behind && pointInPolygon({ x, y }, lassoPath)) selected.push(i)
        }
        if (selected.length > 0) result.push({ surfaceId: s.id, triangleIndices: selected })
      }
      setLassoSelectedTriangles(result)
    } else {
      // Surface mode: select whole surfaces by centroid
      const selected = surfaces.filter(s => {
        if (!s.visible || !s.worldTriangles || s.worldTriangles.length === 0) return false
        const wt = s.worldTriangles
        let cx = 0, cy = 0, cz = 0
        const n = wt.length / 3
        for (let i = 0; i < wt.length; i += 3) {
          cx += wt[i]; cy += wt[i + 1]; cz += wt[i + 2]
        }
        cx /= n; cy /= n; cz /= n
        const { x, y, behind } = project(cx, cy, cz)
        if (behind) return false
        return pointInPolygon({ x, y }, lassoPath)
      })
      setLassoSelectedIds(selected.map(s => s.id))
    }

    setLassoDrawingComplete(false)
  }, [lassoDrawingComplete, lassoTriangleMode]) // snapshot — reads surfaces/path at trigger time

  return null
}
