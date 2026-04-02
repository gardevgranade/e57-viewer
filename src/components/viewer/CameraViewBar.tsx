'use client'

import type { CameraPreset } from './CameraViewPresets.js'

interface CameraViewBarProps {
  onView: (preset: CameraPreset) => void
}

const VIEWS: { preset: CameraPreset; label: string; icon: string; key: string }[] = [
  { preset: 'front',  label: 'Front',   icon: 'F', key: 'Numpad1' },
  { preset: 'right',  label: 'Right',   icon: 'R', key: 'Numpad3' },
  { preset: 'top',    label: 'Top',     icon: 'T', key: 'Numpad7' },
  { preset: 'back',   label: 'Back',    icon: 'B', key: '' },
  { preset: 'left',   label: 'Left',    icon: 'L', key: '' },
  { preset: 'bottom', label: 'Bottom',  icon: 'U', key: '' },
  { preset: 'iso',    label: 'Iso',     icon: '◇', key: 'Numpad5' },
  { preset: 'fit',    label: 'Fit All', icon: '⊞', key: '0' },
]

export default function CameraViewBar({ onView }: CameraViewBarProps) {
  return (
    <div className="absolute right-14 top-3 z-40 flex flex-col gap-0.5 rounded-lg border border-white/[0.06] bg-[#0c1017]/90 p-1 backdrop-blur-sm">
      {VIEWS.map((v) => (
        <button
          key={v.preset}
          onClick={() => onView(v.preset)}
          title={`${v.label}${v.key ? ` (${v.key})` : ''}`}
          className="flex h-6 w-6 items-center justify-center rounded text-[9px] font-bold text-white/40 transition hover:bg-white/[0.08] hover:text-white/80"
        >
          {v.icon}
        </button>
      ))}
    </div>
  )
}
