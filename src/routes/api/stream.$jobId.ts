import '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { getJob, updateJob } from '../../lib/jobStore.js'
import { streamE57 } from '../../lib/pdal.js'

export const Route = createFileRoute('/api/stream/$jobId')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ params }) => {
        const job = getJob(params.jobId)
        if (!job) {
          return new Response(
            `data: ${JSON.stringify({ type: 'error', message: 'Job not found' })}\n\n`,
            {
              status: 404,
              headers: {
                'content-type': 'text/event-stream',
                'cache-control': 'no-cache',
                connection: 'keep-alive',
              },
            },
          )
        }

        // Prevent duplicate PDAL processes when EventSource reconnects
        if (job.status === 'streaming' || job.status === 'done') {
          return new Response(
            `data: ${JSON.stringify({ type: 'error', message: 'Stream already in progress' })}\n\n`,
            {
              status: 409,
              headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
            },
          )
        }

        // Don't restart a failed job — return the previous error
        if (job.status === 'error') {
          return new Response(
            `data: ${JSON.stringify({ type: 'error', message: job.error ?? 'Processing failed' })}\n\n`,
            {
              status: 200,
              headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
            },
          )
        }

        updateJob(job.id, { status: 'streaming' })

        const encoder = new TextEncoder()
        let totalPoints = 0

        const stream = new ReadableStream({
          async start(controller) {
            // Flush headers immediately so the client's EventSource gets onopen
            controller.enqueue(encoder.encode(': connected\n\n'))

            // Send a keepalive comment every 2s so the connection isn't dropped
            // while PDAL is processing a large file before the first chunk arrives
            const keepalive = setInterval(() => {
              try { controller.enqueue(encoder.encode(': keepalive\n\n')) } catch {}
            }, 2_000)

            console.log('[Stream] Starting PDAL for job', job.id, job.filePath)
            try {
              for await (const event of streamE57(job.filePath)) {
                if (event.type === 'chunk') {
                  totalPoints += event.pointCount
                  if (event.chunkIndex === 0) console.log('[Stream] First chunk', event.pointCount, 'pts')
                  const sseData = `data: ${JSON.stringify({
                    type: 'chunk',
                    chunkIndex: event.chunkIndex,
                    pointCount: event.pointCount,
                    hasColor: event.hasColor,
                    hasIntensity: event.hasIntensity,
                    base64: event.base64,
                  })}\n\n`
                  controller.enqueue(encoder.encode(sseData))
                } else if (event.type === 'done') {
                  console.log('[Stream] Done, totalPoints:', event.totalPoints)
                  updateJob(job.id, {
                    status: 'done',
                    totalPoints: event.totalPoints,
                    bbox: event.bbox,
                    hasColor: event.hasColor,
                    hasIntensity: event.hasIntensity,
                  })
                  const sseData = `data: ${JSON.stringify({
                    type: 'done',
                    totalPoints: event.totalPoints,
                    bbox: event.bbox,
                    hasColor: event.hasColor,
                    hasIntensity: event.hasIntensity,
                  })}\n\n`
                  controller.enqueue(encoder.encode(sseData))
                  controller.close()
                } else if (event.type === 'error') {
                  console.error('[Stream] PDAL error:', event.message)
                  updateJob(job.id, { status: 'error', error: event.message })
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: 'error', message: event.message })}\n\n`,
                    ),
                  )
                  controller.close()
                }
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Unknown error'
              console.error('[Stream] Caught error:', message)
              updateJob(job.id, { status: 'error', error: message })
              try {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'error', message })}\n\n`,
                  ),
                )
                controller.close()
              } catch {}
            } finally {
              clearInterval(keepalive)
            }
          },
        })

        return new Response(stream, {
          status: 200,
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
            'x-accel-buffering': 'no', // disable nginx buffering
          },
        })
      },
    },
  },
})
