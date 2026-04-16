import { useEffect, useRef, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { decodeChunk } from '../../lib/chunkCodec'
import { useViewer } from '../../lib/viewerState'
import { useConfig } from '../../config'
import type { ColorMode } from '../../lib/viewerState'
import type { FlyCameraHandle } from './FlyCamera'

const INITIAL_CAPACITY = 500_000
const GROWTH_FACTOR = 1.5

interface Buffers {
  positions: Float32Array
  colors: Float32Array
  intensities: Float32Array
  count: number
  capacity: number
}

function growBuffers(buf: Buffers, needed: number): Buffers {
  if (buf.count + needed <= buf.capacity) return buf
  const newCapacity = Math.ceil(
    Math.max(buf.capacity * GROWTH_FACTOR, buf.count + needed),
  )
  const positions = new Float32Array(newCapacity * 3)
  const colors = new Float32Array(newCapacity * 3)
  const intensities = new Float32Array(newCapacity)
  positions.set(buf.positions.subarray(0, buf.count * 3))
  colors.set(buf.colors.subarray(0, buf.count * 3))
  intensities.set(buf.intensities.subarray(0, buf.count))
  return { positions, colors, intensities, count: buf.count, capacity: newCapacity }
}

function hexToRgb01(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16 & 0xff) / 255, (n >> 8 & 0xff) / 255, (n & 0xff) / 255]
}

interface PointCloudProps {
  flyCameraRef: React.RefObject<FlyCameraHandle | null>
}

export default function PointCloud({ flyCameraRef }: PointCloudProps) {
  const { endpoints } = useConfig()
  const { jobId, streamStatus, pointSize, colorMode, addLoadedPoints, setDone, setError, objectQuaternion, bbox, fileType, surfaces, surfaceColorMode, setColorMode, pointCloudGeoRef } =
    useViewer()

  const pointsRef = useRef<THREE.Points | null>(null)
  const groupRef = useRef<THREE.Group | null>(null)
  const { camera } = useThree()

  // Apply object quaternion imperatively.
  // Base rotation: -90° around X converts Z-up E57 data → Y-up world space.
  // User objectQuaternion is applied on top (userQ * baseQ = base first, then user).
  useEffect(() => {
    if (!groupRef.current) return
    const baseQ = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2) // -90° X
    const userQ = new THREE.Quaternion(...objectQuaternion)
    groupRef.current.quaternion.copy(userQ.multiply(baseQ))
  }, [objectQuaternion])

  // Ground-snap + center for Z-up data converted to Y-up world.
  // After -90°X rotation: dataX→worldX, dataZ→worldY, dataY→world(-Z)
  // So: center on dataX/dataY axes, snap dataZ floor (minZ) to worldY=0.
  const groupPosition = useMemo<[number, number, number]>(() => {
    if (!bbox) return [0, 0, 0]
    return [
      -((bbox.minX + bbox.maxX) / 2),  // center data X
      -bbox.minZ,                        // snap data floor (minZ) to world Y=0
      (bbox.minY + bbox.maxY) / 2,      // center data Y (becomes world -Z, so +centerY)
    ]
  }, [bbox])

  const buffersRef = useRef<Buffers>({
    positions: new Float32Array(INITIAL_CAPACITY * 3),
    colors: new Float32Array(INITIAL_CAPACITY * 3),
    intensities: new Float32Array(INITIAL_CAPACITY),
    count: 0,
    capacity: INITIAL_CAPACITY,
  })

  // Initialize geometry
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const cap = INITIAL_CAPACITY
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * 3), 3))
    geo.setAttribute('intensity', new THREE.BufferAttribute(new Float32Array(cap), 1))
    geo.setDrawRange(0, 0)
    return geo
  }, [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uPointSize: { value: pointSize },
          uColorMode: { value: colorModeToInt(colorMode) },
          uMinZ: { value: 0 },
          uMaxZ: { value: 1 },
        },
        vertexShader: `
          attribute float intensity;
          uniform float uPointSize;
          uniform int uColorMode;
          uniform float uMinZ;
          uniform float uMaxZ;
          varying vec3 vColor;
          varying float vIntensity;

          vec3 heatmap(float t) {
            t = clamp(t, 0.0, 1.0);
            return vec3(
              smoothstep(0.5, 0.75, t),
              smoothstep(0.0, 0.5, t) - smoothstep(0.75, 1.0, t),
              1.0 - smoothstep(0.0, 0.5, t)
            );
          }

          void main() {
            vIntensity = intensity;
            if (uColorMode == 0) {
              // RGB from attribute
              vColor = color;
            } else if (uColorMode == 1) {
              // Intensity
              vColor = heatmap(intensity);
            } else {
              // Height (Z)
              float t = clamp((position.z - uMinZ) / max(uMaxZ - uMinZ, 0.001), 0.0, 1.0);
              vColor = heatmap(t);
            }
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = uPointSize;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          void main() {
            // Circular point
            vec2 coord = gl_PointCoord - 0.5;
            if (length(coord) > 0.5) discard;
            gl_FragColor = vec4(vColor, 1.0);
          }
        `,
        vertexColors: true,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // intentionally static; we update uniforms directly
  )

  // Update uniforms when settings change
  useEffect(() => {
    if (material.uniforms.uPointSize) {
      material.uniforms.uPointSize.value = pointSize
    }
  }, [pointSize, material])

  useEffect(() => {
    if (material.uniforms.uColorMode) {
      material.uniforms.uColorMode.value = colorModeToInt(colorMode)
    }
  }, [colorMode, material])

  // Apply surface color override
  useEffect(() => {
    const colAttr = geometry.getAttribute('color') as THREE.BufferAttribute
    const colArr = colAttr.array as Float32Array
    const count = buffersRef.current.count
    if (count === 0) return

    if (!surfaceColorMode || surfaces.length === 0) {
      colArr.set(buffersRef.current.colors.subarray(0, count * 3))
      colAttr.needsUpdate = true
      return
    }

    const override = new Float32Array(count * 3).fill(0.12)
    for (const surf of surfaces) {
      if (!surf.visible) continue
      if (!surf.pointIndices) continue
      const [r, g, b] = hexToRgb01(surf.color)
      for (const idx of surf.pointIndices) {
        if (idx < count) {
          override[idx * 3] = r
          override[idx * 3 + 1] = g
          override[idx * 3 + 2] = b
        }
      }
    }
    colArr.set(override)
    colAttr.needsUpdate = true
    setColorMode('rgb')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaces, surfaceColorMode, geometry])

  // Stream handler — only for E57 point clouds
  useEffect(() => {
    if (!jobId || streamStatus !== 'streaming') return
    if (fileType && fileType !== 'e57') return // mesh formats handled by MeshModel
    if (!endpoints.stream) return

    console.debug('[PointCloud] Starting stream for job', jobId)

    // Reset buffers
    buffersRef.current = {
      positions: new Float32Array(INITIAL_CAPACITY * 3),
      colors: new Float32Array(INITIAL_CAPACITY * 3),
      intensities: new Float32Array(INITIAL_CAPACITY),
      count: 0,
      capacity: INITIAL_CAPACITY,
    }
    geometry.setDrawRange(0, 0)

    const es = new EventSource(`${endpoints.stream}/${jobId}`)

    console.debug('[PointCloud] EventSource created', es.url)

    // Log readyState every 2s so the user can see if it's stuck in CONNECTING
    const readyStates = ['CONNECTING', 'OPEN', 'CLOSED']
    const readyStateTimer = setInterval(() => {
      console.debug(`[PointCloud] EventSource readyState: ${readyStates[es.readyState]} (${es.readyState})`)
    }, 2000)

    let minZ = Infinity
    let maxZ = -Infinity
    let chunkCount = 0

    es.addEventListener('open', () => {
      console.debug('[PointCloud] Stream connection opened')
    })

    es.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data as string)

      if (msg.type === 'chunk') {
        chunkCount += 1
        if (chunkCount === 1) {
          console.debug('[PointCloud] First chunk received', {
            pointCount: msg.pointCount,
            hasColor: msg.hasColor,
            hasIntensity: msg.hasIntensity,
          })
        } else if (chunkCount % 10 === 0) {
          console.debug(`[PointCloud] Chunk #${chunkCount}, total pts so far:`, buffersRef.current.count)
        }
        const chunk = decodeChunk(msg.base64 as string)
        const stride = 3 + (chunk.hasColor ? 3 : 0) + (chunk.hasIntensity ? 1 : 0)

        let buf = buffersRef.current
        buf = growBuffers(buf, chunk.pointCount)
        buffersRef.current = buf

        const base = buf.count

        for (let i = 0; i < chunk.pointCount; i++) {
          const srcBase = i * stride
          const x = (chunk.data[srcBase] ?? 0)
          const y = (chunk.data[srcBase + 1] ?? 0)
          const z = (chunk.data[srcBase + 2] ?? 0)

          buf.positions[(base + i) * 3] = x
          buf.positions[(base + i) * 3 + 1] = y
          buf.positions[(base + i) * 3 + 2] = z

          if (z < minZ) minZ = z
          if (z > maxZ) maxZ = z

          if (chunk.hasColor) {
            buf.colors[(base + i) * 3] = (chunk.data[srcBase + 3] ?? 0)
            buf.colors[(base + i) * 3 + 1] = (chunk.data[srcBase + 4] ?? 0)
            buf.colors[(base + i) * 3 + 2] = (chunk.data[srcBase + 5] ?? 0)
          } else {
            buf.colors[(base + i) * 3] = 0.8
            buf.colors[(base + i) * 3 + 1] = 0.8
            buf.colors[(base + i) * 3 + 2] = 0.8
          }

          if (chunk.hasIntensity) {
            const iOffset = srcBase + 3 + (chunk.hasColor ? 3 : 0)
            buf.intensities[base + i] = (chunk.data[iOffset] ?? 0)
          }
        }

        buf.count += chunk.pointCount

        // Push to GPU
        const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
        const colAttr = geometry.getAttribute('color') as THREE.BufferAttribute
        const intAttr = geometry.getAttribute('intensity') as THREE.BufferAttribute

        // Resize GPU buffer if needed
        if (buf.capacity > posAttr.array.length / 3) {
          geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(buf.positions.slice(0, buf.capacity * 3), 3),
          )
          geometry.setAttribute(
            'color',
            new THREE.BufferAttribute(buf.colors.slice(0, buf.capacity * 3), 3),
          )
          geometry.setAttribute(
            'intensity',
            new THREE.BufferAttribute(buf.intensities.slice(0, buf.capacity), 1),
          )
        } else {
          const posArr = posAttr.array as Float32Array
          posArr.set(buf.positions.subarray(base * 3, buf.count * 3), base * 3)
          posAttr.addUpdateRange(base * 3, chunk.pointCount * 3)
          posAttr.needsUpdate = true

          const colArr = colAttr.array as Float32Array
          colArr.set(buf.colors.subarray(base * 3, buf.count * 3), base * 3)
          colAttr.addUpdateRange(base * 3, chunk.pointCount * 3)
          colAttr.needsUpdate = true

          const intArr = intAttr.array as Float32Array
          intArr.set(buf.intensities.subarray(base, buf.count), base)
          intAttr.addUpdateRange(base, chunk.pointCount)
          intAttr.needsUpdate = true
        }

        geometry.setDrawRange(0, buf.count)

        // Update Z range uniform
        if (material.uniforms.uMinZ) material.uniforms.uMinZ.value = minZ
        if (material.uniforms.uMaxZ) material.uniforms.uMaxZ.value = maxZ

        addLoadedPoints(chunk.pointCount)
      } else if (msg.type === 'done') {
        console.debug('[PointCloud] Stream done', {
          totalPoints: msg.totalPoints,
          bbox: msg.bbox,
          hasColor: msg.hasColor,
          hasIntensity: msg.hasIntensity,
        })
        es.close()
        // Fly camera to fit the world-space bounding box.
        // After -90°X base rotation: data(X,Y,Z) → world(X, Z, -Y)
        // World extents: X→[-halfX, halfX], Y→[0, zSpan] (floor at 0), Z→[-halfY, halfY]
        if (msg.bbox) {
          const { minX, maxX, minY, maxY, minZ: bMinZ, maxZ: bMaxZ } = msg.bbox
          const halfX = (maxX - minX) / 2
          const halfY_data = (maxY - minY) / 2
          const zSpan = bMaxZ - bMinZ
          const worldBox = new THREE.Box3(
            new THREE.Vector3(-halfX, 0, -halfY_data),
            new THREE.Vector3(halfX, zSpan, halfY_data),
          )
          if (flyCameraRef.current) {
            flyCameraRef.current.fitToBox(worldBox)
          } else {
            const span = Math.max(halfX * 2, zSpan, halfY_data * 2)
            camera.position.set(span * 0.8, span * 0.6, span * 1.2)
            camera.lookAt(0, zSpan / 2, 0)
          }
        }
        setDone({
          totalPoints: msg.totalPoints,
          bbox: msg.bbox,
          hasColor: msg.hasColor,
          hasIntensity: msg.hasIntensity,
        })
        // Make geometry accessible for surface detection
        if (groupRef.current) {
          pointCloudGeoRef.current = {
            geometry,
            matrixWorld: groupRef.current.matrixWorld.clone(),
            count: buffersRef.current.count,
          }
        }
      } else if (msg.type === 'error') {
        console.error('[PointCloud] Stream error:', msg.message)
        es.close()
        setError(msg.message as string)
      }
    })

    es.addEventListener('error', (e) => {
      console.error('[PointCloud] EventSource connection error', e)
      es.close()
      setError('Stream connection lost')
    })

    return () => {
      console.debug('[PointCloud] Cleaning up stream for job', jobId)
      clearInterval(readyStateTimer)
      es.close()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, streamStatus, fileType, geometry, material, camera, addLoadedPoints, setDone, setError, endpoints])

  return (
    <group ref={groupRef} position={groupPosition}>
      <points ref={pointsRef} geometry={geometry} material={material} />
    </group>
  )
}

function colorModeToInt(mode: ColorMode): number {
  if (mode === 'rgb') return 0
  if (mode === 'intensity') return 1
  return 2 // height
}
