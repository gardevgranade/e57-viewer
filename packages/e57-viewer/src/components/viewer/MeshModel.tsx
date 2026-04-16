import { useEffect, useRef, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useViewer } from '../../lib/viewerState'
import { useConfig } from '../../config'
import type { FlyCameraHandle } from './FlyCamera'
import type { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'

interface MeshModelProps {
  flyCameraRef: React.RefObject<FlyCameraHandle | null>
}

const DEFAULT_MATERIAL = new THREE.MeshPhongMaterial({
  color: '#b0b8c8',
  side: THREE.DoubleSide,
  shininess: 20,
})

/** Apply a neutral grey material to any mesh without a colour/texture. Fix black MTL materials. */
function applyDefaultMaterial(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (let i = 0; i < mats.length; i++) {
        const m = mats[i]
        if (!m || m.type === 'MeshBasicMaterial') {
          // No real material — apply default
          if (Array.isArray(child.material)) child.material[i] = DEFAULT_MATERIAL
          else child.material = DEFAULT_MATERIAL
        } else if (m instanceof THREE.MeshPhongMaterial || m instanceof THREE.MeshStandardMaterial) {
          // Fix black MTL materials: if color is black and there's no texture, use grey
          if (m.color && m.color.getHex() === 0x00_00_00 && !m.map) {
            m.color.set(0xb0_b8_c8)
          }
          m.side = THREE.DoubleSide
        }
      }
    }
  })
}

/** Fetch and parse companion MTL material for OBJ files. */
async function loadMtlMaterials(
  modelEndpoint: string,
  jobId: string,
): Promise<ReturnType<MTLLoader['parse']> | undefined> {
  const mtlRes = await fetch(`${modelEndpoint}/${jobId}?mtl=1&_t=${Date.now()}`)
  if (!mtlRes.ok) {
    console.log('[MeshModel] No MTL available (status', mtlRes.status, ')')
    return undefined
  }

  const mtlText = await mtlRes.text()
  console.log('[MeshModel] MTL loaded, length:', mtlText.length)
  console.log('[MeshModel] MTL content (first 500 chars):', mtlText.slice(0, 500))

  const { MTLLoader: MtlLoaderImpl } = await import('three/examples/jsm/loaders/MTLLoader.js')
  const mtlLoader = new MtlLoaderImpl()
  const manager = new THREE.LoadingManager()
  const failedTextures = new Set<string>()
  const cacheBust = Date.now()

  manager.setURLModifier((texUrl) => {
    // Normalize Windows backslashes, strip leading ./ or /, collapse double slashes
    const name = texUrl.replaceAll('\\', '/').replace(/^(\.\/|\/)+/, '').replaceAll(/\/+/g, '/')
    const resolved = `${modelEndpoint}/${jobId}?texture=${encodeURIComponent(name)}&_t=${cacheBust}`
    console.log(`[MeshModel] Texture URL: "${texUrl}" → "${resolved}"`)
    return resolved
  })
  mtlLoader.manager = manager
  const materials = mtlLoader.parse(mtlText, '')

  manager.onError = (url) => {
    console.warn(`[MeshModel] ⚠ Failed to load texture: ${url}`)
    failedTextures.add(url)
    // Strip failed texture maps from materials so the model isn't rendered dark
    for (const mat of Object.values(materials.materials)) {
      const m = mat as THREE.MeshPhongMaterial
      if (m.map) {
        m.map = null
        m.needsUpdate = true
      }
    }
  }
  materials.preload()

  // Log all parsed materials
  for (const [matName, mat] of Object.entries(materials.materials)) {
    const m = mat as THREE.MeshPhongMaterial
    console.log(`[MeshModel] Material "${matName}":`, {
      type: m.type,
      color: m.color?.getHexString(),
      map: m.map ? 'yes' : 'no',
      opacity: m.opacity,
    })
  }

  return materials
}

export default function MeshModel({ flyCameraRef }: MeshModelProps) {
  const { jobId, fileType, streamStatus, setDone, setError, meshObjectRef, meshVisible, modelVersion, modelUrl, modelData } = useViewer()
  const { endpoints } = useConfig()
  const { camera } = useThree()
  const groupRef = useRef<THREE.Group | null>(null)
  const sceneRef = useRef<THREE.Group | null>(null)

  // Ground-snap group position — set after loading
  const positionRef = useRef<[number, number, number]>([0, 0, 0])

  const lastLoadedVersionRef = useRef(-1)

  useEffect(() => {
    // Load on initial streaming, or reload when modelVersion increments
    const isInitialLoad = streamStatus === 'streaming'
    const isReload = modelVersion > lastLoadedVersionRef.current && streamStatus === 'done'
    const hasSource = Boolean(modelUrl || modelData || (endpoints.model && jobId))
    if (!hasSource || fileType === 'e57' || !fileType || (!isInitialLoad && !isReload)) return
    console.log(`[MeshModel] ${isReload ? 'RELOAD' : 'INITIAL'} load, modelVersion=${modelVersion}`)
    lastLoadedVersionRef.current = modelVersion

    let cancelled = false

    async function load() {
      try {
        let blob: Blob

        if (modelData) {
          blob = new Blob([modelData])
        } else {
          const fetchUrl = modelUrl ?? (endpoints.model && jobId ? `${endpoints.model}/${jobId}` : null)
          if (!fetchUrl) return
          const res = await fetch(fetchUrl)
          if (!res.ok) {
            const json = await res.json().catch(() => ({}))
            throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
          }
          blob = await res.blob()
        }
        const url = URL.createObjectURL(blob)

        let object: THREE.Object3D

        if (fileType === 'dae') {
          const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js')
          const loader = new ColladaLoader()
          const collada = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
            loader.load(url, (result) => resolve(result as unknown as { scene: THREE.Group }), undefined, reject)
          })
          object = collada.scene
        } else if (fileType === 'obj') {
          // Try to fetch companion MTL
          let materials: ReturnType<MTLLoader['parse']> | undefined
          if (endpoints.model && jobId) {
            try {
              materials = await loadMtlMaterials(endpoints.model, jobId)
            } catch (error) {
              console.warn('[MeshModel] MTL fetch error:', error)
            }
          }
          const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
          const loader = new OBJLoader()
          if (materials) {
            loader.setMaterials(materials)
            console.log(`[MeshModel] OBJ loading with ${Object.keys(materials.materials).length} MTL materials`)
          } else {
            console.log('[MeshModel] OBJ loading without materials')
          }
          object = await new Promise<THREE.Group>((resolve, reject) => {
            loader.load(url, resolve, undefined, reject)
          })
          // Log what materials ended up on the meshes
          let meshCount = 0
          object.traverse(child => {
            if (child instanceof THREE.Mesh) {
              meshCount += 1
              const m = child.material as THREE.Material
              console.log(`[MeshModel] Mesh "${child.name}" material:`, {
                type: m.type,
                color: (m as THREE.MeshPhongMaterial).color?.getHexString(),
                map: (m as THREE.MeshPhongMaterial).map ? 'yes' : 'no',
              })
            }
          })
          console.log(`[MeshModel] OBJ loaded: ${meshCount} meshes`)
        } else if (fileType === 'ply') {
          const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js')
          const loader = new PLYLoader()
          const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
            loader.load(url, resolve, undefined, reject)
          })
          geometry.computeVertexNormals()
          const hasColor = Boolean(geometry.getAttribute('color'))
          const hasFaces = Boolean(geometry.index)
          if (hasFaces) {
            // Mesh PLY
            const material = hasColor
              ? new THREE.MeshPhongMaterial({ vertexColors: true, side: THREE.DoubleSide, shininess: 20 })
              : DEFAULT_MATERIAL.clone()
            object = new THREE.Mesh(geometry, material)
          } else {
            // Point cloud PLY
            const material = hasColor
              ? new THREE.PointsMaterial({ size: 0.01, vertexColors: true, sizeAttenuation: true })
              : new THREE.PointsMaterial({ size: 0.01, color: 0xb0_b8_c8, sizeAttenuation: true })
            object = new THREE.Points(geometry, material)
          }
          console.log(`[MeshModel] PLY loaded: ${hasFaces ? 'mesh' : 'point cloud'}, vertices=${geometry.attributes.position.count}, color=${hasColor}`)
        } else if (fileType === 'dxf' || fileType === 'dwg') {
          const { parseDxfToThree } = await import('../../lib/dxfLoader')
          const dxfText = await blob.text()
          object = parseDxfToThree(dxfText)
        } else {
          // GLB, GLTF, SKP (converted to GLB)
          const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
          const loader = new GLTFLoader()
          const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
            loader.load(url, (result) => resolve(result as unknown as { scene: THREE.Group }), undefined, reject)
          })
          object = gltf.scene
          console.log(`[MeshModel] GLTF/GLB loaded: meshes=${(() => { let n = 0; object.traverse(c => { if ((c as THREE.Mesh).isMesh) n += 1 }); return n })()}`)
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
        const group = groupRef.current
        if (!group) return
        if (sceneRef.current) group.remove(sceneRef.current)
        sceneRef.current = object instanceof THREE.Group ? object : (() => {
          const g = new THREE.Group(); g.add(object); return g
        })()
        group.add(sceneRef.current)

        // Apply base -90°X rotation (Z-up → Y-up), same as PointCloud
        const baseQ = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)
        group.quaternion.copy(baseQ)

        // Ground-snap: center X/Y (data), snap minZ to Y=0
        // After -90°X rotation: data(X,Y,Z) → world(X, Z, -Y)
        positionRef.current = [
          -((min.x + max.x) / 2),
          -min.z,
          (min.y + max.y) / 2,
        ]
        group.position.set(...positionRef.current)

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
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : 'Failed to load model')
        }
      }
    }

    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, fileType, streamStatus, camera, setDone, setError, flyCameraRef, modelVersion, modelUrl, modelData, endpoints])

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

  const ambientLight = useMemo(() => new THREE.AmbientLight(0xff_ff_ff, 0.6), [])
  void ambientLight

  return <group ref={groupRef} />
}
