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
      {/* Header */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0c1017] px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500/30 to-teal-500/30">
            <svg viewBox="0 0 32 32" className="h-3.5 w-3.5 text-indigo-400">
              <path d="M16 2L4 9v14l12 7 12-7V9L16 2z" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-white/70">3D Viewer</span>
          <span className="text-[9px] text-white/20">v1.0</span>
        </div>
        <div className="shrink-0">
          <DragDropZone />
        </div>
      </header>

      {/* Main content — fills remaining height */}
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
