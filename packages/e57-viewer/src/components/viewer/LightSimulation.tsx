

import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useViewer } from '../../lib/viewerState'

/** Realistic lighting with shadow-casting sun, hemisphere fill, and shadow ground plane. */
export default function LightSimulation() {
  const { sunPosition, sunIntensity, ambientIntensity, bbox } = useViewer()
  const { scene, gl } = useThree()
  const sunRef = useRef<THREE.DirectionalLight | null>(null)
  const shadowPlaneRef = useRef<THREE.Mesh | null>(null)

  // Enable shadow maps on renderer
  useEffect(() => {
    gl.shadowMap.enabled = true
    gl.shadowMap.type = THREE.PCFSoftShadowMap
    gl.shadowMap.needsUpdate = true
    return () => {
      gl.shadowMap.enabled = false
      gl.shadowMap.needsUpdate = true
    }
  }, [gl])

  // Enable shadows on all meshes in the scene
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
  }, [scene, scene.children.length])

  // Configure shadow camera to cover the model bounding box
  useEffect(() => {
    const sun = sunRef.current
    if (!sun) return
    const shadow = sun.shadow
    shadow.mapSize.set(2048, 2048)
    shadow.bias = -0.0005
    shadow.normalBias = 0.02

    // Size shadow frustum to fit content
    let span = 20
    if (bbox) {
      span = Math.max(
        bbox.maxX - bbox.minX,
        bbox.maxY - bbox.minY,
        bbox.maxZ - bbox.minZ,
        10,
      )
    }
    const cam = shadow.camera
    cam.left = -span
    cam.right = span
    cam.top = span
    cam.bottom = -span
    cam.near = 0.1
    cam.far = span * 6
    cam.updateProjectionMatrix()
    shadow.needsUpdate = true
  }, [bbox, sunPosition])

  // Size the shadow-receiving ground plane
  const groundSize = bbox
    ? Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, bbox.maxZ - bbox.minZ) * 3
    : 100

  return (
    <>
      {/* Sun — directional with shadows */}
      <directionalLight
        ref={sunRef}
        position={sunPosition}
        intensity={sunIntensity}
        color={0xff_f5_e6}
        castShadow
      />

      {/* Hemisphere fill (sky blue + ground warm) */}
      <hemisphereLight
        args={[0x87_ce_eb, 0x8b_73_55, ambientIntensity]}
      />

      {/* Shadow-receiving ground plane */}
      <mesh
        ref={shadowPlaneRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
      >
        <planeGeometry args={[groundSize, groundSize]} />
        <meshStandardMaterial
          color={0x1a_1f_2e}
          roughness={0.9}
          metalness={0}
        />
      </mesh>

      {/* Sun position indicator (small yellow sphere) */}
      <mesh position={sunPosition}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial color={0xff_dd_44} />
      </mesh>
    </>
  )
}
