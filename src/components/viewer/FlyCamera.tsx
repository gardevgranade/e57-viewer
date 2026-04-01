'use client'

import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export interface FlyCameraHandle {
  /** Animate the camera to view the given box from outside it. */
  fitToBox: (box: THREE.Box3) => void
}

/**
 * Camera with orbit left-drag, pan right-drag, scroll zoom, WASD fly.
 *
 * Controls:
 *   Left-drag   — orbit around the scene center
 *   Right-drag  — pan (truck camera + shift orbit target together)
 *   Scroll      — zoom in / out along view direction
 *   W/S         — fly forward / backward
 *   A/D         — strafe left / right
 *   Q/Space     — rise,  E/Shift — descend
 */
const FlyCamera = forwardRef<FlyCameraHandle>((_, ref) => {
  const { camera, gl } = useThree()

  const drag = useRef<null | 'orbit' | 'pan'>(null)
  const lastMouse = useRef({ x: 0, y: 0 })
  const keys = useRef<Set<string>>(new Set())
  // fly speed scales with scene size; set by fitToBox
  const flySpeed = useRef(1)
  // orbit target — the point the camera revolves around
  const orbitTarget = useRef(new THREE.Vector3(0, 0, 0))

  // Smooth fly-to animation state
  const flyAnim = useRef<{
    active: boolean
    fromPos: THREE.Vector3
    toPos: THREE.Vector3
    fromQuat: THREE.Quaternion
    toQuat: THREE.Quaternion
    t: number
  } | null>(null)

  useImperativeHandle(ref, () => ({
    fitToBox(box: THREE.Box3) {
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const span = Math.max(size.x, size.y, size.z)

      flySpeed.current = span * 0.5
      orbitTarget.current.copy(center)

      // Position camera outside the box looking at the center
      const toPos = center.clone()
      toPos.y -= span * 1.2
      toPos.z += span * 0.5

      const toQuat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(toPos, center, new THREE.Vector3(0, 0, 1)),
      )

      flyAnim.current = {
        active: true,
        fromPos: camera.position.clone(),
        toPos,
        fromQuat: camera.quaternion.clone(),
        toQuat,
        t: 0,
      }
    },
  }))

  useEffect(() => {
    const canvas = gl.domElement

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) drag.current = 'orbit'
      if (e.button === 2) drag.current = 'pan'
      lastMouse.current = { x: e.clientX, y: e.clientY }
      flyAnim.current = null // cancel fly-to on user interaction
    }

    const onMouseUp = () => { drag.current = null }

    const onMouseMove = (e: MouseEvent) => {
      if (!drag.current) return
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      lastMouse.current = { x: e.clientX, y: e.clientY }

      if (drag.current === 'orbit') {
        // Spherical orbit around orbitTarget
        const offset = camera.position.clone().sub(orbitTarget.current)
        const spherical = new THREE.Spherical().setFromVector3(offset)
        spherical.theta -= dx * 0.006
        spherical.phi = Math.max(0.02, Math.min(Math.PI - 0.02, spherical.phi - dy * 0.006))
        offset.setFromSpherical(spherical)
        camera.position.copy(orbitTarget.current).add(offset)
        camera.lookAt(orbitTarget.current)
      } else {
        // Pan: shift camera AND orbit target together
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
        const up = new THREE.Vector3(0, 1, 0)
        const speed = flySpeed.current * 0.002
        const panOffset = right.clone().multiplyScalar(-dx * speed).addScaledVector(up, dy * speed)
        camera.position.add(panOffset)
        orbitTarget.current.add(panOffset)
        camera.lookAt(orbitTarget.current)
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      flyAnim.current = null
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
      camera.position.addScaledVector(forward, -e.deltaY * flySpeed.current * 0.002)
      camera.lookAt(orbitTarget.current)
    }

    const onKeyDown = (e: KeyboardEvent) => keys.current.add(e.code)
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code)
    const onContextMenu = (e: Event) => e.preventDefault()

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [camera, gl])

  useFrame((_, delta) => {
    // Smooth fly-to animation
    const anim = flyAnim.current
    if (anim?.active) {
      anim.t = Math.min(1, anim.t + delta * 3)
      const t = easeInOut(anim.t)
      camera.position.lerpVectors(anim.fromPos, anim.toPos, t)
      camera.quaternion.slerpQuaternions(anim.fromQuat, anim.toQuat, t)
      if (anim.t >= 1) flyAnim.current = null
      return
    }

    // WASD / QE keyboard movement (moves camera freely, orbit target stays)
    const k = keys.current
    if (k.size === 0) return

    const speed = flySpeed.current * delta * 1.5
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

    if (k.has('KeyW') || k.has('ArrowUp')) camera.position.addScaledVector(forward, speed)
    if (k.has('KeyS') || k.has('ArrowDown')) camera.position.addScaledVector(forward, -speed)
    if (k.has('KeyA') || k.has('ArrowLeft')) camera.position.addScaledVector(right, -speed)
    if (k.has('KeyD') || k.has('ArrowRight')) camera.position.addScaledVector(right, speed)
    if (k.has('KeyQ') || k.has('Space')) camera.position.y += speed
    if (k.has('KeyE') || k.has('ShiftLeft')) camera.position.y -= speed
  })

  return null
})

FlyCamera.displayName = 'FlyCamera'
export default FlyCamera

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}
