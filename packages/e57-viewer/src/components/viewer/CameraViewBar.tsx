

import type { CameraPreset } from './CameraViewPresets'

interface CameraViewBarProps {
  onView: (preset: CameraPreset) => void
}

const VIEWS: { preset: CameraPreset; label: string; key: string }[] = [
  { preset: 'front',  label: 'Front',  key: '1' },
  { preset: 'back',   label: 'Back',   key: '' },
  { preset: 'left',   label: 'Left',   key: '' },
  { preset: 'right',  label: 'Right',  key: '3' },
  { preset: 'top',    label: 'Top',    key: '7' },
  { preset: 'bottom', label: 'Bot',    key: '' },
  { preset: 'iso',    label: 'Iso',    key: '5' },
  { preset: 'fit',    label: 'Fit',    key: '0' },
]

export default function CameraViewBar({ onView }: CameraViewBarProps) {
  return (
    <div className="absolute right-2 top-[72px] z-40 flex flex-col gap-[2px] rounded-lg border border-white/[0.06] bg-[#0c1017]/90 p-[3px] backdrop-blur-sm">
      {VIEWS.map((v) => (
        <button
          type="button"
          key={v.preset}
          onClick={() => onView(v.preset)}
          title={`${v.label}${v.key ? ` (Numpad ${v.key})` : ''}`}
          className="flex h-5 w-8 items-center justify-center rounded text-[8px] font-semibold text-white/35 transition hover:bg-white/[0.08] hover:text-white/80"
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}
