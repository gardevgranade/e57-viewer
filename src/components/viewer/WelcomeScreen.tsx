'use client'

export default function WelcomeScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8 text-center select-none">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-teal-500/20 border border-white/[0.08]">
          <svg viewBox="0 0 32 32" className="h-8 w-8 text-indigo-400">
            <path
              d="M16 2L4 9v14l12 7 12-7V9L16 2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M4 9l12 7m0 0l12-7m-12 7v14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.5"
            />
            <circle cx="16" cy="16" r="3" fill="currentColor" opacity="0.3" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white/90">3D Viewer</h1>
          <p className="text-xs text-white/30">Enterprise-grade point cloud & mesh analysis</p>
        </div>
      </div>

      {/* Feature cards */}
      <div className="grid max-w-lg grid-cols-3 gap-3">
        <FeatureCard icon="📐" title="Measure" desc="Distance, edge snap" />
        <FeatureCard icon="🏗️" title="Surfaces" desc="Auto-detect & analyze" />
        <FeatureCard icon="✂️" title="Lasso" desc="Select & edit regions" />
        <FeatureCard icon="🎯" title="Position" desc="Orient your model" />
        <FeatureCard icon="📊" title="Export" desc="CSV & screenshots" />
        <FeatureCard icon="↩️" title="Undo/Redo" desc="Full history" />
      </div>

      {/* Supported formats */}
      <div className="flex items-center gap-2 text-[10px] text-white/20">
        <span>Supported:</span>
        {['E57', 'OBJ', 'MTL', 'PLY', 'GLB', 'GLTF', 'DAE', 'SKP', 'DXF', 'DWG'].map((f) => (
          <span key={f} className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono">
            .{f.toLowerCase()}
          </span>
        ))}
      </div>

      {/* Keyboard hint */}
      <p className="text-[10px] text-white/15">
        Press <kbd className="rounded bg-white/[0.04] px-1 font-mono">?</kbd> for keyboard shortcuts
      </p>
    </div>
  )
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-white/[0.04] bg-white/[0.02] p-3">
      <span className="text-lg">{icon}</span>
      <span className="text-[11px] font-medium text-white/60">{title}</span>
      <span className="text-[9px] text-white/25">{desc}</span>
    </div>
  )
}
