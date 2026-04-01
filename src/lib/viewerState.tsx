import { createContext, useContext, useMemo, useRef, useState } from 'react'
import type { BoundingBox } from '../lib/jobStore.js'

export type StreamStatus = 'idle' | 'uploading' | 'streaming' | 'done' | 'error'
export type ColorMode = 'rgb' | 'intensity' | 'height'
export type Quaternion4 = [number, number, number, number]

export interface ViewerState {
  jobId: string | null
  fileName: string | null
  fileSize: number | null
  streamStatus: StreamStatus
  totalPoints: number
  loadedPoints: number
  bbox: BoundingBox | null
  hasColor: boolean
  hasIntensity: boolean
  errorMessage: string | null
  // viewer settings
  pointSize: number
  colorMode: ColorMode
  showMesh: boolean
  /** Object orientation as a unit quaternion [x, y, z, w]. Identity = [0,0,0,1]. */
  objectQuaternion: Quaternion4
  /** File type of the loaded model */
  fileType: string | null
}

export interface ViewerActions {
  setUploading: (fileName: string, fileSize: number) => void
  setJobId: (jobId: string) => void
  setStreamStatus: (status: StreamStatus) => void
  addLoadedPoints: (count: number) => void
  setDone: (info: {
    totalPoints: number
    bbox: BoundingBox
    hasColor: boolean
    hasIntensity: boolean
  }) => void
  setError: (message: string) => void
  reset: () => void
  setPointSize: (size: number) => void
  setColorMode: (mode: ColorMode) => void
  setShowMesh: (show: boolean) => void
  /** Pre-multiply current orientation by a ±90° rotation around one axis. */
  applyObjectRotation: (axis: 'x' | 'y' | 'z', angleDeg: number) => void
  resetObjectRotation: () => void
  setFileType: (fileType: string | null) => void
}

const IDENTITY_QUAT: Quaternion4 = [0, 0, 0, 1]

/** Multiply two unit quaternions (Hamilton product). */
function multiplyQuaternions(a: Quaternion4, b: Quaternion4): Quaternion4 {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

function axisAngleQuat(axis: 'x' | 'y' | 'z', angleDeg: number): Quaternion4 {
  const half = (angleDeg * Math.PI) / 360 // half-angle in radians
  const s = Math.sin(half)
  const c = Math.cos(half)
  if (axis === 'x') return [s, 0, 0, c]
  if (axis === 'y') return [0, s, 0, c]
  return [0, 0, s, c]
}

const initialState: ViewerState = {
  jobId: null,
  fileName: null,
  fileSize: null,
  streamStatus: 'idle',
  totalPoints: 0,
  loadedPoints: 0,
  bbox: null,
  hasColor: false,
  hasIntensity: false,
  errorMessage: null,
  pointSize: 1.5,
  colorMode: 'rgb',
  showMesh: false,
  objectQuaternion: IDENTITY_QUAT,
  fileType: null,
}

const ViewerContext = createContext<(ViewerState & ViewerActions) | null>(null)

export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ViewerState>(initialState)

  // Memoize actions so their references are stable across re-renders.
  // All actions use the functional setState form, so no state is closed over
  // and setState itself is guaranteed stable by React.
  const actions = useMemo<ViewerActions>(
    () => ({
      setUploading: (fileName, fileSize) =>
        setState((s) => ({
          ...s,
          streamStatus: 'uploading',
          fileName,
          fileSize,
          errorMessage: null,
        })),
      setJobId: (jobId) => setState((s) => ({ ...s, jobId })),
      setStreamStatus: (status) => setState((s) => ({ ...s, streamStatus: status })),
      addLoadedPoints: (count) =>
        setState((s) => ({ ...s, loadedPoints: s.loadedPoints + count })),
      setDone: (info) =>
        setState((s) => ({
          ...s,
          streamStatus: 'done',
          totalPoints: info.totalPoints,
          bbox: info.bbox,
          hasColor: info.hasColor,
          hasIntensity: info.hasIntensity,
        })),
      setError: (message) =>
        setState((s) => ({ ...s, streamStatus: 'error', errorMessage: message })),
      reset: () => setState(initialState),
      setPointSize: (pointSize) => setState((s) => ({ ...s, pointSize })),
      setColorMode: (colorMode) => setState((s) => ({ ...s, colorMode })),
      setShowMesh: (showMesh) => setState((s) => ({ ...s, showMesh })),
      applyObjectRotation: (axis, angleDeg) =>
        setState((s) => ({
          ...s,
          objectQuaternion: multiplyQuaternions(axisAngleQuat(axis, angleDeg), s.objectQuaternion),
        })),
      resetObjectRotation: () => setState((s) => ({ ...s, objectQuaternion: IDENTITY_QUAT })),
      setFileType: (fileType) => setState((s) => ({ ...s, fileType })),
    }),
    [],
  )

  const value = useMemo(() => ({ ...state, ...actions }), [state, actions])

  return (
    <ViewerContext.Provider value={value}>
      {children}
    </ViewerContext.Provider>
  )
}

export function useViewer() {
  const ctx = useContext(ViewerContext)
  if (!ctx) throw new Error('useViewer must be used within ViewerProvider')
  return ctx
}

/** Stable ref to avoid re-renders in the 3D canvas */
export function useViewerRef() {
  const ctx = useContext(ViewerContext)
  const ref = useRef(ctx)
  ref.current = ctx
  return ref
}
