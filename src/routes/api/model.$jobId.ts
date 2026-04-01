import '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { getJob } from '../../lib/jobStore.js'
import { convertSkpToGlb } from '../../lib/skpConvert.js'

const CONTENT_TYPES: Record<string, string> = {
  e57: 'application/octet-stream',
  dae: 'model/vnd.collada+xml',
  obj: 'text/plain',
  skp: 'model/gltf-binary',
}

export const Route = createFileRoute('/api/model/$jobId')({
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
        if (job.fileType === 'e57') {
          return new Response(JSON.stringify({ error: 'Use /api/stream/:jobId for E57 files' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (!existsSync(job.filePath)) {
          return new Response(JSON.stringify({ error: 'File no longer available' }), {
            status: 410,
            headers: { 'content-type': 'application/json' },
          })
        }

        try {
          let data: Buffer
          let contentType: string

          if (job.fileType === 'skp') {
            // Convert SKP to GLB via Blender
            data = await convertSkpToGlb(job.filePath)
            contentType = 'model/gltf-binary'
          } else {
            data = await readFile(job.filePath)
            contentType = CONTENT_TYPES[job.fileType] ?? 'application/octet-stream'
          }

          return new Response(data.buffer as ArrayBuffer, {
            status: 200,
            headers: {
              'content-type': contentType,
              'content-length': String(data.byteLength),
              'cache-control': 'private, max-age=300',
            },
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to load model'
          return new Response(JSON.stringify({ error: message }), {
            status: 422,
            headers: { 'content-type': 'application/json' },
          })
        }
      },
    },
  },
})
