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
  dxf: 'dxf',
  dwg: 'dwg',
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
            JSON.stringify({ error: 'Unsupported file type. Accepted: .e57, .dae, .obj, .skp, .dxf, .dwg' }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          )
        }

        const bytes = await file.arrayBuffer()
        const filePath = join(tmpdir(), `model-upload-${randomUUID()}.${ext}`)
        await writeFile(filePath, Buffer.from(bytes))

        // Optionally accept a companion .mtl file for OBJ uploads
        let mtlPath: string | undefined
        let requiredTextures: string[] = []
        const mtlFile = formData.get('mtl')
        if (fileType === 'obj' && mtlFile instanceof File) {
          const mtlBytes = await mtlFile.arrayBuffer()
          mtlPath = join(tmpdir(), `model-upload-${randomUUID()}.mtl`)
          await writeFile(mtlPath, Buffer.from(mtlBytes))

          // Parse MTL for texture references
          const mtlText = Buffer.from(mtlBytes).toString('utf-8')
          const texRefs = new Set<string>()
          const texKeywords = ['map_Ka', 'map_Kd', 'map_Ks', 'map_Ns', 'map_d', 'map_bump', 'map_Bump', 'bump', 'Bump', 'disp', 'decal', 'refl', 'norm', 'map_Pr', 'map_Pm', 'map_Ke']
          for (const line of mtlText.split('\n')) {
            const trimmed = line.trim()
            for (const kw of texKeywords) {
              if (trimmed.startsWith(kw + ' ') || trimmed.startsWith(kw + '\t')) {
                let texFile = trimmed.slice(kw.length).trim()
                texFile = texFile.replace(/^(-\w+\s+[\d.]+(\s+[\d.]+)*\s*)+/, '').trim()
                texFile = texFile.replace(/\\/g, '/').replace(/\/+/g, '/')
                if (texFile) texRefs.add(texFile)
              }
            }
          }
          requiredTextures = [...texRefs]
        }

        const job = createJob(filePath, fileType, mtlPath)

        return new Response(
          JSON.stringify({ jobId: job.id, fileName: file.name, size: file.size, fileType, hasMtl: !!mtlPath, requiredTextures }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    },
  },
})
