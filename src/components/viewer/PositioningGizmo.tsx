'use client'

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useViewer } from '../../lib/viewerState.js'

export default function PositioningGizmo() {
  const {
    positioningMode,
    setModelClickPos,
    applyObjectRotation,
    meshObjectRef,
    measureActive, pickSurfaceMode,
    fileType, streamStatus,
  } = useViewer()

  const { gl, camera, scene } = useThree()

  // Click listener — open context card when model is clicked (not surface overlay, not special modes)
  useEffect(() => {
    if (streamStatus !== 'done') return
    const isMesh = fileType && fileType !== 'e57'
    if (!isMesh) return

    const handler = (e: MouseEvent) => {
      if (positioningMode || measureActive || pickSurfaceMode) return

      const rect = gl.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
      const hits = raycaster.intersectObjects(scene.children, true)
        .filter(h => h.object instanceof THREE.Mesh)

      if (hits.length === 0) { setModelClickPos(null); return }
      // If topmost hit is a surface overlay, don't open context card
      if (hits[0].object.userData.isSurfaceOverlay) { setModelClickPos(null); return }
      // Check if any hit is a descendant of the model group
      const modelHit = hits.find(h => {
        let node: THREE.Object3D | null = h.object
        while (node) {
          if (node === meshObjectRef.current) return true
          node = node.parent
        }
        return false
      })
      if (!modelHit) { setModelClickPos(null); return }
      setModelClickPos({ x: e.clientX, y: e.clientY })
    }

    gl.domElement.addEventListener('click', handler)
    return () => gl.domElement.removeEventListener('click', handler)
  }, [gl, camera, scene, positioningMode, measureActive, pickSurfaceMode, fileType, streamStatus, setModelClickPos, meshObjectRef])

  // Compute bbox (always, but only used when positioningMode)
  const obj = meshObjectRef.current
  let center = new THREE.Vector3(0, 3, 0)
  let radius = 5
  if (obj) {
    const bbox = new THREE.Box3().setFromObject(obj)
    bbox.getCenter(center)
    const size = bbox.getSize(new THREE.Vector3())
    radius = Math.max(size.x, size.y, size.z) * 0.6 + 1
  }

  if (!positioningMode) return null

  const cx = center.x, cy = center.y, cz = center.z

  return (
    <>
      {/* X ring — in YZ plane (rotate around X), red */}
      <mesh position={[cx, cy, cz]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[radius, 0.04, 8, 64]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.8} depthWrite={false} />
      </mesh>
      {/* Y ring — in XZ plane (rotate around Y), green */}
      <mesh position={[cx, cy, cz]}>
        <torusGeometry args={[radius, 0.04, 8, 64]} />
        <meshBasicMaterial color="#22c55e" transparent opacity={0.8} depthWrite={false} />
      </mesh>
      {/* Z ring — in XY plane (rotate around Z), blue */}
      <mesh position={[cx, cy, cz]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, 0.04, 8, 64]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.8} depthWrite={false} />
      </mesh>

      {/* X buttons at ±Z */}
      <Html position={[cx, cy, cz + radius]} center zIndexRange={[200, 0]}>
        <GizmoBtn label="+90° X" color="#ef4444" onClick={() => applyObjectRotation('x', 90)} />
      </Html>
      <Html position={[cx, cy, cz - radius]} center zIndexRange={[200, 0]}>
        <GizmoBtn label="−90° X" color="#ef4444" onClick={() => applyObjectRotation('x', -90)} />
      </Html>
      {/* Y buttons at ±X */}
      <Html position={[cx + radius, cy, cz]} center zIndexRange={[200, 0]}>
        <GizmoBtn label="+90° Y" color="#22c55e" onClick={() => applyObjectRotation('y', 90)} />
      </Html>
      <Html position={[cx - radius, cy, cz]} center zIndexRange={[200, 0]}>
        <GizmoBtn label="−90° Y" color="#22c55e" onClick={() => applyObjectRotation('y', -90)} />
      </Html>
      {/* Z buttons at ±Y */}
      <Html position={[cx, cy + radius, cz]} center zIndexRange={[200, 0]}>
        <GizmoBtn label="+90° Z" color="#3b82f6" onClick={() => applyObjectRotation('z', 90)} />
      </Html>
      <Html position={[cx, cy - radius, cz]} center zIndexRange={[200, 0]}>
        <GizmoBtn label="−90° Z" color="#3b82f6" onClick={() => applyObjectRotation('z', -90)} />
      </Html>
    </>
  )
}

function GizmoBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        background: 'rgba(0,0,0,0.80)',
        border: `2px solid ${color}`,
        color,
        borderRadius: 20,
        padding: '4px 12px',
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
        backdropFilter: 'blur(6px)',
        whiteSpace: 'nowrap',
        pointerEvents: 'auto',
        userSelect: 'none',
        boxShadow: `0 0 8px ${color}55`,
      }}
    >
      {label}
    </button>
  )
}
