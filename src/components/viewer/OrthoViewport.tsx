'use client'

import { useEffect, useRef, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import { useViewer } from '../../lib/viewerState.js'

export type OrthoDirection = 'top' | 'front' | 'left'

interface OrthoViewportProps {
  direction: OrthoDirection
  isMaximized?: boolean
  onMaximize?: () => void
  onMinimize?: () => void
}

const LABELS: Record<OrthoDirection, string> = { top: 'TOP', front: 'FRONT', left: 'LEFT' }

/* ── R3F scene content for one ortho viewport ── */

function OrthoScene({ direction }: { direction: OrthoDirection }) {
  const { meshObjectRef, bbox, streamStatus } = useViewer()
  const { camera, size } = useThree()
  const groupRef = useRef<THREE.Group>(null!)
  const controlsRef = useRef<any>(null)
  const isDone = streamStatus === 'done'

  // World-space bounding box (same transform MeshModel applies)
  const worldBox = useMemo(() => {
    if (!isDone) return new THREE.Box3(new THREE.Vector3(-5, -5, -5), new THREE.Vector3(5, 5, 5))
    const obj = meshObjectRef.current
    if (obj) {
      obj.updateMatrixWorld(true)
      return new THREE.Box3().setFromObject(obj)
    }
    if (bbox) {
      const sx = bbox.maxX - bbox.minX
      const sy = bbox.maxY - bbox.minY
      const sz = bbox.maxZ - bbox.minZ
      return new THREE.Box3(
        new THREE.Vector3(-sx / 2, 0, -sy / 2),
        new THREE.Vector3(sx / 2, sz, sy / 2),
      )
    }
    return new THREE.Box3(new THREE.Vector3(-5, -5, -5), new THREE.Vector3(5, 5, 5))
  }, [isDone, bbox, meshObjectRef])

  const center = useMemo(() => worldBox.getCenter(new THREE.Vector3()), [worldBox])
  const boxSize = useMemo(() => worldBox.getSize(new THREE.Vector3()), [worldBox])
  const span = Math.max(boxSize.x, boxSize.y, boxSize.z) || 10

  // Clone model from the main perspective scene
  useEffect(() => {
    const source = meshObjectRef.current
    if (!source || !groupRef.current) return

    // Clear previous clone
    while (groupRef.current.children.length) groupRef.current.remove(groupRef.current.children[0])

    source.updateMatrixWorld(true)
    const clone = source.clone(true)
    groupRef.current.add(clone)

    return () => {
      if (groupRef.current) {
        while (groupRef.current.children.length) groupRef.current.remove(groupRef.current.children[0])
      }
    }
    // bbox reference changes after model load/reload, triggering re-clone
  }, [bbox])

  // Position camera for this direction
  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera
    let projW: number, projH: number

    switch (direction) {
      case 'top':
        projW = boxSize.x || 10
        projH = boxSize.z || 10
        ortho.position.set(center.x, center.y + span * 3, center.z)
        ortho.up.set(0, 0, -1)
        break
      case 'front':
        projW = boxSize.x || 10
        projH = boxSize.y || 10
        ortho.position.set(center.x, center.y, center.z + span * 3)
        ortho.up.set(0, 1, 0)
        break
      case 'left':
        projW = boxSize.z || 10
        projH = boxSize.y || 10
        ortho.position.set(center.x - span * 3, center.y, center.z)
        ortho.up.set(0, 1, 0)
        break
    }

    // Fit model with padding
    const padding = 1.3
    const zoomX = size.width / (projW * padding)
    const zoomY = size.height / (projH * padding)
    ortho.zoom = Math.min(zoomX, zoomY) || 1
    ortho.near = 0.001
    ortho.far = span * 20
    ortho.updateProjectionMatrix()
    ortho.lookAt(center)

    if (controlsRef.current) {
      controlsRef.current.target.copy(center)
      controlsRef.current.update()
    }
  }, [direction, center, boxSize, span, camera, size, isDone])

  // Make left-click = pan (instead of disabled rotate)
  useEffect(() => {
    if (!controlsRef.current) return
    controlsRef.current.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }
  }, [])

  const cellSize = Math.pow(10, Math.floor(Math.log10(span / 10 || 1)))

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableRotate={false}
        enableDamping
        dampingFactor={0.15}
        screenSpacePanning
      />
      <Grid
        position={[0, 0, 0]}
        infiniteGrid
        cellSize={cellSize}
        cellThickness={0.5}
        cellColor="#334155"
        sectionSize={cellSize * 5}
        sectionThickness={1}
        sectionColor="#475569"
        fadeDistance={Math.max(cellSize * 200, 50)}
        fadeStrength={1.2}
      />
      <group ref={groupRef} />
    </>
  )
}

/* ── Outer wrapper with Canvas + DOM overlays ── */

export default function OrthoViewport({ direction, isMaximized, onMaximize, onMinimize }: OrthoViewportProps) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0d1117]">
      {/* View label */}
      <div className="pointer-events-none absolute left-3 top-2 z-10 select-none text-[10px] font-semibold uppercase tracking-wider text-white/40">
        {LABELS[direction]}
      </div>

      {/* Maximize / minimize button */}
      <button
        onClick={isMaximized ? onMinimize : onMaximize}
        className="absolute right-2 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded bg-white/[0.04] text-white/30 transition-colors hover:bg-white/[0.10] hover:text-white/70"
        title={isMaximized ? 'Back to grid' : 'Maximize'}
      >
        {isMaximized ? <MinimizeIcon /> : <MaximizeIcon />}
      </button>

      <Canvas
        orthographic
        camera={{ zoom: 1, near: 0.001, far: 100000, position: [0, 100, 0] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        style={{ background: '#0d1117' }}
      >
        <OrthoScene direction={direction} />
      </Canvas>
    </div>
  )
}

/* ── Icons ── */

function MaximizeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3">
      <path d="M2 6V2h4M14 10v4h-4M2 10v4h4M10 2h4v4" />
    </svg>
  )
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3">
      <path d="M6 2v4H2M10 14v-4h4M2 10h4v4M14 6h-4V2" />
    </svg>
  )
}
