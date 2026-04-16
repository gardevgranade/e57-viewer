

import { useCallback, useEffect, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useViewer } from '../../lib/viewerState'
import type { FlyCameraHandle } from './FlyCamera'

interface BoxSelectToolProps {
  flyCameraRef: React.RefObject<FlyCameraHandle | null>
}

export default function BoxSelectTool({ flyCameraRef }: BoxSelectToolProps) {
  const {
    boxSelectMode, setBoxSelectMode, bbox, surfaces,
    pointCloudGeoRef, meshObjectRef,
    updateSurfaceGeometry,
  } = useViewer()
  const { camera, gl, scene } = useThree()

  const [boxCenter, setBoxCenter] = useState<THREE.Vector3 | null>(null)
  const [boxSize, setBoxSize] = useState<THREE.Vector3>(new THREE.Vector3(1, 1, 1))
  const [draggingFace, setDraggingFace] = useState<string | null>(null)
  const [pointsInside, setPointsInside] = useState(0)
  const boxRef = useRef<THREE.Mesh>(null)

  // Compute default box size from model bbox
  const defaultSize = useCallback(() => {
    if (!bbox) return new THREE.Vector3(1, 1, 1)
    const sx = (bbox.maxX - bbox.minX) * 0.2
    const sy = (bbox.maxY - bbox.minY) * 0.2
    const sz = (bbox.maxZ - bbox.minZ) * 0.2
    return new THREE.Vector3(
      Math.max(sx, 0.1),
      Math.max(sy, 0.1),
      Math.max(sz, 0.1),
    )
  }, [bbox])

  // Place box on click
  useEffect(() => {
    if (!boxSelectMode || boxCenter) return

    const rc = new THREE.Raycaster()
    const onClick = (e: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)

      const hits = rc.intersectObjects(scene.children, true)
        .filter(h => (h.object instanceof THREE.Points || h.object instanceof THREE.Mesh) && !h.object.userData?.isMeasurement && !h.object.userData?.isBoxSelect)
      if (hits.length > 0) {
        setBoxCenter(hits[0].point.clone())
        setBoxSize(defaultSize())
      }
    }

    gl.domElement.addEventListener('click', onClick)
    return () => gl.domElement.removeEventListener('click', onClick)
  }, [boxSelectMode, boxCenter, camera, gl, scene, defaultSize])

  // Cancel on Escape
  useEffect(() => {
    if (!boxSelectMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setBoxCenter(null)
        setBoxSelectMode(false)
      }
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [boxSelectMode, setBoxSelectMode])

  // Lock camera while box is placed
  useEffect(() => {
    if (!boxCenter) return
    const flyCamera = flyCameraRef.current
    flyCamera?.setMeasureMode(true)
    return () => { flyCamera?.setMeasureMode(false) }
  }, [boxCenter, flyCameraRef])

  // Face drag for resizing via ray-plane intersection
  useEffect(() => {
    if (!draggingFace || !boxCenter) return

    const axisChar = draggingFace[1] as 'x' | 'y' | 'z'
    const axisIndex = axisChar === 'x' ? 0 : (axisChar === 'y' ? 1 : 2)
    const rc = new THREE.Raycaster()

    const onMove = (e: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)

      // Build a plane through boxCenter that contains the drag axis
      // and is as perpendicular to the view direction as possible
      const axis = new THREE.Vector3()
      axis.setComponent(axisIndex, 1)

      const viewDir = camera.getWorldDirection(new THREE.Vector3())
      const planeNormal = new THREE.Vector3().crossVectors(axis, viewDir).cross(axis)
      if (planeNormal.lengthSq() < 1e-6) planeNormal.copy(viewDir)
      planeNormal.normalize()

      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, boxCenter)
      const hit = new THREE.Vector3()
      if (rc.ray.intersectPlane(plane, hit)) {
        const dist = Math.abs(hit.getComponent(axisIndex) - boxCenter.getComponent(axisIndex))
        const newAxisSize = Math.max(0.05, dist * 2)
        setBoxSize(prev => {
          const next = prev.clone()
          next.setComponent(axisIndex, newAxisSize)
          return next
        })
      }
    }

    const onUp = () => {
      setDraggingFace(null)
    }

    globalThis.addEventListener('pointermove', onMove)
    globalThis.addEventListener('pointerup', onUp)
    return () => {
      globalThis.removeEventListener('pointermove', onMove)
      globalThis.removeEventListener('pointerup', onUp)
    }
  }, [draggingFace, boxCenter, gl, camera, flyCameraRef])

  // Count points/triangles inside box (throttled)
  const countFrameRef = useRef(0)
  useFrame(() => {
    if (!boxCenter || !boxSelectMode) return
    countFrameRef.current += 1
    if (countFrameRef.current % 15 !== 0) return // every ~0.25s at 60fps

    const box = new THREE.Box3(
      boxCenter.clone().sub(boxSize.clone().multiplyScalar(0.5)),
      boxCenter.clone().add(boxSize.clone().multiplyScalar(0.5)),
    )

    let count = 0

    // Count point cloud points
    const geo = pointCloudGeoRef.current
    if (geo) {
      const pos = geo.geometry.getAttribute('position')
      const mat = geo.matrixWorld
      const v = new THREE.Vector3()
      const sampleStride = Math.max(1, Math.floor(geo.count / 10_000))
      for (let i = 0; i < geo.count; i += sampleStride) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mat)
        if (box.containsPoint(v)) count += 1
      }
      if (sampleStride > 1) count *= sampleStride
    }

    // Count mesh triangles
    for (const surf of surfaces) {
      if (!surf.worldTriangles) continue
      const wt = surf.worldTriangles
      const triCount = Math.floor(wt.length / 9)
      for (let t = 0; t < triCount; t++) {
        const cx = (wt[t*9] + wt[t*9+3] + wt[t*9+6]) / 3
        const cy = (wt[t*9+1] + wt[t*9+4] + wt[t*9+7]) / 3
        const cz = (wt[t*9+2] + wt[t*9+5] + wt[t*9+8]) / 3
        if (box.containsPoint(new THREE.Vector3(cx, cy, cz))) count += 1
      }
    }

    setPointsInside(count)
  })

  // Delete everything inside the box
  const handleDelete = useCallback(() => {
    if (!boxCenter) return

    const box = new THREE.Box3(
      boxCenter.clone().sub(boxSize.clone().multiplyScalar(0.5)),
      boxCenter.clone().add(boxSize.clone().multiplyScalar(0.5)),
    )

    // Delete point cloud points
    const geo = pointCloudGeoRef.current
    if (geo) {
      const posAttr = geo.geometry.getAttribute('position')
      const colorAttr = geo.geometry.getAttribute('color')
      const mat = geo.matrixWorld
      const v = new THREE.Vector3()

      // Zero out points inside box (move to origin = effectively hide)
      let deleted = 0
      for (let i = 0; i < geo.count; i++) {
        v.fromBufferAttribute(posAttr, i).applyMatrix4(mat)
        if (box.containsPoint(v)) {
          posAttr.setXYZ(i, 0, 0, 0)
          if (colorAttr) colorAttr.setXYZ(i, 0, 0, 0)
          deleted += 1
        }
      }
      if (deleted > 0) {
        posAttr.needsUpdate = true
        if (colorAttr) colorAttr.needsUpdate = true
        console.log(`[BoxSelect] Deleted ${deleted} points from point cloud`)
      }
    }

    // Delete mesh triangles from detected surfaces
    for (const surf of surfaces) {
      if (!surf.worldTriangles) continue
      const wt = surf.worldTriangles
      const triCount = Math.floor(wt.length / 9)
      const keep: number[] = []

      for (let t = 0; t < triCount; t++) {
        const base = t * 9
        const cx = (wt[base] + wt[base+3] + wt[base+6]) / 3
        const cy = (wt[base+1] + wt[base+4] + wt[base+7]) / 3
        const cz = (wt[base+2] + wt[base+5] + wt[base+8]) / 3
        if (!box.containsPoint(new THREE.Vector3(cx, cy, cz))) {
          for (let k = 0; k < 9; k++) keep.push(wt[base + k])
        }
      }

      if (keep.length < wt.length) {
        updateSurfaceGeometry(surf.id, new Float32Array(keep))
      }
    }

    // Delete triangles from actual mesh objects
    const meshObj = meshObjectRef.current
    if (meshObj) {
      meshObj.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const meshGeo = child.geometry as THREE.BufferGeometry
        if (!meshGeo) return
        const posAttr = meshGeo.getAttribute('position') as THREE.BufferAttribute
        if (!posAttr) return
        const index = meshGeo.index
        const mat = child.matrixWorld

        const triCount = index ? index.count / 3 : posAttr.count / 3
        const keepIndices: number[] = []
        const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3()

        for (let t = 0; t < triCount; t++) {
          const ia = index ? index.getX(t*3) : t*3
          const ib = index ? index.getX(t*3+1) : t*3+1
          const ic = index ? index.getX(t*3+2) : t*3+2

          va.fromBufferAttribute(posAttr, ia).applyMatrix4(mat)
          vb.fromBufferAttribute(posAttr, ib).applyMatrix4(mat)
          vc.fromBufferAttribute(posAttr, ic).applyMatrix4(mat)

          const cx = (va.x + vb.x + vc.x) / 3
          const cy = (va.y + vb.y + vc.y) / 3
          const cz = (va.z + vb.z + vc.z) / 3

          if (!box.containsPoint(new THREE.Vector3(cx, cy, cz))) {
            keepIndices.push(ia, ib, ic)
          }
        }

        if (keepIndices.length < (index ? index.count : posAttr.count)) {
          meshGeo.setIndex(keepIndices)
          if (meshGeo.index) meshGeo.index.needsUpdate = true
          console.log(`[BoxSelect] Removed ${triCount - keepIndices.length / 3} triangles from mesh`)
        }
      })
    }

    // Reset box
    setBoxCenter(null)
    setBoxSelectMode(false)
  }, [boxCenter, boxSize, pointCloudGeoRef, meshObjectRef, surfaces, updateSurfaceGeometry, setBoxSelectMode])

  // Reset when mode deactivated
  useEffect(() => {
    if (!boxSelectMode) setBoxCenter(null)
  }, [boxSelectMode])

  if (!boxSelectMode) return null

  // Before box is placed, show hint
  if (!boxCenter) {
    return (
      <Html center position={[0, 0, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15,15,25,0.9)', color: '#e0e0e0',
          padding: '8px 16px', borderRadius: 8, fontSize: 13,
          fontFamily: 'system-ui', whiteSpace: 'nowrap',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          Click on the model to place the selection box
        </div>
      </Html>
    )
  }

  const handleSize = Math.max(boxSize.x, boxSize.y, boxSize.z) * 0.06

  // Face handle positions (relative to center)
  const faces: { id: string; pos: [number, number, number]; color: string }[] = [
    { id: '+x', pos: [boxSize.x / 2, 0, 0], color: '#ef4444' },
    { id: '-x', pos: [-boxSize.x / 2, 0, 0], color: '#ef4444' },
    { id: '+y', pos: [0, boxSize.y / 2, 0], color: '#22c55e' },
    { id: '-y', pos: [0, -boxSize.y / 2, 0], color: '#22c55e' },
    { id: '+z', pos: [0, 0, boxSize.z / 2], color: '#3b82f6' },
    { id: '-z', pos: [0, 0, -boxSize.z / 2], color: '#3b82f6' },
  ]

  return (
    <>
      {/* Semi-transparent box */}
      <mesh
        position={boxCenter.toArray()}
        userData={{ isBoxSelect: true }}
        ref={boxRef}
      >
        <boxGeometry args={[boxSize.x, boxSize.y, boxSize.z]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.12} depthTest={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Wireframe edges */}
      <lineSegments position={boxCenter.toArray()} userData={{ isBoxSelect: true }}>
        <edgesGeometry args={[new THREE.BoxGeometry(boxSize.x, boxSize.y, boxSize.z)]} />
        <lineBasicMaterial color="#ef4444" transparent opacity={0.6} />
      </lineSegments>

      {/* Drag handles on each face */}
      {faces.map(f => (
        <mesh
          key={f.id}
          position={[
            boxCenter.x + f.pos[0],
            boxCenter.y + f.pos[1],
            boxCenter.z + f.pos[2],
          ]}
          userData={{ isBoxSelect: true }}
          onPointerDown={(e) => {
            e.stopPropagation()
            setDraggingFace(f.id)
          }}
        >
          <sphereGeometry args={[handleSize, 8, 8]} />
          <meshBasicMaterial color={f.color} transparent opacity={0.8} depthTest={false} />
        </mesh>
      ))}

      {/* Action bar — fixed at bottom center of screen */}
      <Html center position={[0, 0, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 8, alignItems: 'center', pointerEvents: 'auto',
          background: 'rgba(15,15,25,0.95)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10, padding: '6px 14px', fontFamily: 'system-ui', fontSize: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)', whiteSpace: 'nowrap',
        }}>
          <span style={{ color: '#999', marginRight: 4 }}>
            {pointsInside > 0 ? `~${pointsInside.toLocaleString()} items` : 'Resize with handles'}
          </span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pointsInside === 0}
            style={{
              padding: '4px 12px', borderRadius: 6, border: 'none',
              background: pointsInside > 0 ? '#ef4444' : '#333',
              color: '#fff', cursor: pointsInside > 0 ? 'pointer' : 'default',
              fontSize: 12, fontWeight: 600, opacity: pointsInside > 0 ? 1 : 0.4,
            }}
          >
            🗑 Delete
          </button>
          <button
            type="button"
            onClick={() => { setBoxCenter(null); setBoxSelectMode(false) }}
            style={{
              padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent', color: '#999', cursor: 'pointer', fontSize: 12,
            }}
          >
            Cancel
          </button>
        </div>
      </Html>
    </>
  )
}
