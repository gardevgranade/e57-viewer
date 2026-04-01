'use client'

import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { CameraControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { useViewer } from '../../lib/viewerState.js'
import PointCloud from './PointCloud.js'
import MeshOverlay from './MeshOverlay.js'
import ViewerControls from './ViewerControls.js'

export default function ViewerCanvas() {
  const { streamStatus } = useViewer()
  const isActive = streamStatus === 'streaming' || streamStatus === 'done'

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[#0d1117]">
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center text-white/20 text-sm select-none">
          Point cloud will appear here
        </div>
      )}

      <Canvas
        camera={{ position: [0, -10, 5], fov: 60, near: 0.001, far: 100_000 }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        style={{ background: '#0d1117' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />

        <Suspense fallback={null}>
          <PointCloud />
          <MeshOverlay />
        </Suspense>

        <CameraControls
          makeDefault
          smoothTime={0.15}
          draggingSmoothTime={0}
          minDistance={0.001}
          maxDistance={50_000}
          mouseButtons={{
            left: 1,   // rotate
            middle: 8, // dolly
            right: 2,  // truck (pan)
            wheel: 8,  // dolly
          }}
        />

        <GizmoHelper alignment="top-right" margin={[60, 60]}>
          <GizmoViewport
            axisColors={['#e05b4b', '#4fb8b2', '#6da8f5']}
            labelColor="white"
          />
        </GizmoHelper>
      </Canvas>

      <ViewerControls />
    </div>
  )
}
