import '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { getJob } from '../../lib/jobStore.js'
import { reconstructMesh } from '../../lib/pdal.js'

export const Route = createFileRoute('/api/mesh/$jobId')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ params }) => {
        const job = getJob(params.jobId)
        if (!job) {
          return new Response(JSON.stringify({ error: 'Job not found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          })
        }

        if (job.status !== 'done') {
          return new Response(
            JSON.stringify({ error: 'Job not complete yet', status: job.status }),
            { status: 409, headers: { 'content-type': 'application/json' } },
          )
        }

        try {
          const plyBuffer = await reconstructMesh(job.filePath)
          return new Response(new Uint8Array(plyBuffer), {
                status: 200,
                headers: {
                  'content-type': 'application/octet-stream',
                  'content-disposition': 'attachment; filename="mesh.ply"',
                  'content-length': String(plyBuffer.byteLength),
                },
              })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Mesh reconstruction failed'
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          })
        }
      },
    },
  },
})
