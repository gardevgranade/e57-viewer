import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

export interface BoundingBox {
  minX: number; minY: number; minZ: number
  maxX: number; maxY: number; maxZ: number
}

export type StreamStatus = 'idle' | 'uploading' | 'streaming' | 'done' | 'error'
export type ColorMode = 'rgb' | 'intensity' | 'height'
export type Quaternion4 = [number, number, number, number]

export interface PickedSurface {
  id: string
  label: string
  color: string
  visible: boolean
  groupId: string | null
  area?: number
  worldTriangles?: Float32Array
  pointIndices?: number[]
  pointCount?: number
  /** World-space surface normal (unit vector) */
  normal?: [number, number, number]
}

export interface SurfaceGroup {
  id: string
  label: string
  parentId: string | null
}

export interface SavedMeasurement {
  id: string
  label: string
  points: { x: number; y: number; z: number }[]
  isClosed: boolean
  visible: boolean
  /** If set, this measurement is a cutout subtracted from the parent area */
  parentId: string | null
  /** Group this measurement belongs to */
  groupId: string | null
}

export interface MeasurementGroup {
  id: string
  label: string
  parentId: string | null
}

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
  /** Whether the measurement tool is active */
  measureActive: boolean
  measureSnap: boolean
  surfaces: PickedSurface[]
  surfaceGroups: SurfaceGroup[]
  surfaceColorMode: boolean
  pickSurfaceMode: boolean
  meshVisible: boolean
  hoveredSurfaceId: string | null
  hoveredGroupId: string | null
  selectedSurfaceId: string | null
  selectedSurfacePos: { x: number; y: number } | null
  /** When serial changes, MeasureTool will pre-populate with these points */
  measureTraceSerial: number
  measureTracePts: { x: number; y: number; z: number }[]
  canUndo: boolean
  canRedo: boolean
  positioningMode: boolean
  objectYOffset: number
  modelClickPos: { x: number; y: number } | null
  lassoMode: boolean
  lassoPath: { x: number; y: number }[]
  lassoDrawingComplete: boolean
  lassoSelectedIds: string[] | null
  lassoTriangleMode: boolean
  lassoSelectedTriangles: { surfaceId: string; triangleIndices: number[] }[] | null
  savedMeasurements: SavedMeasurement[]
  measurementGroups: MeasurementGroup[]
  /** ID of the measurement currently highlighted from the panel */
  highlightedMeasurementId: string | null
  /** Segment index highlighted within that measurement (null = whole measurement) */
  highlightedSegmentIdx: number | null
  boxSelectMode: boolean
  /** Incremented to trigger model reload (e.g. after adding MTL/textures) */
  modelVersion: number
  lightSimulation: boolean
  sunPosition: [number, number, number]
  sunIntensity: number
  ambientIntensity: number
  viewLayout: 'single' | 'quad'
  maximizedView: 'top' | 'front' | 'left' | 'perspective' | null
  modelUrl: string | null
  modelData: ArrayBuffer | null
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
  setObjectQuaternion: (q: Quaternion4) => void
  resetObjectRotation: () => void
  setFileType: (fileType: string | null) => void
  setMeasureActive: (active: boolean) => void
  setMeasureSnap: (v: boolean) => void
  setSurfaces: (s: PickedSurface[]) => void
  updateSurface: (id: string, patch: Partial<Pick<PickedSurface, 'label' | 'color' | 'visible' | 'groupId'>>) => void
  addSurface: (s: PickedSurface) => void
  removeSurface: (id: string) => void
  replaceSurface: (id: string, replacements: PickedSurface[]) => void
  /** Set visible=true/false for all surfaces whose label starts with the given prefix (case-insensitive) */
  setSurfaceTypeVisible: (typePrefix: string, visible: boolean) => void
  addGroup: (g: SurfaceGroup) => void
  removeGroup: (id: string) => void
  updateGroup: (id: string, patch: Partial<Pick<SurfaceGroup, 'label'>>) => void
  setSurfaceColorMode: (v: boolean) => void
  setPickSurfaceMode: (v: boolean) => void
  setMeshVisible: (v: boolean) => void
  setHoveredSurfaceId: (id: string | null) => void
  setHoveredGroupId: (id: string | null) => void
  setSelectedSurfaceId: (id: string | null) => void
  setSelectedSurface: (id: string | null, pos?: { x: number; y: number }) => void
  traceSurfaceMeasure: (pts: { x: number; y: number; z: number }[]) => void
  undo: () => void
  redo: () => void
  setPositioningMode: (v: boolean) => void
  setObjectYOffset: (v: number) => void
  setModelClickPos: (pos: { x: number; y: number } | null) => void
  moveModelToGround: () => void
  setLassoMode: (v: boolean) => void
  setLassoPath: (pts: { x: number; y: number }[]) => void
  setLassoDrawingComplete: (v: boolean) => void
  setLassoSelectedIds: (ids: string[] | null) => void
  setLassoTriangleMode: (v: boolean) => void
  setLassoSelectedTriangles: (v: { surfaceId: string; triangleIndices: number[] }[] | null) => void
  updateSurfaceGeometry: (id: string, worldTriangles: Float32Array) => void
  addMeasurement: (m: SavedMeasurement) => void
  removeMeasurement: (id: string) => void
  updateMeasurementLabel: (id: string, label: string) => void
  toggleMeasurementVisibility: (id: string) => void
  setHighlightedMeasurement: (id: string | null, segmentIdx?: number | null) => void
  clearAllMeasurements: () => void
  updateMeasurement: (id: string, points: { x: number; y: number; z: number }[], isClosed: boolean) => void
  setMeasurementParent: (id: string, parentId: string | null) => void
  setMeasurementGroup: (id: string, groupId: string | null) => void
  addMeasurementGroup: (g: MeasurementGroup) => void
  removeMeasurementGroup: (id: string) => void
  updateMeasurementGroup: (id: string, patch: Partial<Pick<MeasurementGroup, 'label'>>) => void
  setBoxSelectMode: (v: boolean) => void
  incrementModelVersion: () => void
  setLightSimulation: (v: boolean) => void
  setSunPosition: (pos: [number, number, number]) => void
  setSunIntensity: (v: number) => void
  setAmbientIntensity: (v: number) => void
  setViewLayout: (layout: 'single' | 'quad') => void
  setMaximizedView: (view: 'top' | 'front' | 'left' | 'perspective' | null) => void
  pointCloudGeoRef: React.MutableRefObject<{
    geometry: THREE.BufferGeometry
    matrixWorld: THREE.Matrix4
    count: number
  } | null>
  meshObjectRef: React.MutableRefObject<THREE.Object3D | null>
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
  measureActive: false,
  measureSnap: true,
  surfaces: [],
  surfaceGroups: [],
  surfaceColorMode: false,
  pickSurfaceMode: false,
  meshVisible: true,
  hoveredSurfaceId: null,
  hoveredGroupId: null,
  selectedSurfaceId: null,
  selectedSurfacePos: null,
  measureTraceSerial: 0,
  measureTracePts: [],
  canUndo: false,
  canRedo: false,
  positioningMode: false,
  objectYOffset: 0,
  modelClickPos: null,
  lassoMode: false,
  lassoPath: [],
  lassoDrawingComplete: false,
  lassoSelectedIds: null,
  lassoTriangleMode: false,
  lassoSelectedTriangles: null,
  savedMeasurements: [],
  measurementGroups: [],
  highlightedMeasurementId: null,
  highlightedSegmentIdx: null,
  boxSelectMode: false,
  modelVersion: 0,
  lightSimulation: false,
  sunPosition: [10, 15, 8],
  sunIntensity: 1.5,
  ambientIntensity: 0.3,
  viewLayout: 'single',
  maximizedView: null,
  modelUrl: null,
  modelData: null,
}

const ViewerContext = createContext<(ViewerState & ViewerActions) | null>(null)

interface ViewerProviderProps {
  children: React.ReactNode
  pointCloudData?: import('../types').PointCloudData
  modelUrl?: string
  modelData?: ArrayBuffer
  modelType?: string
  fileName?: string
  fileSize?: number
  defaultPointSize?: number
  defaultColorMode?: ColorMode
  onLoad?: (info: { totalPoints: number; bbox: BoundingBox | null; hasColor: boolean; hasIntensity: boolean; fileType: string | null }) => void
  onError?: (error: string) => void
  onSurfacesChange?: (surfaces: { id: string; label: string; color: string; visible: boolean; area?: number }[]) => void
  onMeasurementsChange?: (measurements: { id: string; label: string; points: Array<{ x: number; y: number; z: number }>; isClosed: boolean }[]) => void
}

export function ViewerProvider({
  children,
  pointCloudData,
  modelUrl,
  modelData,
  modelType,
  fileName,
  fileSize,
  defaultPointSize,
  defaultColorMode,
  onLoad,
  onError,
  onSurfacesChange,
  onMeasurementsChange,
}: ViewerProviderProps) {
  const computedInitialState = useMemo<ViewerState>(() => {
    const s = { ...initialState }
    if (defaultPointSize !== undefined && defaultPointSize !== null) s.pointSize = defaultPointSize
    if (defaultColorMode !== undefined && defaultColorMode !== null) s.colorMode = defaultColorMode
    if (fileName !== undefined && fileName !== null) s.fileName = fileName
    if (fileSize !== undefined && fileSize !== null) s.fileSize = fileSize
    if (pointCloudData) {
      s.streamStatus = 'done'
      s.totalPoints = pointCloudData.pointCount
      s.bbox = pointCloudData.bbox ? { ...pointCloudData.bbox } : null
      s.hasColor = Boolean(pointCloudData.colors)
      s.hasIntensity = Boolean(pointCloudData.intensities)
    } else if (modelUrl || modelData) {
      s.streamStatus = 'streaming'
      s.fileType = modelType ?? null
      s.modelUrl = modelUrl ?? null
      s.modelData = modelData ?? null
    }
    return s
    // Only compute once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [state, setState] = useState<ViewerState>(computedInitialState)

  const pointCloudGeoRef = useRef<{
    geometry: THREE.BufferGeometry
    matrixWorld: THREE.Matrix4
    count: number
  } | null>(null)

  const meshObjectRef = useRef<THREE.Object3D | null>(null)

  // Undo / redo stacks — stored in refs to avoid triggering re-renders on push
  type UndoSlice = Pick<ViewerState, 'surfaces' | 'surfaceGroups'>
  const historyRef = useRef<UndoSlice[]>([])
  const futureRef = useRef<UndoSlice[]>([])

  // Memoize actions so their references are stable across re-renders.
  // All actions use the functional setState form, so no state is closed over
  // and setState itself is guaranteed stable by React.
  const actions = useMemo<Omit<ViewerActions, 'pointCloudGeoRef' | 'meshObjectRef'>>(
    () => {
      /** Push current undoable slice to history, clear redo stack */
      function setStateUndoable(updater: (s: ViewerState) => ViewerState) {
        setState(s => {
          historyRef.current = [...historyRef.current.slice(-49), { surfaces: s.surfaces, surfaceGroups: s.surfaceGroups }]
          futureRef.current = []
          return { ...updater(s), canUndo: true, canRedo: false }
        })
      }

      return {
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
        setObjectQuaternion: (objectQuaternion) => setState((s) => ({ ...s, objectQuaternion })),
        resetObjectRotation: () => setState((s) => ({ ...s, objectQuaternion: IDENTITY_QUAT })),
        setFileType: (fileType) => setState((s) => ({ ...s, fileType })),
        setMeasureActive: (measureActive) => setState((s) => ({ ...s, measureActive })),
        setMeasureSnap: (measureSnap) => setState((s) => ({ ...s, measureSnap })),
        setSurfaces: (surfaces) =>
          setStateUndoable(s => ({ ...s, surfaces, surfaceColorMode: surfaces.length > 0 })),
        updateSurface: (id, patch) =>
          setStateUndoable(s => ({
            ...s,
            surfaces: s.surfaces.map(surf => surf.id === id ? { ...surf, ...patch } : surf),
          })),
        addSurface: (surface) =>
          setStateUndoable(s => ({
            ...s,
            surfaces: [...s.surfaces, surface],
            surfaceColorMode: true,
          })),
        removeSurface: (id) =>
          setStateUndoable(s => ({ ...s, surfaces: s.surfaces.filter(surf => surf.id !== id) })),
        replaceSurface: (id, replacements) =>
          setStateUndoable(s => {
            const idx = s.surfaces.findIndex(surf => surf.id === id)
            if (idx === -1) return s
            const next = [...s.surfaces]
            next.splice(idx, 1, ...replacements)
            return { ...s, surfaces: next }
          }),
        setSurfaceTypeVisible: (typePrefix, visible) =>
          setStateUndoable(s => ({
            ...s,
            surfaces: s.surfaces.map(surf =>
              surf.label.toLowerCase().startsWith(typePrefix.toLowerCase())
                ? { ...surf, visible }
                : surf,
            ),
          })),
        addGroup: (group: SurfaceGroup) =>
          setStateUndoable(s => ({ ...s, surfaceGroups: [...s.surfaceGroups, group] })),
        removeGroup: (id) =>
          setStateUndoable(s => {
            // Collect this group + all descendants
            const toRemove = new Set<string>()
            const queue = [id]
            while (queue.length > 0) {
              const cur = queue.shift()
              if (cur === undefined) break
              toRemove.add(cur)
              s.surfaceGroups.filter(g => g.parentId === cur).forEach(g => queue.push(g.id))
            }
            return {
              ...s,
              surfaceGroups: s.surfaceGroups.filter(g => !toRemove.has(g.id)),
              surfaces: s.surfaces.map(surf =>
                surf.groupId && toRemove.has(surf.groupId) ? { ...surf, groupId: null } : surf,
              ),
            }
          }),
        updateGroup: (id, patch) =>
          setStateUndoable(s => ({
            ...s,
            surfaceGroups: s.surfaceGroups.map(g => g.id === id ? { ...g, ...patch } : g),
          })),
        setSurfaceColorMode: (surfaceColorMode) => setState((s) => ({ ...s, surfaceColorMode })),
        setPickSurfaceMode: (pickSurfaceMode) => setState((s) => ({ ...s, pickSurfaceMode })),
        setMeshVisible: (meshVisible) => setState((s) => ({ ...s, meshVisible })),
        setHoveredSurfaceId: (hoveredSurfaceId) => setState((s) => ({ ...s, hoveredSurfaceId })),
        setHoveredGroupId: (hoveredGroupId) => setState((s) => ({ ...s, hoveredGroupId })),
        setSelectedSurfaceId: (selectedSurfaceId) => setState((s) => ({ ...s, selectedSurfaceId, selectedSurfacePos: null })),
        setSelectedSurface: (selectedSurfaceId, selectedSurfacePos?) =>
          setState((s) => ({ ...s, selectedSurfaceId, selectedSurfacePos: selectedSurfacePos ?? null })),
        traceSurfaceMeasure: (pts) =>
          setState((s) => ({ ...s, measureTracePts: pts, measureTraceSerial: s.measureTraceSerial + 1 })),
        undo: () =>
          setState(s => {
            if (historyRef.current.length === 0) return s
            const prev = historyRef.current.at(-1)
            historyRef.current = historyRef.current.slice(0, -1)
            futureRef.current = [{ surfaces: s.surfaces, surfaceGroups: s.surfaceGroups }, ...futureRef.current.slice(0, 49)]
            return { ...s, ...prev, canUndo: historyRef.current.length > 0, canRedo: true }
          }),
        redo: () =>
          setState(s => {
            if (futureRef.current.length === 0) return s
            const next = futureRef.current[0]
            futureRef.current = futureRef.current.slice(1)
            historyRef.current = [...historyRef.current.slice(-49), { surfaces: s.surfaces, surfaceGroups: s.surfaceGroups }]
            return { ...s, ...next, canUndo: true, canRedo: futureRef.current.length > 0 }
          }),
        setPositioningMode: (positioningMode) => setState((s) => ({ ...s, positioningMode })),
        setObjectYOffset: (objectYOffset) => setState((s) => ({ ...s, objectYOffset })),
        setModelClickPos: (modelClickPos) => setState((s) => ({ ...s, modelClickPos })),
        moveModelToGround: () => {
          const obj = meshObjectRef.current
          if (!obj) return
          const bbox = new THREE.Box3().setFromObject(obj)
          setState(s => ({ ...s, objectYOffset: s.objectYOffset - bbox.min.y }))
        },
        setLassoMode: (lassoMode) => setState(s => ({ ...s, lassoMode, lassoPath: [], lassoSelectedIds: null, lassoSelectedTriangles: null, lassoDrawingComplete: false })),
        setLassoPath: (lassoPath) => setState(s => ({ ...s, lassoPath })),
        setLassoDrawingComplete: (lassoDrawingComplete) => setState(s => ({ ...s, lassoDrawingComplete })),
        setLassoSelectedIds: (lassoSelectedIds) => setState(s => ({ ...s, lassoSelectedIds })),
        setLassoTriangleMode: (lassoTriangleMode) => setState(s => ({ ...s, lassoTriangleMode, lassoSelectedIds: null, lassoSelectedTriangles: null })),
        setLassoSelectedTriangles: (lassoSelectedTriangles) => setState(s => ({ ...s, lassoSelectedTriangles })),
        updateSurfaceGeometry: (id, worldTriangles) =>
          setStateUndoable(s => {
            const surf = s.surfaces.find(x => x.id === id)
            const oldCount = surf?.worldTriangles ? surf.worldTriangles.length / 9 : 0
            const newCount = worldTriangles.length / 9
            const newArea = (oldCount > 0 && surf?.area) ? surf.area * (newCount / oldCount) : undefined
            return {
              ...s,
              surfaces: s.surfaces.map(x =>
                x.id === id ? { ...x, worldTriangles, area: newArea } : x,
              ),
            }
          }),
        addMeasurement: (m) =>
          setState(s => ({ ...s, savedMeasurements: [...s.savedMeasurements, m] })),
        removeMeasurement: (id) =>
          setState(s => ({
            ...s,
            savedMeasurements: s.savedMeasurements
              .filter(m => m.id !== id)
              .map(m => m.parentId === id ? { ...m, parentId: null } : m),
          })),
        updateMeasurementLabel: (id, label) =>
          setState(s => ({
            ...s,
            savedMeasurements: s.savedMeasurements.map(m =>
              m.id === id ? { ...m, label } : m,
            ),
          })),
        toggleMeasurementVisibility: (id) =>
          setState(s => ({
            ...s,
            savedMeasurements: s.savedMeasurements.map(m =>
              m.id === id ? { ...m, visible: !m.visible } : m,
            ),
          })),
        setHighlightedMeasurement: (id, segmentIdx = null) =>
          setState(s => ({ ...s, highlightedMeasurementId: id, highlightedSegmentIdx: segmentIdx ?? null })),
        clearAllMeasurements: () =>
          setState(s => ({ ...s, savedMeasurements: [], measurementGroups: [], highlightedMeasurementId: null, highlightedSegmentIdx: null })),
        updateMeasurement: (id, points, isClosed) =>
          setState(s => ({
            ...s,
            savedMeasurements: s.savedMeasurements.map(m =>
              m.id === id ? { ...m, points, isClosed } : m,
            ),
          })),
        setMeasurementParent: (id, parentId) =>
          setState(s => ({
            ...s,
            savedMeasurements: s.savedMeasurements.map(m =>
              m.id === id ? { ...m, parentId } : m,
            ),
          })),
        setMeasurementGroup: (id, groupId) =>
          setState(s => ({
            ...s,
            savedMeasurements: s.savedMeasurements.map(m =>
              m.id === id ? { ...m, groupId } : m,
            ),
          })),
        addMeasurementGroup: (group) =>
          setState(s => ({ ...s, measurementGroups: [...s.measurementGroups, group] })),
        removeMeasurementGroup: (id) =>
          setState(s => {
            // BFS to collect all descendant group IDs
            const toRemove = new Set<string>()
            const queue = [id]
            while (queue.length > 0) {
              const cur = queue.shift()
              if (cur === undefined) break
              toRemove.add(cur)
              s.measurementGroups.filter(g => g.parentId === cur).forEach(g => queue.push(g.id))
            }
            return {
              ...s,
              measurementGroups: s.measurementGroups.filter(g => !toRemove.has(g.id)),
              savedMeasurements: s.savedMeasurements.map(m =>
                m.groupId && toRemove.has(m.groupId) ? { ...m, groupId: null } : m,
              ),
            }
          }),
        updateMeasurementGroup: (id, patch) =>
          setState(s => ({
            ...s,
            measurementGroups: s.measurementGroups.map(g => g.id === id ? { ...g, ...patch } : g),
          })),
        setBoxSelectMode: (boxSelectMode) => setState(s => ({ ...s, boxSelectMode })),
        incrementModelVersion: () => setState(s => ({ ...s, modelVersion: s.modelVersion + 1 })),
        setLightSimulation: (lightSimulation) => setState(s => ({ ...s, lightSimulation })),
        setSunPosition: (sunPosition) => setState(s => ({ ...s, sunPosition })),
        setSunIntensity: (sunIntensity) => setState(s => ({ ...s, sunIntensity })),
        setAmbientIntensity: (ambientIntensity) => setState(s => ({ ...s, ambientIntensity })),
        setViewLayout: (viewLayout) => setState(s => ({ ...s, viewLayout, maximizedView: null })),
        setMaximizedView: (maximizedView) => setState(s => ({ ...s, maximizedView })),
      }
    },
    [],
  )

  const value = useMemo(
    () => ({ ...state, ...actions, pointCloudGeoRef, meshObjectRef }),
    [state, actions, pointCloudGeoRef, meshObjectRef],
  )

  // Global keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); actions.undo() }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); actions.redo() }
    }
    globalThis.addEventListener('keydown', handler)
    return () => globalThis.removeEventListener('keydown', handler)
  }, [actions])

  // Callback: onLoad when stream completes
  useEffect(() => {
    if (state.streamStatus === 'done' && onLoad) {
      onLoad({
        totalPoints: state.totalPoints,
        bbox: state.bbox,
        hasColor: state.hasColor,
        hasIntensity: state.hasIntensity,
        fileType: state.fileType,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.streamStatus])

  // Callback: onError when stream errors
  useEffect(() => {
    if (state.streamStatus === 'error' && onError && state.errorMessage) {
      onError(state.errorMessage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.streamStatus])

  // Callback: onSurfacesChange
  useEffect(() => {
    if (onSurfacesChange) {
      onSurfacesChange(
        state.surfaces.map(({ id, label, color, visible, area }) => ({ id, label, color, visible, area })),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.surfaces])

  // Callback: onMeasurementsChange
  useEffect(() => {
    if (onMeasurementsChange) {
      onMeasurementsChange(
        state.savedMeasurements.map(({ id, label, points, isClosed }) => ({ id, label, points, isClosed })),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedMeasurements])

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
