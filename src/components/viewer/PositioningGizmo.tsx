'use client'

import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useViewer } from '../../lib/viewerState.js'

export default function PositioningGizmo() {
  const {
    positioningMode,
    applyObjectRotation,
    meshObjectRef,
  } = useViewer()

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
