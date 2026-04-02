'use client'

import { useEffect, useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useViewer } from '../../lib/viewerState.js'
import type { FlyCameraHandle } from './FlyCamera.js'
import type { CameraPreset } from './CameraViewPresets.js'

// Global event bus for camera view presets
type CameraViewHandler = (preset: CameraPreset) => void
let _handler: CameraViewHandler | null = null

export function triggerCameraView(preset: CameraPreset) {
  _handler?.(preset)
}

// Global for screenshot
let _screenshotHandler: (() => void) | null = null
export function triggerScreenshot() {
  _screenshotHandler?.()
}

/**
 * R3F component that registers camera view + screenshot handlers
 * so DOM components can trigger them.
 */
export default function CameraViewBridge({ flyCameraRef }: { flyCameraRef: React.RefObject<FlyCameraHandle | null> }) {
  const { camera, gl } = useThree()
  const { bbox, meshObjectRef } = useViewer()

  const goToView = useCallback(
    (preset: CameraPreset) => {
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

      const offsets: Record<string, THREE.Vector3> = {
        front:  new THREE.Vector3(0, 0, span),
        back:   new THREE.Vector3(0, 0, -span),
        left:   new THREE.Vector3(-span, 0, 0),
        right:  new THREE.Vector3(span, 0, 0),
        top:    new THREE.Vector3(0, span, 0.001),
        bottom: new THREE.Vector3(0, -span, 0.001),
        iso:    new THREE.Vector3(span * 0.7, span * 0.5, span * 0.7),
      }

      const offset = offsets[preset]
      if (!offset) return
      const toPos = center.clone().add(offset)
      camera.position.copy(toPos)
      camera.lookAt(center)
    },
    [camera, bbox, meshObjectRef, flyCameraRef],
  )

  useEffect(() => {
    _handler = goToView
    return () => { _handler = null }
  }, [goToView])

  // Screenshot handler
  const takeScreenshot = useCallback(() => {
    gl.render(gl.info as any, camera) // ensure fresh frame
    const dataUrl = gl.domElement.toDataURL('image/png')
    const link = document.createElement('a')
    link.download = `screenshot-${Date.now()}.png`
    link.href = dataUrl
    link.click()
  }, [gl, camera])

  useEffect(() => {
    _screenshotHandler = takeScreenshot
    return () => { _screenshotHandler = null }
  }, [takeScreenshot])

  return null
}
