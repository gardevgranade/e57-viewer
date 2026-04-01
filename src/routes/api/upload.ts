import '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createJob } from '../../lib/jobStore.js'
import type { FileType } from '../../lib/jobStore.js'

const ACCEPTED: Record<string, FileType> = {
  e57: 'e57',
  dae: 'dae',
  obj: 'obj',
  skp: 'skp',
}

export const Route = createFileRoute('/api/upload')({
  component: () => null,
  server: {
    handlers: {
      POST: async ({ request }) => {
        let formData: FormData
        try {
          formData = await request.formData()
        } catch {
          return new Response(JSON.stringify({ error: 'Failed to parse form data' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        }

        const file = formData.get('file')
        if (!(file instanceof File)) {
          return new Response(JSON.stringify({ error: 'No file provided' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        }

        const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
        const fileType = ACCEPTED[ext]
        if (!fileType) {
          return new Response(
            JSON.stringify({ error: 'Unsupported file type. Accepted: .e57, .dae, .obj, .skp' }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          )
        }

        const bytes = await file.arrayBuffer()
        const filePath = join(tmpdir(), `model-upload-${randomUUID()}.${ext}`)
        await writeFile(filePath, Buffer.from(bytes))

        const job = createJob(filePath, fileType)

        return new Response(
          JSON.stringify({ jobId: job.id, fileName: file.name, size: file.size, fileType }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    },
  },
})
