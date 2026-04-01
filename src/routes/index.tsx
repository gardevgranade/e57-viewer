import { createFileRoute } from '@tanstack/react-router'
import { ViewerProvider } from '../lib/viewerState.js'
import DragDropZone from '../components/viewer/DragDropZone.js'
import ViewerCanvas from '../components/viewer/ViewerCanvas.js'
import { useViewer } from '../lib/viewerState.js'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <ViewerProvider>
      <ViewerPage />
    </ViewerProvider>
  )
}

function ViewerPage() {
  const { streamStatus } = useViewer()
  const hasFile = streamStatus !== 'idle'

  return (
    <main className="flex h-[calc(100dvh-4rem)] flex-col gap-4 p-4">
      {!hasFile && (
        <div className="mx-auto w-full max-w-lg">
          <DragDropZone />
        </div>
      )}

      {hasFile && (
        <>
          <div className="shrink-0">
            <DragDropZone />
          </div>
          <div className="min-h-0 flex-1">
            <ViewerCanvas />
          </div>
        </>
      )}
    </main>
  )
}
