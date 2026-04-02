import { createFileRoute } from '@tanstack/react-router'
import { ViewerProvider } from '../lib/viewerState.js'
import { ToastProvider } from '../lib/toast.js'
import { UnitsProvider } from '../lib/units.js'
import ErrorBoundary from '../components/ErrorBoundary.js'
import DragDropZone from '../components/viewer/DragDropZone.js'
import ViewerCanvas from '../components/viewer/ViewerCanvas.js'
import { useViewer } from '../lib/viewerState.js'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <UnitsProvider>
      <ToastProvider>
        <ViewerProvider>
          <ErrorBoundary>
            <ViewerPage />
          </ErrorBoundary>
        </ViewerProvider>
      </ToastProvider>
    </UnitsProvider>
  )
}

function ViewerPage() {
  const { streamStatus } = useViewer()
  const hasFile = streamStatus !== 'idle'

  return (
    <div className="flex h-dvh flex-col bg-[#080b12]">
      {/* Main content — full height */}
      <div className="min-h-0 flex-1">
        {hasFile ? (
          <ViewerCanvas />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="w-full max-w-lg">
              <DragDropZone />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
