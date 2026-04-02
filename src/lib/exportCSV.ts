import type { PickedSurface, SurfaceGroup } from './viewerState.js'
import type { UnitSystem } from './units.js'

const SQM_TO_SQFT = 10.7639

export function exportSurfacesCSV(
  surfaces: PickedSurface[],
  groups: SurfaceGroup[],
  unitSystem: UnitSystem,
) {
  const groupMap = new Map(groups.map((g) => [g.id, g]))

  const rows: string[][] = [
    ['ID', 'Label', 'Group', 'Area (' + (unitSystem === 'imperial' ? 'ft²' : 'm²') + ')', 'Visible', 'Color'],
  ]

  for (const s of surfaces) {
    const group = s.groupId ? groupMap.get(s.groupId)?.label ?? '' : ''
    let area = s.area ?? 0
    if (unitSystem === 'imperial') area *= SQM_TO_SQFT
    rows.push([
      s.id,
      s.label,
      group,
      area.toFixed(2),
      s.visible ? 'yes' : 'no',
      s.color,
    ])
  }

  // Total row
  const totalArea = surfaces.reduce((sum, s) => sum + (s.area ?? 0), 0) * (unitSystem === 'imperial' ? SQM_TO_SQFT : 1)
  rows.push(['', 'TOTAL', '', totalArea.toFixed(2), '', ''])

  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `surfaces-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
