'use client'

import { Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, Grid } from '@react-three/drei'
import { useViewer } from '../../lib/viewerState.js'
import PointCloud from './PointCloud.js'
import MeshOverlay from './MeshOverlay.js'
import MeshModel from './MeshModel.js'
import MeasureTool from './MeasureTool.js'
import ViewerControls from './ViewerControls.js'
import FlyCamera, { type FlyCameraHandle } from './FlyCamera.js'
import SurfacePanel from './SurfacePanel.js'
import SurfaceMeshOverlay from './SurfaceMeshOverlay.js'
import SurfacePicker from './SurfacePicker.js'

function SceneGrid() {
  const { bbox } = useViewer()
  // Scale cell size to the scene: 1m cells for a 10m scene, 0.01m for 0.1m scene
  const span = bbox ? Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, bbox.maxZ - bbox.minZ) : 10
  const cellSize = Math.pow(10, Math.floor(Math.log10(span / 10)))

  return (
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
  )
}

export default function ViewerCanvas() {
  const { streamStatus, fileType } = useViewer()
  const isActive = streamStatus === 'streaming' || streamStatus === 'done'
  const isMesh = fileType && fileType !== 'e57'
  const flyCameraRef = useRef<FlyCameraHandle>(null)

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[#0d1117]">
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center text-white/20 text-sm select-none pointer-events-none">
          Drop an E57 file to begin
        </div>
      )}

      <Canvas
        camera={{ position: [8, 6, 12], fov: 55, near: 0.001, far: 100_000 }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        style={{ background: '#0d1117' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />

        <Suspense fallback={null}>
          {isMesh ? (
            <MeshModel flyCameraRef={flyCameraRef} />
          ) : (
            <>
              <PointCloud flyCameraRef={flyCameraRef} />
              <MeshOverlay />
            </>
          )}
          <SceneGrid />
          <SurfaceMeshOverlay />
          <MeasureTool flyCameraRef={flyCameraRef} />
          <SurfacePicker flyCameraRef={flyCameraRef} />
        </Suspense>

        <FlyCamera ref={flyCameraRef} />

        <GizmoHelper alignment="top-right" margin={[60, 60]}>
          <GizmoViewport
            axisColors={['#e05b4b', '#4fb8b2', '#6da8f5']}
            labelColor="white"
          />
        </GizmoHelper>
      </Canvas>

      <ViewerControls />
      <SurfacePanel />
    </div>
  )
}
