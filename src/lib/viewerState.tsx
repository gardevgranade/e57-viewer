import { createContext, useContext, useMemo, useRef, useState } from 'react'
import type { BoundingBox } from '../lib/jobStore.js'

export type StreamStatus = 'idle' | 'uploading' | 'streaming' | 'done' | 'error'
export type ColorMode = 'rgb' | 'intensity' | 'height'

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
