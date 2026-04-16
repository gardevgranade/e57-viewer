import type { ColorMode } from './lib/viewerState'
import type { UnitSystem } from './lib/units'

// Re-export useful types from internal modules
export type { ColorMode } from './lib/viewerState'
export type { UnitSystem } from './lib/units'
export type { PickedSurface, SavedMeasurement, SurfaceGroup, MeasurementGroup, StreamStatus } from './lib/viewerState'

/** API endpoint configuration. Omit an endpoint to disable its feature. */
export interface E57ViewerEndpoints {
  /** File upload endpoint (POST, multipart/form-data) */
  upload?: string
  /** SSE streaming endpoint for E57 point clouds (GET, /:jobId appended) */
  stream?: string
  /** Model file serving endpoint (GET, /:jobId appended) */
  model?: string
  /** Mesh reconstruction endpoint (GET, /:jobId appended) */
  mesh?: string
  /** Companion file upload endpoint (POST, /:jobId appended) */
  companion?: string
  /** Address import endpoint (POST, JSON body) */
  addressImport?: string
}

/** Feature toggles — all default to `true`. Disabled automatically if required endpoint is missing. */
export interface E57ViewerFeatures {
  /** Drag-and-drop file upload zone. Requires `endpoints.upload`. */
  fileUpload?: boolean
  /** E57 point cloud SSE streaming. Requires `endpoints.stream`. */
  e57Streaming?: boolean
  /** Mesh reconstruction from point cloud. Requires `endpoints.mesh`. */
  meshReconstruction?: boolean
  /** Automatic surface detection */
  surfaceDetection?: boolean
  /** Measurement tool */
  measurements?: boolean
  /** Lasso selection tool */
  lassoSelection?: boolean
  /** Box selection tool */
  boxSelection?: boolean
  /** Sun/light simulation */
  lightSimulation?: boolean
  /** Positioning gizmo */
  positioning?: boolean
  /** Quad viewport layout */
  quadViewport?: boolean
  /** Surface CSV export */
  csvExport?: boolean
  /** Consoir address import. Requires `endpoints.addressImport`. */
  addressImport?: boolean
  /** Keyboard shortcuts */
  shortcuts?: boolean
}

/** Configuration object for the E57 Viewer */
export interface E57ViewerConfig {
  /** API endpoint URLs. Omit entirely for data-only mode. */
  endpoints?: E57ViewerEndpoints
  /** Feature toggles */
  features?: E57ViewerFeatures
  /** Color theme */
  theme?: 'dark' | 'light' | 'system'
  /** Initial point size (default: 1.5) */
  defaultPointSize?: number
  /** Initial color mode (default: 'rgb') */
  defaultColorMode?: ColorMode
  /** Initial unit system (default: 'metric') */
  defaultUnitSystem?: UnitSystem
}

/** Point cloud data that can be provided directly via props */
export interface PointCloudData {
  /** Interleaved XYZ positions */
  positions: Float32Array
  /** RGB colors (0-1 range, same length as positions) */
  colors?: Float32Array
  /** Intensity values (0-1 range, one per point) */
  intensities?: Float32Array
  /** Total point count */
  pointCount: number
  /** Bounding box */
  bbox?: {
    minX: number; minY: number; minZ: number
    maxX: number; maxY: number; maxZ: number
  }
}

/** Props for the E57Viewer component */
export interface E57ViewerProps {
  // --- Data props ---
  /** Pre-loaded point cloud data */
  pointCloudData?: PointCloudData
  /** URL to load a 3D model from (OBJ, GLB, GLTF, DAE, DXF, PLY) */
  modelUrl?: string
  /** In-memory model data */
  modelData?: ArrayBuffer
  /** File type hint for modelUrl/modelData */
  modelType?: 'obj' | 'dae' | 'glb' | 'gltf' | 'dxf' | 'ply'
  /** File name to display */
  fileName?: string
  /** File size in bytes */
  fileSize?: number

  // --- Configuration ---
  /** Viewer configuration */
  config?: E57ViewerConfig

  // --- Callbacks ---
  /** Called when model/point cloud finishes loading */
  onLoad?: (info: {
    totalPoints: number
    bbox: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } | null
    hasColor: boolean
    hasIntensity: boolean
    fileType: string | null
  }) => void
  /** Called on any error */
  onError?: (error: string) => void
  /** Called when surfaces change */
  onSurfacesChange?: (surfaces: {
    id: string; label: string; color: string; visible: boolean; area?: number
  }[]) => void
  /** Called when measurements change */
  onMeasurementsChange?: (measurements: {
    id: string; label: string; points: Array<{ x: number; y: number; z: number }>; isClosed: boolean
  }[]) => void

  // --- Styling ---
  /** Additional CSS class name */
  className?: string
  /** Inline styles */
  style?: React.CSSProperties
}

/** Resolved features (all booleans, accounting for endpoint availability) */
export interface ResolvedFeatures {
  fileUpload: boolean
  e57Streaming: boolean
  meshReconstruction: boolean
  surfaceDetection: boolean
  measurements: boolean
  lassoSelection: boolean
  boxSelection: boolean
  lightSimulation: boolean
  positioning: boolean
  quadViewport: boolean
  csvExport: boolean
  addressImport: boolean
  shortcuts: boolean
}
