'use client'

import { useEffect, useRef, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { parseDxfToThree } from '../../lib/dxfLoader.js'
import { useViewer } from '../../lib/viewerState.js'
import type { FlyCameraHandle } from './FlyCamera.js'

interface MeshModelProps {
  flyCameraRef: React.RefObject<FlyCameraHandle | null>
}

const DEFAULT_MATERIAL = new THREE.MeshPhongMaterial({
  color: '#b0b8c8',
  side: THREE.DoubleSide,
  shininess: 20,
})

/** Apply a neutral grey material to any mesh without a colour/texture. */
function applyDefaultMaterial(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const hasMaterial = Array.isArray(child.material)
        ? child.material.some((m) => m && m.type !== 'MeshBasicMaterial')
        : child.material && child.material.type !== 'MeshBasicMaterial'
      if (!hasMaterial) child.material = DEFAULT_MATERIAL
    }
  })
}

export default function MeshModel({ flyCameraRef }: MeshModelProps) {
  const { jobId, fileType, streamStatus, setDone, setError, meshObjectRef, meshVisible } = useViewer()
  const { camera } = useThree()
  const groupRef = useRef<THREE.Group>(null!)
  const sceneRef = useRef<THREE.Group | null>(null)

  // Ground-snap group position — set after loading
  const positionRef = useRef<[number, number, number]>([0, 0, 0])

  useEffect(() => {
    if (!jobId || streamStatus !== 'streaming' || fileType === 'e57' || !fileType) return

    let cancelled = false

    async function load() {
      try {
        const res = await fetch(`/api/model/${jobId}`)
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
        }

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)

        let object: THREE.Object3D

        if (fileType === 'dae') {
          const loader = new ColladaLoader()
          const collada = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
            loader.load(url, (result) => resolve(result as unknown as { scene: THREE.Group }), undefined, reject)
          })
          object = collada.scene
        } else if (fileType === 'obj') {
          // Try to fetch companion MTL
          let materials: ReturnType<MTLLoader['parse']> | undefined
          try {
            const mtlRes = await fetch(`/api/model/${jobId}?mtl=1`)
            if (mtlRes.ok) {
              const mtlText = await mtlRes.text()
              const mtlLoader = new MTLLoader()
              materials = mtlLoader.parse(mtlText, '')
              materials.preload()
            }
          } catch {
            // No MTL — proceed with default material
          }
          const loader = new OBJLoader()
          if (materials) loader.setMaterials(materials)
          object = await new Promise<THREE.Group>((resolve, reject) => {
            loader.load(url, resolve, undefined, reject)
          })
        } else if (fileType === 'dxf' || fileType === 'dwg') {
          // DXF text (DWG is server-converted to DXF)
          const dxfText = await blob.text()
          object = parseDxfToThree(dxfText)
        } else {
          // skp (converted to GLB) or any other GLTF
          const loader = new GLTFLoader()
          const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
            loader.load(url, (result) => resolve(result as unknown as { scene: THREE.Group }), undefined, reject)
          })
          object = gltf.scene
        }

        URL.revokeObjectURL(url)
        if (cancelled) return

        applyDefaultMaterial(object)

        // Compute bounding box in object-local space
        const bbox3 = new THREE.Box3().setFromObject(object)
        const size = bbox3.getSize(new THREE.Vector3())
        const min = bbox3.min
        const max = bbox3.max

        // Add the loaded object to our group
        if (sceneRef.current) groupRef.current.remove(sceneRef.current)
        sceneRef.current = object instanceof THREE.Group ? object : (() => {
          const g = new THREE.Group(); g.add(object); return g
        })()
        groupRef.current.add(sceneRef.current)

        // Apply base -90°X rotation (Z-up → Y-up), same as PointCloud
        const baseQ = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)
        groupRef.current.quaternion.copy(baseQ)

        // Ground-snap: center X/Y (data), snap minZ to Y=0
        // After -90°X rotation: data(X,Y,Z) → world(X, Z, -Y)
        positionRef.current = [
          -((min.x + max.x) / 2),
          -min.z,
          (min.y + max.y) / 2,
        ]
        groupRef.current.position.set(...positionRef.current)

        // World-space bounding box after transform
        const halfX = size.x / 2
        const halfY_data = size.y / 2
        const zSpan = size.z
        const worldBox = new THREE.Box3(
          new THREE.Vector3(-halfX, 0, -halfY_data),
          new THREE.Vector3(halfX, zSpan, halfY_data),
        )

        const bbox = {
          minX: min.x, minY: min.y, minZ: min.z,
          maxX: max.x, maxY: max.y, maxZ: max.z,
        }

        setDone({ totalPoints: 0, bbox, hasColor: false, hasIntensity: false })

        // Expose the loaded object for surface detection
        meshObjectRef.current = groupRef.current

        if (flyCameraRef.current) {
          flyCameraRef.current.fitToBox(worldBox)
        } else {
          const span = Math.max(halfX * 2, zSpan, halfY_data * 2)
          camera.position.set(span * 0.8, span * 0.6, span * 1.2)
          camera.lookAt(0, zSpan / 2, 0)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load model')
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [jobId, fileType, streamStatus, camera, setDone, setError, flyCameraRef])

  // Apply objectQuaternion on top of the base rotation
  const { objectQuaternion, objectYOffset } = useViewer()
  useEffect(() => {
    if (!groupRef.current) return
    const baseQ = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)
    const userQ = new THREE.Quaternion(...objectQuaternion)
    groupRef.current.quaternion.copy(userQ.multiply(baseQ))
  }, [objectQuaternion])

  useEffect(() => {
    if (!groupRef.current) return
    const [x, y, z] = positionRef.current
    groupRef.current.position.set(x, y + objectYOffset, z)
  }, [objectYOffset])

  // Toggle mesh visibility
  useEffect(() => {
    if (groupRef.current) groupRef.current.visible = meshVisible
  }, [meshVisible])

  const ambientLight = useMemo(() => new THREE.AmbientLight(0xffffff, 0.6), [])
  void ambientLight

  return <group ref={groupRef} />
}
