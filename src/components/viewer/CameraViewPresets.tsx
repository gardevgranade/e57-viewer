'use client'

import { useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useViewer } from '../../lib/viewerState.js'
import type { FlyCameraHandle } from './FlyCamera.js'

export type CameraPreset = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso' | 'fit'

interface CameraViewPresetsProps {
  flyCameraRef: React.RefObject<FlyCameraHandle | null>
}

export default function CameraViewPresets(_props: CameraViewPresetsProps) {
  return null // This is a logic-only component; the UI is rendered from the DOM layer
}

/**
 * Hook providing a goToView(preset) function.
 * Must be called from inside a Canvas (uses useThree).
 */
export function useGoToView(flyCameraRef: React.RefObject<FlyCameraHandle | null>) {
  const { camera } = useThree()
  const { bbox, meshObjectRef } = useViewer()

  return useCallback(
    (preset: CameraPreset) => {
      // Compute scene bounds
      let worldBox: THREE.Box3
      if (meshObjectRef.current) {
        worldBox = new THREE.Box3().setFromObject(meshObjectRef.current)
      } else if (bbox) {
        worldBox = new THREE.Box3(
          new THREE.Vector3(bbox.minX, bbox.minY, bbox.minZ),
          new THREE.Vector3(bbox.maxX, bbox.maxY, bbox.maxZ),
        )
      } else {
        worldBox = new THREE.Box3(
          new THREE.Vector3(-5, -5, -5),
          new THREE.Vector3(5, 5, 5),
        )
      }

      if (preset === 'fit') {
        flyCameraRef.current?.fitToBox(worldBox)
        return
      }

      const center = worldBox.getCenter(new THREE.Vector3())
      const size = worldBox.getSize(new THREE.Vector3())
      const span = Math.max(size.x, size.y, size.z) * 1.4

      const offsets: Record<CameraPreset, THREE.Vector3> = {
        front:  new THREE.Vector3(0, 0, span),
        back:   new THREE.Vector3(0, 0, -span),
        left:   new THREE.Vector3(-span, 0, 0),
        right:  new THREE.Vector3(span, 0, 0),
        top:    new THREE.Vector3(0, span, 0.001),
        bottom: new THREE.Vector3(0, -span, 0.001),
        iso:    new THREE.Vector3(span * 0.7, span * 0.5, span * 0.7),
        fit:    new THREE.Vector3(span * 0.8, span * 0.6, span * 1.2),
      }

      const toPos = center.clone().add(offsets[preset])
      // Animate via fitToBox-like method or direct set
      camera.position.copy(toPos)
      camera.lookAt(center)
    },
    [camera, bbox, meshObjectRef, flyCameraRef],
  )
}
