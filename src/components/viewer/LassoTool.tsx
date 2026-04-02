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
    lassoDrawingComplete, lassoPath, surfaces,
    setLassoSelectedIds, setLassoDrawingComplete,
  } = useViewer()

  useEffect(() => {
    if (!lassoDrawingComplete || lassoPath.length < 3) {
      if (lassoDrawingComplete) setLassoDrawingComplete(false)
      return
    }

    const rect = gl.domElement.getBoundingClientRect()

    const selected = surfaces.filter(s => {
      if (!s.visible || !s.worldTriangles || s.worldTriangles.length === 0) return false

      const wt = s.worldTriangles
      let cx = 0, cy = 0, cz = 0
      const n = wt.length / 3
      for (let i = 0; i < wt.length; i += 3) {
        cx += wt[i]; cy += wt[i + 1]; cz += wt[i + 2]
      }
      cx /= n; cy /= n; cz /= n

      const ndc = new THREE.Vector3(cx, cy, cz).project(camera)
      const sx = (ndc.x + 1) / 2 * rect.width + rect.left
      const sy = (1 - ndc.y) / 2 * rect.height + rect.top

      if (ndc.z > 1) return false

      return pointInPolygon({ x: sx, y: sy }, lassoPath)
    })

    setLassoSelectedIds(selected.map(s => s.id))
    setLassoDrawingComplete(false)
  }, [lassoDrawingComplete]) // intentionally minimal deps — snapshot approach

  return null
}
