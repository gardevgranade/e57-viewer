import { createContext, useCallback, useContext, useState } from 'react'

export type UnitSystem = 'metric' | 'imperial'

interface UnitsCtx {
  unitSystem: UnitSystem
  setUnitSystem: (u: UnitSystem) => void
  fmtLength: (meters: number) => string
  fmtArea: (sqMeters: number) => string
  unitLabel: string
  areaUnitLabel: string
}

const M_TO_FT = 3.280_84
const SQM_TO_SQFT = 10.7639

const Ctx = createContext<UnitsCtx>({
  unitSystem: 'metric',
  setUnitSystem: () => { /* noop */ },
  fmtLength: (m) => `${m.toFixed(3)} m`,
  fmtArea: (m2) => `${m2.toFixed(2)} m²`,
  unitLabel: 'm',
  areaUnitLabel: 'm²',
})

export function useUnits() {
  return useContext(Ctx)
}

export function UnitsProvider({ children, defaultSystem = 'metric' }: { children: React.ReactNode; defaultSystem?: UnitSystem }) {
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(defaultSystem)

  const fmtLength = useCallback(
    (meters: number) => {
      if (unitSystem === 'imperial') {
        const ft = meters * M_TO_FT
        if (ft < 1) return `${(ft * 12).toFixed(1)} in`
        return `${ft.toFixed(2)} ft`
      }
      if (meters < 0.01) return `${(meters * 1000).toFixed(1)} mm`
      if (meters < 1) return `${(meters * 100).toFixed(1)} cm`
      return `${meters.toFixed(3)} m`
    },
    [unitSystem],
  )

  const fmtArea = useCallback(
    (sqMeters: number) => {
      if (unitSystem === 'imperial') {
        const sqft = sqMeters * SQM_TO_SQFT
        return `${sqft.toFixed(1)} ft²`
      }
      if (sqMeters < 0.01) return `${(sqMeters * 1e4).toFixed(1)} cm²`
      if (sqMeters < 10_000) return `${sqMeters.toFixed(2)} m²`
      return `${(sqMeters / 10_000).toFixed(2)} ha`
    },
    [unitSystem],
  )

  const unitLabel = unitSystem === 'imperial' ? 'ft' : 'm'
  const areaUnitLabel = unitSystem === 'imperial' ? 'ft²' : 'm²'

  return (
    <Ctx.Provider value={{ unitSystem, setUnitSystem, fmtLength, fmtArea, unitLabel, areaUnitLabel }}>
      {children}
    </Ctx.Provider>
  )
}
