import '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createJob } from '../../lib/jobStore.js'

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

        if (!file.name.toLowerCase().endsWith('.e57')) {
          return new Response(
            JSON.stringify({ error: 'Only .e57 files are accepted' }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          )
        }

        const bytes = await file.arrayBuffer()
        const filePath = join(tmpdir(), `e57-upload-${randomUUID()}.e57`)
        await writeFile(filePath, Buffer.from(bytes))

        const job = createJob(filePath)

        return new Response(
          JSON.stringify({ jobId: job.id, fileName: file.name, size: file.size }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    },
  },
})
