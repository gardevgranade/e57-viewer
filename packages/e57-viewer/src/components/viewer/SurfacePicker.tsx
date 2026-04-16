

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useViewer } from '../../lib/viewerState'
import { pickMeshRegion } from '../../lib/meshPicker'
import type { FlyCameraHandle } from './FlyCamera'

const PICK_COLORS = ['#ef4444', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#14b8a6', '#f97316']

interface Props { flyCameraRef: React.RefObject<FlyCameraHandle | null> }

export default function SurfacePicker({ flyCameraRef }: Props) {
  const { pickSurfaceMode, surfaces, addSurface } = useViewer()
  const { camera, gl, scene } = useThree()

  // Suppress camera orbit while pick mode is active (same as MeasureTool)
  useEffect(() => {
    flyCameraRef.current?.setMeasureMode(pickSurfaceMode)
  }, [pickSurfaceMode, flyCameraRef])

  useEffect(() => {
    if (!pickSurfaceMode) return

    const onClick = (e: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)

      const hits = raycaster
        .intersectObjects(scene.children, true)
        .filter(
          (h) =>
            h.object instanceof THREE.Mesh &&
            h.faceIndex !== undefined && h.faceIndex !== null &&
            !(h.object.material as THREE.Material).transparent,
        )

      if (hits.length === 0) return
      const hit = hits[0]
      if (!hit) return
      const mesh = hit.object as THREE.Mesh
      const faceIndex = hit.faceIndex
      if (faceIndex === undefined || faceIndex === null) return

      const region = pickMeshRegion(mesh, faceIndex)
      const colorIndex = surfaces.length % PICK_COLORS.length
      const n = surfaces.length + 1

      addSurface({
        id: `picked-${Date.now()}`,
        label: `Surface ${n}`,
        color: PICK_COLORS[colorIndex] ?? '#888888',
        visible: true,
        groupId: null,
        area: region.area,
        worldTriangles: region.worldTriangles,
      })
    }

    gl.domElement.addEventListener('click', onClick)
    return () => gl.domElement.removeEventListener('click', onClick)
  }, [pickSurfaceMode, camera, gl, scene, surfaces, addSurface])

  return null
}
