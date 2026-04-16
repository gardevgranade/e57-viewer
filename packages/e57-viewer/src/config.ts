import { createContext, useContext } from 'react'
import type { E57ViewerConfig, E57ViewerEndpoints, E57ViewerFeatures, ResolvedFeatures } from './types'

const DEFAULT_FEATURES: Required<E57ViewerFeatures> = {
  fileUpload: true,
  e57Streaming: true,
  meshReconstruction: true,
  surfaceDetection: true,
  measurements: true,
  lassoSelection: true,
  boxSelection: true,
  lightSimulation: true,
  positioning: true,
  quadViewport: true,
  csvExport: true,
  addressImport: true,
  shortcuts: true,
}

/** Features that require specific endpoints to work */
const ENDPOINT_REQUIREMENTS: Partial<Record<keyof E57ViewerFeatures, keyof E57ViewerEndpoints>> = {
  fileUpload: 'upload',
  e57Streaming: 'stream',
  meshReconstruction: 'mesh',
  addressImport: 'addressImport',
}

export function resolveFeatures(config?: E57ViewerConfig): ResolvedFeatures {
  const userFeatures = config?.features ?? {}
  const endpoints = config?.endpoints ?? {}
  const resolved = {} as ResolvedFeatures

  for (const [key, defaultValue] of Object.entries(DEFAULT_FEATURES)) {
    const featureKey = key as keyof E57ViewerFeatures
    const userValue = userFeatures[featureKey]
    let enabled = userValue ?? defaultValue

    // Auto-disable if required endpoint is missing
    const requiredEndpoint = ENDPOINT_REQUIREMENTS[featureKey]
    if (requiredEndpoint && !endpoints[requiredEndpoint]) {
      enabled = false
    }

    resolved[featureKey] = enabled
  }

  return resolved
}

export interface ConfigContextValue {
  endpoints: E57ViewerEndpoints
  features: ResolvedFeatures
  theme: 'dark' | 'light' | 'system'
  defaultPointSize: number
  defaultColorMode: 'rgb' | 'intensity' | 'height'
  defaultUnitSystem: 'metric' | 'imperial'
}

const ConfigContext = createContext<ConfigContextValue | null>(null)

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig must be used within E57Viewer')
  return ctx
}

export function buildConfigValue(config?: E57ViewerConfig): ConfigContextValue {
  return {
    endpoints: config?.endpoints ?? {},
    features: resolveFeatures(config),
    theme: config?.theme ?? 'dark',
    defaultPointSize: config?.defaultPointSize ?? 1.5,
    defaultColorMode: config?.defaultColorMode ?? 'rgb',
    defaultUnitSystem: config?.defaultUnitSystem ?? 'metric',
  }
}

export { ConfigContext }
