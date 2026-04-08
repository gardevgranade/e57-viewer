'use client'

import { useState, useCallback } from 'react'
import { useViewer } from '../../lib/viewerState.js'
import { useUnits } from '../../lib/units.js'
import type { UnitSystem } from '../../lib/units.js'
import type { Quaternion4 } from '../../lib/viewerState.js'
import type { CameraPreset } from './CameraViewPresets.js'
import { triggerCameraView } from './CameraViewBridge.js'

// Orientation presets
const S = Math.SQRT1_2
const ORIENT_PRESETS: { label: string; icon: string; q: Quaternion4 }[] = [
  { label: 'Original',   icon: '🏠', q: [0, 0, 0, 1] },
  { label: 'Flip U/D',   icon: '🔃', q: [1, 0, 0, 0] },
  { label: 'Flip L/R',   icon: '↔️', q: [0, 0, 1, 0] },
  { label: 'Turn 180°',  icon: '🔄', q: [0, 1, 0, 0] },
  { label: 'Rot Left',   icon: '↩️', q: [0, S, 0, S] },
  { label: 'Rot Right',  icon: '↪️', q: [0, -S, 0, S] },
  { label: 'Tilt Fwd',   icon: '⤵️', q: [S, 0, 0, S] },
  { label: 'Tilt Back',  icon: '⤴️', q: [-S, 0, 0, S] },
  { label: 'Roll L',     icon: '↶',  q: [0, 0, S, S] },
  { label: 'Roll R',     icon: '↷',  q: [0, 0, -S, S] },
]

const CAMERA_VIEWS: { preset: CameraPreset; label: string }[] = [
  { preset: 'front', label: 'Front' },
  { preset: 'back',  label: 'Back' },
  { preset: 'left',  label: 'Left' },
  { preset: 'right', label: 'Right' },
  { preset: 'top',   label: 'Top' },
  { preset: 'bottom',label: 'Bottom' },
  { preset: 'iso',   label: 'Iso' },
  { preset: 'fit',   label: 'Fit All' },
]

interface RightPanelProps {
  onScreenshot: () => void
  onExportCSV: () => void
}

export default function RightPanel({ onScreenshot, onExportCSV }: RightPanelProps) {
  const {
    streamStatus, fileType,
    // Point cloud
    pointSize, setPointSize,
    colorMode, setColorMode,
    hasColor, hasIntensity,
    // Lighting
    lightSimulation, setLightSimulation,
    sunPosition, setSunPosition,
    sunIntensity, setSunIntensity,
    ambientIntensity, setAmbientIntensity,
    // Positioning
    setObjectQuaternion, applyObjectRotation,
    moveModelToGround, resetObjectRotation,
    objectQuaternion,
    // Mesh
    meshVisible, setMeshVisible,
    showMesh, setShowMesh,
    surfaces,
    // Measure
    measureSnap, setMeasureSnap,
  } = useViewer()
  const { unitSystem, setUnitSystem } = useUnits()

  const isDone = streamStatus === 'done'
  const isE57 = fileType === 'e57'
  const isMesh = fileType && fileType !== 'e57'

  const [collapsed, setCollapsed] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    settings: true,
    lighting: false,
    camera: false,
    position: false,
  })

  const toggle = (key: string) => setOpenSections(s => ({ ...s, [key]: !s[key] }))

  const applyPreset = useCallback((q: Quaternion4) => {
    setObjectQuaternion(q)
    setTimeout(() => moveModelToGround(), 50)
  }, [setObjectQuaternion, moveModelToGround])

  const isActiveQ = (q: Quaternion4) => {
    const dot = q[0] * objectQuaternion[0] + q[1] * objectQuaternion[1] +
                q[2] * objectQuaternion[2] + q[3] * objectQuaternion[3]
    return Math.abs(Math.abs(dot) - 1) < 0.01
  }

  if (!isDone) return null

  if (collapsed) {
    return (
      <div className="flex h-full w-8 flex-col items-center border-l border-white/[0.06] bg-[#0c1017]">
        <button
          onClick={() => setCollapsed(false)}
          className="mt-2 flex h-6 w-6 items-center justify-center rounded text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition"
          title="Open panel"
        >
          ‹
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full w-60 flex-col border-l border-white/[0.06] bg-[#0c1017] text-xs select-none">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
        <span className="text-[10px] font-bold tracking-widest text-white/30">PROPERTIES</span>
        <button
          onClick={() => setCollapsed(true)}
          className="flex h-5 w-5 items-center justify-center rounded text-white/30 hover:bg-white/[0.06] hover:text-white/60 transition"
        >
          ›
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Settings ── */}
        <Section title="⚙ Settings" open={openSections.settings} onToggle={() => toggle('settings')}>
          {/* Units */}
          <Row label="Units">
            <div className="flex gap-1">
              {(['metric', 'imperial'] as UnitSystem[]).map(u => (
                <button
                  key={u}
                  onClick={() => setUnitSystem(u)}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                    unitSystem === u
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
                  }`}
                >
                  {u === 'metric' ? 'Metric (m)' : 'Imperial (ft)'}
                </button>
              ))}
            </div>
          </Row>

          {/* Visibility */}
          {isMesh && (
            <Row label="Model">
              <button
                onClick={() => setMeshVisible(!meshVisible)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                  meshVisible
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-white/[0.04] text-white/40'
                }`}
              >
                {meshVisible ? '👁 Visible' : '👁‍🗨 Hidden'}
              </button>
            </Row>
          )}

          {isE57 && (
            <Row label="Mesh Overlay">
              <button
                onClick={() => setShowMesh(!showMesh)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                  showMesh
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-white/[0.04] text-white/40'
                }`}
              >
                {showMesh ? 'On' : 'Off'}
              </button>
            </Row>
          )}

          {/* Point cloud settings */}
          {isE57 && (
            <>
              <Row label="Point Size">
                <div className="flex items-center gap-1.5">
                  <input
                    type="range" min={0.5} max={6} step={0.5}
                    value={pointSize}
                    onChange={e => setPointSize(parseFloat(e.target.value))}
                    className="w-20 accent-teal-400"
                  />
                  <span className="w-4 text-right tabular-nums text-white/40">{pointSize}</span>
                </div>
              </Row>
              <Row label="Color Mode">
                <select
                  value={colorMode}
                  onChange={e => setColorMode(e.target.value as 'rgb' | 'intensity' | 'height')}
                  className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/70 outline-none hover:bg-white/10 transition"
                >
                  {hasColor && <option value="rgb">RGB</option>}
                  {hasIntensity && <option value="intensity">Intensity</option>}
                  <option value="height">Height</option>
                  {!hasColor && !hasIntensity && <option value="rgb">Default</option>}
                </select>
              </Row>
            </>
          )}

          {/* Measure snap */}
          <Row label="Measure Snap">
            <button
              onClick={() => setMeasureSnap(!measureSnap)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                measureSnap
                  ? 'bg-yellow-400/20 text-yellow-300'
                  : 'bg-white/[0.04] text-white/40'
              }`}
            >
              🧲 {measureSnap ? 'On' : 'Off'}
            </button>
          </Row>

          {/* Actions */}
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={onScreenshot}
              className="flex-1 rounded bg-white/[0.04] px-2 py-1 text-[10px] text-white/50 hover:bg-white/[0.08] transition"
            >
              📷 Screenshot
            </button>
            <button
              onClick={onExportCSV}
              disabled={surfaces.length === 0}
              className="flex-1 rounded bg-white/[0.04] px-2 py-1 text-[10px] text-white/50 hover:bg-white/[0.08] transition disabled:opacity-30"
            >
              📥 Export CSV
            </button>
          </div>
        </Section>

        {/* ── Lighting ── */}
        <Section title="☀ Lighting" open={openSections.lighting} onToggle={() => toggle('lighting')}>
          <Row label="Simulation">
            <button
              onClick={() => setLightSimulation(!lightSimulation)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                lightSimulation
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-white/[0.04] text-white/40'
              }`}
            >
              {lightSimulation ? '☀ On' : 'Off'}
            </button>
          </Row>
          {lightSimulation && (
            <>
              <Row label="Sun Intensity">
                <input type="range" min={0} max={5} step={0.1} value={sunIntensity}
                  onChange={e => setSunIntensity(parseFloat(e.target.value))}
                  className="w-24 accent-amber-400" />
              </Row>
              <Row label="Ambient Fill">
                <input type="range" min={0} max={2} step={0.05} value={ambientIntensity}
                  onChange={e => setAmbientIntensity(parseFloat(e.target.value))}
                  className="w-24 accent-blue-400" />
              </Row>
              <Row label="Sun Azimuth">
                <input type="range" min={0} max={360} step={5}
                  value={Math.round(Math.atan2(sunPosition[2], sunPosition[0]) * 180 / Math.PI + 360) % 360}
                  onChange={e => {
                    const angle = parseFloat(e.target.value) * Math.PI / 180
                    const dist = Math.sqrt(sunPosition[0] ** 2 + sunPosition[2] ** 2)
                    setSunPosition([Math.cos(angle) * dist, sunPosition[1], Math.sin(angle) * dist])
                  }}
                  className="w-24 accent-amber-400" />
              </Row>
              <Row label="Sun Height">
                <input type="range" min={1} max={50} step={1} value={sunPosition[1]}
                  onChange={e => setSunPosition([sunPosition[0], parseFloat(e.target.value), sunPosition[2]])}
                  className="w-24 accent-amber-400" />
              </Row>
            </>
          )}
        </Section>

        {/* ── Camera ── */}
        <Section title="📷 Camera" open={openSections.camera} onToggle={() => toggle('camera')}>
          <div className="grid grid-cols-4 gap-1">
            {CAMERA_VIEWS.map(v => (
              <button
                key={v.preset}
                onClick={() => triggerCameraView(v.preset)}
                className="rounded bg-white/[0.04] py-1 text-[10px] font-medium text-white/50 hover:bg-white/[0.08] hover:text-white/80 transition"
              >
                {v.label}
              </button>
            ))}
          </div>
        </Section>

        {/* ── Position (mesh only) ── */}
        {isMesh && (
          <Section title="🔄 Position" open={openSections.position} onToggle={() => toggle('position')}>
            <div className="mb-2 text-[10px] text-white/30">Orientation Presets</div>
            <div className="grid grid-cols-5 gap-1 mb-3">
              {ORIENT_PRESETS.map(p => (
                <button
                  key={p.label}
                  title={p.label}
                  onClick={() => applyPreset(p.q)}
                  className={`flex flex-col items-center gap-0.5 rounded py-1 text-[9px] transition ${
                    isActiveQ(p.q)
                      ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40'
                      : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
                  }`}
                >
                  <span className="text-sm">{p.icon}</span>
                  <span className="leading-tight">{p.label}</span>
                </button>
              ))}
            </div>

            <div className="mb-2 text-[10px] text-white/30">Fine-Tune</div>
            {(['x', 'y', 'z'] as const).map(axis => {
              const colors = { x: 'text-red-400', y: 'text-green-400', z: 'text-blue-400' }
              return (
                <div key={axis} className="mb-1 flex items-center gap-1">
                  <span className={`w-3 text-center text-[10px] font-bold ${colors[axis]}`}>{axis.toUpperCase()}</span>
                  {[-90, -45, -15, 15, 45, 90].map(deg => (
                    <button
                      key={deg}
                      onClick={() => applyObjectRotation(axis, deg)}
                      className="flex-1 rounded bg-white/[0.04] py-0.5 text-[9px] font-medium text-white/40 hover:bg-white/[0.08] transition"
                    >
                      {deg > 0 ? '+' : ''}{deg}°
                    </button>
                  ))}
                </div>
              )
            })}

            <div className="mt-2 flex gap-1.5">
              <button
                onClick={moveModelToGround}
                className="flex-1 rounded bg-emerald-500/10 py-1 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/20 transition"
              >
                ↕ Ground
              </button>
              <button
                onClick={() => { resetObjectRotation(); setTimeout(() => moveModelToGround(), 50) }}
                className="flex-1 rounded bg-white/[0.04] py-1 text-[10px] font-medium text-white/40 hover:bg-white/[0.08] transition"
              >
                ↺ Reset
              </button>
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

// ── Accordion Section ──

function Section({ title, open, onToggle, children }: {
  title: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="border-b border-white/[0.06]">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-semibold text-white/50 hover:bg-white/[0.03] transition"
      >
        <span>{title}</span>
        <span className="text-white/20 text-[8px]">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

// ── Property Row ──

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="text-[10px] text-white/40">{label}</span>
      {children}
    </div>
  )
}
