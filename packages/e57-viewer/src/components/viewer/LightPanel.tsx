

import { useViewer } from '../../lib/viewerState'

export default function LightPanel() {
  const {
    lightSimulation, setLightSimulation,
    sunPosition, setSunPosition,
    sunIntensity, setSunIntensity,
    ambientIntensity, setAmbientIntensity,
  } = useViewer()

  if (!lightSimulation) return null

  return (
    <div className="absolute top-14 right-3 z-40 w-56 rounded-lg border border-white/10 bg-[#0d1117]/95 p-3 text-xs backdrop-blur-sm shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-amber-300">☀ Light Simulation</span>
        <button
          type="button"
          onClick={() => setLightSimulation(false)}
          className="text-white/30 hover:text-white/60 text-sm leading-none"
        >
          ✕
        </button>
      </div>

      {/* Sun Intensity */}
      <label htmlFor="light-sun-intensity" className="mb-1 block text-white/50">Sun Intensity</label>
      <input
        id="light-sun-intensity"
        type="range"
        min="0"
        max="5"
        step="0.1"
        value={sunIntensity}
        onChange={(e) => setSunIntensity(Number.parseFloat(e.target.value))}
        className="mb-3 w-full accent-amber-400"
      />

      {/* Ambient */}
      <label htmlFor="light-ambient-fill" className="mb-1 block text-white/50">Ambient Fill</label>
      <input
        id="light-ambient-fill"
        type="range"
        min="0"
        max="2"
        step="0.05"
        value={ambientIntensity}
        onChange={(e) => setAmbientIntensity(Number.parseFloat(e.target.value))}
        className="mb-3 w-full accent-blue-400"
      />

      {/* Sun Azimuth (horizontal angle) */}
      <label htmlFor="light-sun-azimuth" className="mb-1 block text-white/50">Sun Azimuth</label>
      <input
        id="light-sun-azimuth"
        type="range"
        min="0"
        max="360"
        step="5"
        value={Math.round(Math.atan2(sunPosition[2], sunPosition[0]) * 180 / Math.PI + 360) % 360}
        onChange={(e) => {
          const angle = Number.parseFloat(e.target.value) * Math.PI / 180
          const dist = Math.hypot(sunPosition[0], sunPosition[2])
          setSunPosition([
            Math.cos(angle) * dist,
            sunPosition[1],
            Math.sin(angle) * dist,
          ])
        }}
        className="mb-3 w-full accent-amber-400"
      />

      {/* Sun Elevation */}
      <label htmlFor="light-sun-height" className="mb-1 block text-white/50">Sun Height</label>
      <input
        id="light-sun-height"
        type="range"
        min="1"
        max="50"
        step="1"
        value={sunPosition[1]}
        onChange={(e) => setSunPosition([sunPosition[0], Number.parseFloat(e.target.value), sunPosition[2]])}
        className="mb-3 w-full accent-amber-400"
      />

      <div className="mt-1 text-[10px] text-white/25 text-center">
        Drag sliders to position the sun
      </div>
    </div>
  )
}
