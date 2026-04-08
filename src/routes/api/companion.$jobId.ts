import '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { getJob, updateJob } from '../../lib/jobStore.js'

export const Route = createFileRoute('/api/companion/$jobId')({
  component: () => null,
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const { jobId } = params
        console.log(`[companion POST] jobId=${jobId}`)
        const job = getJob(jobId)
        if (!job) {
          console.log(`[companion POST] job not found!`)
          return new Response(JSON.stringify({ error: 'Job not found' }), {
            status: 404, headers: { 'content-type': 'application/json' },
          })
        }

        let formData: FormData
        try { formData = await request.formData() } catch {
          return new Response(JSON.stringify({ error: 'Failed to parse form data' }), {
            status: 400, headers: { 'content-type': 'application/json' },
          })
        }

        let addedMtl = false
        let addedTextures = false

        // --- MTL file ---
        const mtlFile = formData.get('mtl')
        let requiredTextures: string[] = []
        if (mtlFile instanceof File) {
          const mtlBytes = await mtlFile.arrayBuffer()
          const mtlText = Buffer.from(mtlBytes).toString('utf-8')
          const mtlPath = resolve(tmpdir(), `model-upload-${randomUUID()}.mtl`)
          await writeFile(mtlPath, Buffer.from(mtlBytes))
          updateJob(job.id, { mtlPath })
          addedMtl = true
          console.log(`[companion POST] MTL saved to ${mtlPath}`)

          // Verify persistence
          const verify = getJob(job.id)
          console.log(`[companion POST] verify mtlPath=${verify?.mtlPath}`)

          // Parse MTL to extract texture file references
          const texRefs = new Set<string>()
          const texKeywords = ['map_Ka', 'map_Kd', 'map_Ks', 'map_Ns', 'map_d', 'map_bump', 'bump', 'disp', 'decal', 'refl', 'norm', 'map_Pr', 'map_Pm', 'map_Ke']
          for (const line of mtlText.split('\n')) {
            const trimmed = line.trim()
            for (const kw of texKeywords) {
              if (trimmed.startsWith(kw + ' ') || trimmed.startsWith(kw + '\t')) {
                const parts = trimmed.split(/\s+/)
                const texFile = parts[parts.length - 1].replace(/\\/g, '/')
                if (texFile) texRefs.add(texFile)
              }
            }
          }
          requiredTextures = [...texRefs]
          console.log(`[companion POST] MTL references ${requiredTextures.length} textures:`, requiredTextures)
        }

        // --- Texture files ---
        const textures = formData.getAll('textures')
        const texturePaths = formData.getAll('texturePaths')
        console.log(`[companion POST] textures count=${textures.length} paths count=${texturePaths.length}`)
        if (textures.length > 0) {
          const textureDir = job.textureDir || resolve(tmpdir(), `textures-${randomUUID()}`)
          await mkdir(textureDir, { recursive: true })
          for (let i = 0; i < textures.length; i++) {
            const tex = textures[i]
            if (!(tex instanceof File)) continue
            const relPath = (texturePaths[i] as string) || tex.name
            const safe = relPath.replace(/\.\./g, '').replace(/^\/+/, '')
            const dest = resolve(textureDir, safe)
            await mkdir(dirname(dest), { recursive: true })
            const texBytes = await tex.arrayBuffer()
            await writeFile(dest, Buffer.from(texBytes))
            console.log(`[companion POST] texture saved: ${safe} → ${dest}`)
          }
          if (!job.textureDir) {
            updateJob(job.id, { textureDir })
            console.log(`[companion POST] textureDir set to ${textureDir}`)
          }

          // Verify persistence
          const verify = getJob(job.id)
          console.log(`[companion POST] verify textureDir=${verify?.textureDir}`)

          addedTextures = true
        }

        console.log(`[companion POST] done: addedMtl=${addedMtl} addedTextures=${addedTextures}`)
        return new Response(
          JSON.stringify({ ok: true, addedMtl, addedTextures, requiredTextures }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    },
  },
})
