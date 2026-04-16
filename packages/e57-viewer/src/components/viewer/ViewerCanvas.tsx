

import { Suspense, useCallback, useRef, useState, useEffect, lazy } from 'react'
import { Canvas } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, Grid } from '@react-three/drei'
import { useViewer } from '../../lib/viewerState'
import { useUnits } from '../../lib/units'
import { useToast } from '../../lib/toast'
import { useConfig } from '../../config'
import { exportSurfacesCSV } from '../../lib/exportCSV'
import PointCloud from './PointCloud'
import MeshModel from './MeshModel'
import FlyCamera from './FlyCamera';
import type { FlyCameraHandle } from './FlyCamera';
import Toolbar from './Toolbar'
import HeaderBar from './HeaderBar'
import RightPanel from './RightPanel'
import CameraViewBridge, { triggerCameraView, triggerScreenshot } from './CameraViewBridge'
import FPSMonitor, { useFPSCallback } from './FPSMonitor'
import DragDropZone from './DragDropZone'
import WelcomeScreen from './WelcomeScreen'
import ModelContextCard from './ModelContextCard'

// Lazy-loaded feature components (only loaded when their feature is enabled)
const MeshOverlay = lazy(() => import('./MeshOverlay'))
const MeasureTool = lazy(() => import('./MeasureTool'))
const SurfacePanel = lazy(() => import('./SurfacePanel'))
const SurfaceMeshOverlay = lazy(() => import('./SurfaceMeshOverlay'))
const SurfacePicker = lazy(() => import('./SurfacePicker'))
const SurfaceTooltip = lazy(() => import('./SurfaceTooltip'))
const LassoTool = lazy(() => import('./LassoTool'))
const LassoOverlay = lazy(() => import('./LassoOverlay'))
const BoxSelectTool = lazy(() => import('./BoxSelectTool'))
const LightSimulation = lazy(() => import('./LightSimulation'))
const PositioningGizmo = lazy(() => import('./PositioningGizmo'))
const MeasureHintBar = lazy(() => import('./MeasureHintBar'))
const MeasurementPanel = lazy(() => import('./MeasurementPanel'))
const ShortcutsOverlay = lazy(() => import('./ShortcutsOverlay'))
const OrthoViewport = lazy(() => import('./OrthoViewport'))

type OrthoDirection = 'top' | 'front' | 'left'

function SceneGrid() {
  const { bbox } = useViewer()
  const span = bbox ? Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, bbox.maxZ - bbox.minZ) : 10
  const cellSize = 10 ** Math.floor(Math.log10(span / 10))

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

/** Maximize / minimize button overlay for the perspective quadrant */
function ViewportLabel({
  label,
  isMaximized,
  onToggle,
}: {
  label: string
  isMaximized: boolean
  onToggle: () => void
}) {
  return (
    <>
      <div className="pointer-events-none absolute left-3 top-2 z-30 select-none text-[10px] font-semibold uppercase tracking-wider text-white/40">
        {label}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2 top-1.5 z-30 flex h-6 w-6 items-center justify-center rounded bg-white/[0.04] text-white/30 transition-colors hover:bg-white/[0.10] hover:text-white/70"
        title={isMaximized ? 'Back to grid' : 'Maximize'}
      >
        {isMaximized ? (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3">
            <path d="M6 2v4H2M10 14v-4h4M2 10h4v4M14 6h-4V2" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3">
            <path d="M2 6V2h4M14 10v4h-4M2 10v4h4M10 2h4v4" />
          </svg>
        )}
      </button>
    </>
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
    viewLayout, setViewLayout,
    maximizedView, setMaximizedView,
  } = useViewer()
  const { unitSystem } = useUnits()
  const { addToast } = useToast()
  const { features } = useConfig()
  const isActive = streamStatus === 'streaming' || streamStatus === 'done'
  const isDone = streamStatus === 'done'
  const isMesh = fileType && fileType !== 'e57'
  const flyCameraRef = useRef<FlyCameraHandle>(null)
  const fpsCallback = useFPSCallback()

  const [showShortcuts, setShowShortcuts] = useState(false)

  // Layout helpers
  const isQuad = viewLayout === 'quad'
  const isQuadGrid = isQuad && !maximizedView
  const orthoMaximized = isQuad && maximizedView && maximizedView !== 'perspective'
    ? (maximizedView as OrthoDirection)
    : null

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
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable) return

      if (e.key === '?') { setShowShortcuts((v) => !v); return }
      if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return }
        // In quad mode, Escape with a maximized view minimizes it first
        if (maximizedView) { setMaximizedView(null); return }
        setMeasureActive(false)
        setPickSurfaceMode(false)
        setLassoMode(false)
        setPositioningMode(false)
        setBoxSelectMode(false)
        return
      }

      if (!isDone) return

      // Quad view toggle
      if (e.key === 'g' || e.key === 'G') {
        setViewLayout(viewLayout === 'single' ? 'quad' : 'single')
        return
      }

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
      }
    }

    globalThis.addEventListener('keydown', handler)
    return () => globalThis.removeEventListener('keydown', handler)
  }, [isDone, isMesh, measureActive, pickSurfaceMode, lassoMode, positioningMode, meshVisible, surfaces.length, showShortcuts,
    setMeasureActive, setPickSurfaceMode, setLassoMode, setPositioningMode, setMeshVisible, handleScreenshot,
    viewLayout, setViewLayout, maximizedView, setMaximizedView])

  // Perspective container positioning
  const perspClasses = isQuadGrid
    ? 'absolute right-0 bottom-0 w-1/2 h-1/2'
    : (orthoMaximized
      ? 'absolute right-0 bottom-0 w-px h-px overflow-hidden opacity-0'
      : 'absolute inset-0')

  return (
    <div className="flex h-full flex-col">
      {/* Top header bar */}
      <HeaderBar />

      <div className="flex min-h-0 flex-1">
        {/* Left toolbar */}
        <Toolbar
          onShowShortcuts={() => setShowShortcuts(true)}
        />

        {/* Viewport area */}
        <div className="relative min-w-0 flex-1 overflow-hidden bg-[#0d1117]">
          {!isActive && <WelcomeScreen />}

          {/* ── Ortho viewports (quad grid mode) ── */}
          {isQuadGrid && (
            <>
              <div className="absolute left-0 top-0 h-1/2 w-1/2" style={{ borderRight: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <OrthoViewport direction="top" onMaximize={() => setMaximizedView('top')} />
              </div>
              <div className="absolute right-0 top-0 h-1/2 w-1/2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <OrthoViewport direction="front" onMaximize={() => setMaximizedView('front')} />
              </div>
              <div className="absolute bottom-0 left-0 h-1/2 w-1/2" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                <OrthoViewport direction="left" onMaximize={() => setMaximizedView('left')} />
              </div>
            </>
          )}

          {/* ── Maximized ortho view (fills entire viewport) ── */}
          {orthoMaximized && (
            <div className="absolute inset-0 z-20">
              <OrthoViewport
                direction={orthoMaximized}
                isMaximized
                onMinimize={() => setMaximizedView(null)}
              />
            </div>
          )}

          {/* ── Perspective view (always in DOM, resized via CSS) ── */}
          <div className={perspClasses}>
            {/* Quad-mode label + maximize/minimize button */}
            {isQuad && !orthoMaximized && (
              <ViewportLabel
                label="PERSPECTIVE"
                isMaximized={maximizedView === 'perspective'}
                onToggle={() => setMaximizedView(maximizedView === 'perspective' ? null : 'perspective')}
              />
            )}

            <Canvas
              camera={{ position: [8, 6, 12], fov: 55, near: 0.001, far: 100_000 }}
              gl={{ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
              shadows={lightSimulation}
              style={{ background: '#0d1117' }}
            >
              {/* Default flat lighting (off when light simulation is active) */}
              {!lightSimulation && <ambientLight intensity={1} />}
              {!lightSimulation && <directionalLight position={[10, 10, 5]} intensity={1.2} />}
              {!lightSimulation && <directionalLight position={[-8, 6, -10]} intensity={0.4} />}

              {/* Realistic light simulation with shadows */}
              {lightSimulation && <LightSimulation />}

              <Suspense fallback={null}>
                {isMesh ? (
                  <MeshModel flyCameraRef={flyCameraRef} />
                ) : (
                  <>
                    <PointCloud flyCameraRef={flyCameraRef} />
                    {features.meshReconstruction && <MeshOverlay />}
                  </>
                )}
                <SceneGrid />
                {features.surfaceDetection && <SurfaceMeshOverlay />}
                {features.measurements && <MeasureTool flyCameraRef={flyCameraRef} />}
                {features.surfaceDetection && <SurfacePicker flyCameraRef={flyCameraRef} />}
                {features.positioning && <PositioningGizmo />}
                {features.lassoSelection && <LassoTool />}
                {features.boxSelection && <BoxSelectTool flyCameraRef={flyCameraRef} />}
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

            {/* Viewport overlays */}
            {features.surfaceDetection && <SurfacePanel />}
            {features.measurements && <MeasurementPanel />}
            {features.surfaceDetection && <SurfaceTooltip />}
            {features.lassoSelection && <LassoOverlay />}
            <ModelContextCard />
            {features.measurements && <MeasureHintBar />}

            {/* File upload (bottom-center) */}
            {features.fileUpload && (
              <div className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2">
                <DragDropZone />
              </div>
            )}
          </div>
        </div>

        {/* Right properties panel */}
        <RightPanel onScreenshot={handleScreenshot} onExportCSV={handleExportCSV} />
      </div>

      {/* Shortcuts overlay */}
      {features.shortcuts && <ShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />}
    </div>
  )
}
