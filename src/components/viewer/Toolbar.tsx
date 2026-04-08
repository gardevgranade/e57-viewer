'use client'

import { useViewer } from '../../lib/viewerState.js'
import { useUnits } from '../../lib/units.js'
import type { UnitSystem } from '../../lib/units.js'

interface ToolbarProps {
  onScreenshot: () => void
  onExportCSV: () => void
  onShowShortcuts: () => void
}

export default function Toolbar({ onScreenshot, onExportCSV, onShowShortcuts }: ToolbarProps) {
  const {
    streamStatus, fileType,
    measureActive, setMeasureActive,
    pickSurfaceMode, setPickSurfaceMode,
    lassoMode, setLassoMode,
    positioningMode, setPositioningMode,
    meshVisible, setMeshVisible,
    showMesh, setShowMesh,
    surfaces,
    boxSelectMode, setBoxSelectMode,
  } = useViewer()
  const { unitSystem, setUnitSystem } = useUnits()

  const isDone = streamStatus === 'done'
  const isMesh = fileType && fileType !== 'e57'
  const hasSurfaces = surfaces.length > 0

  return (
    <div className="flex h-full w-11 flex-col items-center gap-0.5 border-r border-white/[0.06] bg-[#0c1017] py-2">
      {/* === Tools section === */}
      <SectionLabel text="TOOLS" />

      <ToolBtn
        icon={<PointerIcon />}
        label="Select (V)"
        active={!measureActive && !pickSurfaceMode && !lassoMode && !positioningMode && !boxSelectMode}
        onClick={() => {
          setMeasureActive(false)
          setPickSurfaceMode(false)
          setLassoMode(false)
          setBoxSelectMode(false)
        }}
      />

      {isDone && (
        <>
          <ToolBtn
            icon={<RulerIcon />}
            label="Measure (M)"
            active={measureActive}
            onClick={() => setMeasureActive(!measureActive)}
          />

          {isMesh && (
            <>
              <ToolBtn
                icon={<SurfaceIcon />}
                label="Detect Surfaces (F)"
                active={pickSurfaceMode}
                onClick={() => setPickSurfaceMode(!pickSurfaceMode)}
              />

              <ToolBtn
                icon={<LassoIcon />}
                label="Lasso Select (L)"
                active={lassoMode}
                onClick={() => setLassoMode(!lassoMode)}
                disabled={!hasSurfaces}
              />

              <ToolBtn
                icon={<BoxSelectIcon />}
                label="Box Select (B)"
                active={boxSelectMode}
                onClick={() => setBoxSelectMode(!boxSelectMode)}
              />

              <ToolBtn
                icon={<PositionIcon />}
                label="Position Model (P)"
                active={positioningMode}
                onClick={() => setPositioningMode(!positioningMode)}
                disabled={!meshVisible}
              />
            </>
          )}
        </>
      )}

      <div className="my-1 h-px w-6 bg-white/[0.06]" />

      {/* === View section === */}
      <SectionLabel text="VIEW" />

      {isDone && isMesh && (
        <ToolBtn
          icon={<EyeIcon visible={meshVisible} />}
          label={meshVisible ? 'Hide Model (H)' : 'Show Model (H)'}
          onClick={() => setMeshVisible(!meshVisible)}
        />
      )}

      {isDone && !isMesh && (
        <ToolBtn
          icon={<MeshIcon />}
          label="Toggle Mesh"
          active={showMesh}
          onClick={() => setShowMesh(!showMesh)}
        />
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* === Bottom actions === */}
      <div className="my-1 h-px w-6 bg-white/[0.06]" />

      <ToolBtn
        icon={<span className="text-[11px]">{unitSystem === 'metric' ? 'm' : 'ft'}</span>}
        label={`Units: ${unitSystem === 'metric' ? 'Metric' : 'Imperial'}`}
        onClick={() => setUnitSystem(unitSystem === 'metric' ? 'imperial' as UnitSystem : 'metric' as UnitSystem)}
        small
      />

      {isDone && (
        <>
          <ToolBtn icon={<CameraIcon />} label="Screenshot (⌘⇧S)" onClick={onScreenshot} small />
          <ToolBtn icon={<DownloadIcon />} label="Export CSV" onClick={onExportCSV} small disabled={!hasSurfaces} />
        </>
      )}

      <ToolBtn
        icon={<span className="text-[11px]">?</span>}
        label="Keyboard Shortcuts"
        onClick={onShowShortcuts}
        small
      />
    </div>
  )
}

// --- ToolBtn ---

interface ToolBtnProps {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
  disabled?: boolean
  small?: boolean
}

function ToolBtn({ icon, label, active, onClick, disabled, small }: ToolBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={[
        'group relative flex items-center justify-center rounded-lg transition-all',
        small ? 'h-7 w-7' : 'h-8 w-8',
        disabled
          ? 'cursor-not-allowed opacity-30'
          : active
            ? 'bg-indigo-500/20 text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.15)]'
            : 'text-white/50 hover:bg-white/[0.06] hover:text-white/80',
      ].join(' ')}
    >
      <div className={small ? 'h-3.5 w-3.5' : 'h-4 w-4'}>{icon}</div>
      {/* Tooltip */}
      <div className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-[10px] font-medium text-white/80 shadow-lg group-hover:block">
        {label}
      </div>
    </button>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <span className="mb-0.5 text-[7px] font-bold tracking-widest text-white/20">
      {text}
    </span>
  )
}

// --- Icons (16x16 SVGs) ---

function PointerIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-full w-full">
      <path d="M3 1l10 7-4.5 1L6 13.5V8.5L3 1z" />
    </svg>
  )
}

function RulerIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-full w-full">
      <path d="M13.5 5.5L5.5 13.5a1.5 1.5 0 01-2.1 0l-.9-.9a1.5 1.5 0 010-2.1L10.5 2.5a1.5 1.5 0 012.1 0l.9.9a1.5 1.5 0 010 2.1z" />
      <path d="M5 8l1.5 1.5M7 6l1.5 1.5M9 4l1.5 1.5" />
    </svg>
  )
}

function SurfaceIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-full w-full">
      <path d="M2 10l6-8 6 8H2z" />
      <path d="M5 10l3-4 3 4" strokeDasharray="2 1.5" />
    </svg>
  )
}

function LassoIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-full w-full">
      <ellipse cx="8" cy="7" rx="6" ry="4" />
      <path d="M10 10.5c0 1.5-1 3-2 3s-2-.5-2-2" />
    </svg>
  )
}

function PositionIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-full w-full">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 2v3M8 11v3M2 8h3M11 8h3" />
    </svg>
  )
}

function EyeIcon({ visible }: { visible: boolean }) {
  if (!visible) {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-full w-full">
        <path d="M2 2l12 12" />
        <path d="M4.5 6.5C3.2 7.3 2.5 8 2.5 8s2.5 4 5.5 4c.8 0 1.5-.2 2.2-.5M11.5 9.5c.8-.8 1.5-1.5 1.5-1.5s-2.5-4-5.5-4c-.4 0-.8.05-1.2.15" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-full w-full">
      <path d="M2.5 8s2.5-4 5.5-4 5.5 4 5.5 4-2.5 4-5.5 4S2.5 8 2.5 8z" />
      <circle cx="8" cy="8" r="1.5" />
    </svg>
  )
}

function MeshIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-full w-full">
      <path d="M2 12l6-10 6 10H2zM5 9h6" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-full w-full">
      <rect x="2" y="4" width="12" height="9" rx="1.5" />
      <circle cx="8" cy="8.5" r="2.5" />
      <path d="M5.5 4l1-2h3l1 2" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-full w-full">
      <path d="M8 2v8M5 7l3 3 3-3M3 12h10" />
    </svg>
  )
}


function BoxSelectIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-full w-full">
      <rect x="3" y="3" width="10" height="10" strokeDasharray="2 1.5" />
      <path d="M3 3l3-1M13 3l-3-1M3 13l3 1M13 13l-3 1" />
    </svg>
  )
}
