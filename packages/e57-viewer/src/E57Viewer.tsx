import { useMemo } from 'react'
// oxlint-ignore-next-line no-unassigned-import
import './styles.css'
import { ConfigContext, buildConfigValue, useConfig } from './config'
import { ViewerProvider, useViewer } from './lib/viewerState'
import { ToastProvider } from './lib/toast'
import { UnitsProvider } from './lib/units'
import ErrorBoundary from './components/ErrorBoundary'
import ViewerCanvas from './components/viewer/ViewerCanvas'
import DragDropZone from './components/viewer/DragDropZone'
import type { E57ViewerProps } from './types'

function ViewerPage() {
  const { streamStatus } = useViewer()
  const { features } = useConfig()
  const hasFile = streamStatus !== 'idle'

  return (
    <div className="flex h-full w-full flex-col bg-[#080b12]">
      <div className="min-h-0 flex-1">
        {hasFile ? (
          <ViewerCanvas />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="w-full max-w-lg">
              {features.fileUpload ? <DragDropZone /> : (
                <div className="text-center text-white/40 text-sm">
                  No data loaded. Provide data via props.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function E57Viewer(props: E57ViewerProps) {
  const {
    config,
    pointCloudData,
    modelUrl,
    modelData,
    modelType,
    fileName,
    fileSize,
    onLoad,
    onError,
    onSurfacesChange,
    onMeasurementsChange,
    className,
    style,
  } = props

  const configValue = useMemo(() => buildConfigValue(config), [config])

  return (
    <div
      className={`e57-viewer-root ${className ?? ''}`}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', ...style }}
    >
      <ConfigContext.Provider value={configValue}>
        <UnitsProvider defaultSystem={configValue.defaultUnitSystem}>
          <ToastProvider>
            <ViewerProvider
              pointCloudData={pointCloudData}
              modelUrl={modelUrl}
              modelData={modelData}
              modelType={modelType}
              fileName={fileName}
              fileSize={fileSize}
              defaultPointSize={configValue.defaultPointSize}
              defaultColorMode={configValue.defaultColorMode}
              onLoad={onLoad}
              onError={onError}
              onSurfacesChange={onSurfacesChange}
              onMeasurementsChange={onMeasurementsChange}
            >
              <ErrorBoundary>
                <ViewerPage />
              </ErrorBoundary>
            </ViewerProvider>
          </ToastProvider>
        </UnitsProvider>
      </ConfigContext.Provider>
    </div>
  )
}
