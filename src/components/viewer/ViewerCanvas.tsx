'use client'

import { Suspense, useCallback, useRef, useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, Grid } from '@react-three/drei'
import { useViewer } from '../../lib/viewerState.js'
import { useUnits } from '../../lib/units.js'
import { useToast } from '../../lib/toast.js'
import { exportSurfacesCSV } from '../../lib/exportCSV.js'
import PointCloud from './PointCloud.js'
import MeshOverlay from './MeshOverlay.js'
import MeshModel from './MeshModel.js'
import MeasureTool from './MeasureTool.js'
import FlyCamera, { type FlyCameraHandle } from './FlyCamera.js'
import SurfacePanel from './SurfacePanel.js'
import SurfaceMeshOverlay from './SurfaceMeshOverlay.js'
import SurfacePicker from './SurfacePicker.js'
import SurfaceTooltip from './SurfaceTooltip.js'
import LassoTool from './LassoTool.js'
import LassoOverlay from './LassoOverlay.js'
import BoxSelectTool from './BoxSelectTool.js'
import LightSimulation from './LightSimulation.js'
import PositioningGizmo from './PositioningGizmo.js'
import ModelContextCard from './ModelContextCard.js'
import Toolbar from './Toolbar.js'
import HeaderBar from './HeaderBar.js'
import RightPanel from './RightPanel.js'
import ShortcutsOverlay from './ShortcutsOverlay.js'
import CameraViewBridge, { triggerCameraView, triggerScreenshot } from './CameraViewBridge.js'
import FPSMonitor, { useFPSCallback } from './FPSMonitor.js'
import DragDropZone from './DragDropZone.js'
import WelcomeScreen from './WelcomeScreen.js'
import MeasureHintBar from './MeasureHintBar.js'

function SceneGrid() {
  const { bbox } = useViewer()
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
  const {
    streamStatus, fileType, surfaces, surfaceGroups,
    measureActive, setMeasureActive,
    pickSurfaceMode, setPickSurfaceMode,
    lassoMode, setLassoMode,
    positioningMode, setPositioningMode,
    meshVisible, setMeshVisible,
    boxSelectMode, setBoxSelectMode,
    lightSimulation,
  } = useViewer()
  const { unitSystem } = useUnits()
  const { addToast } = useToast()
  const isActive = streamStatus === 'streaming' || streamStatus === 'done'
  const isDone = streamStatus === 'done'
  const isMesh = fileType && fileType !== 'e57'
  const flyCameraRef = useRef<FlyCameraHandle>(null)
  const fpsCallback = useFPSCallback()

  const [showShortcuts, setShowShortcuts] = useState(false)

  // Screenshot handler
  const handleScreenshot = useCallback(() => {
    triggerScreenshot()
    addToast('Screenshot saved', 'success', 2500)
  }, [addToast])

  // CSV export handler
  const handleExportCSV = useCallback(() => {
    if (surfaces.length === 0) return
    exportSurfacesCSV(surfaces, surfaceGroups, unitSystem)
    addToast(`Exported ${surfaces.length} surfaces as CSV`, 'success', 3000)
  }, [surfaces, surfaceGroups, unitSystem, addToast])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in input
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === '?') { setShowShortcuts((v) => !v); return }
      if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return }
        setMeasureActive(false)
        setPickSurfaceMode(false)
        setLassoMode(false)
        setPositioningMode(false)
        setBoxSelectMode(false)
        return
      }

      if (!isDone) return

      // Tool shortcuts
      if (e.key === 'v' || e.key === 'V') {
        setMeasureActive(false); setPickSurfaceMode(false); setLassoMode(false); setBoxSelectMode(false); return
      }
      if (e.key === 'm' || e.key === 'M') { setMeasureActive(!measureActive); return }
      if ((e.key === 'f' || e.key === 'F') && isMesh) { setPickSurfaceMode(!pickSurfaceMode); return }
      if ((e.key === 'l' || e.key === 'L') && isMesh && surfaces.length > 0) { setLassoMode(!lassoMode); return }
      if ((e.key === 'b' || e.key === 'B') && isDone) { setBoxSelectMode(!boxSelectMode); return }
      if ((e.key === 'p' || e.key === 'P') && isMesh && meshVisible) { setPositioningMode(!positioningMode); return }
      if ((e.key === 'h' || e.key === 'H') && isMesh) { setMeshVisible(!meshVisible); return }

      // Camera view presets
      if (e.code === 'Numpad1') { triggerCameraView('front'); return }
      if (e.code === 'Numpad3') { triggerCameraView('right'); return }
      if (e.code === 'Numpad7') { triggerCameraView('top'); return }
      if (e.code === 'Numpad5') { triggerCameraView('iso'); return }
      if (e.key === '0') { triggerCameraView('fit'); return }

      // Screenshot
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        handleScreenshot()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isDone, isMesh, measureActive, pickSurfaceMode, lassoMode, positioningMode, meshVisible, surfaces.length, showShortcuts,
    setMeasureActive, setPickSurfaceMode, setLassoMode, setPositioningMode, setMeshVisible, handleScreenshot])

  return (
    <div className="flex h-full flex-col">
      {/* Top header bar */}
      <HeaderBar />

      <div className="flex min-h-0 flex-1">
        {/* Left toolbar */}
        <Toolbar
          onShowShortcuts={() => setShowShortcuts(true)}
        />

        {/* Viewport */}
        <div className="relative min-w-0 flex-1 overflow-hidden bg-[#0d1117]">
          {!isActive && <WelcomeScreen />}

          <Canvas
            camera={{ position: [8, 6, 12], fov: 55, near: 0.001, far: 100_000 }}
            gl={{ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
            shadows={lightSimulation}
            style={{ background: '#0d1117' }}
          >
            {/* Default flat lighting (off when light simulation is active) */}
            {!lightSimulation && <ambientLight intensity={0.4} />}
            {!lightSimulation && <directionalLight position={[10, 10, 5]} intensity={0.8} />}

            {/* Realistic light simulation with shadows */}
            {lightSimulation && <LightSimulation />}

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
              <PositioningGizmo />
              <LassoTool />
              <BoxSelectTool flyCameraRef={flyCameraRef} />
              <CameraViewBridge flyCameraRef={flyCameraRef} />
              <FPSMonitor onFPS={fpsCallback} />
            </Suspense>

            <FlyCamera ref={flyCameraRef} />

            <GizmoHelper alignment="top-right" margin={[60, 60]}>
              <GizmoViewport
                axisColors={['#e05b4b', '#4fb8b2', '#6da8f5']}
                labelColor="white"
              />
            </GizmoHelper>
          </Canvas>

          {/* Minimal viewport overlays */}
          <SurfaceTooltip />
          <LassoOverlay />
          <ModelContextCard />
          <MeasureHintBar />

          {/* File upload (bottom-center) */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30">
            <DragDropZone />
          </div>
        </div>

        {/* Right properties panel */}
        <RightPanel onScreenshot={handleScreenshot} onExportCSV={handleExportCSV} />

        {/* Surface panel (still its own component due to complexity) */}
        <SurfacePanel />
      </div>

      {/* Shortcuts overlay */}
      <ShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  )
}
