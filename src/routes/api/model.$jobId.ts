import '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, normalize, dirname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { getJob, updateJob } from '../../lib/jobStore.js'
import { convertSkpToGlb } from '../../lib/skpConvert.js'
import { convertDwgToDxf } from '../../lib/dwgConvert.js'

const CONTENT_TYPES: Record<string, string> = {
  e57: 'application/octet-stream',
  dae: 'model/vnd.collada+xml',
  obj: 'text/plain',
  skp: 'model/gltf-binary',
  dxf: 'text/plain',
  dwg: 'text/plain',
}

/** Recursively search a directory for a file by lowercase name. */
async function findFileByName(dir: string, targetLower: string): Promise<string | null> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = resolve(dir, entry.name)
      if (entry.isFile() && entry.name.toLowerCase() === targetLower) return full
      if (entry.isDirectory()) {
        const found = await findFileByName(full, targetLower)
        if (found) return found
      }
    }
  } catch { /* ignore read errors */ }
  return null
}

/** List all files recursively, returning paths relative to baseDir. */
async function listFilesRecursive(dir: string, baseDir: string): Promise<string[]> {
  const result: string[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = resolve(dir, entry.name)
      if (entry.isFile()) {
        result.push(full.slice(baseDir.length + 1))
      } else if (entry.isDirectory()) {
        result.push(...await listFilesRecursive(full, baseDir))
      }
    }
  } catch { /* ignore */ }
  return result
}

export const Route = createFileRoute('/api/model/$jobId')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const job = getJob(params.jobId)
        console.log(`[model GET] jobId=${params.jobId} found=${!!job} mtlPath=${job?.mtlPath ?? 'none'} textureDir=${job?.textureDir ?? 'none'}`)
        if (!job) {
          return new Response(JSON.stringify({ error: 'Job not found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          })
        }

        const url = new URL(request.url)

        // Serve job file info when ?info=1
        if (url.searchParams.get('info') === '1') {
          const info: {
            jobId: string; fileType: string; hasMtl: boolean
            mtlPath?: string; hasTextures: boolean
            textureDir?: string; textureFiles: string[]
          } = {
            jobId: job.id,
            fileType: job.fileType,
            hasMtl: !!job.mtlPath,
            mtlPath: job.mtlPath,
            hasTextures: !!job.textureDir,
            textureDir: job.textureDir,
            textureFiles: [],
          }
          if (job.textureDir && existsSync(job.textureDir)) {
            info.textureFiles = await listFilesRecursive(job.textureDir, job.textureDir)
          }
          return new Response(JSON.stringify(info, null, 2), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }

        // Serve the companion MTL file when ?mtl=1
        if (url.searchParams.get('mtl') === '1') {
          console.log(`[model GET ?mtl] job.mtlPath=${job.mtlPath ?? 'undefined'} exists=${job.mtlPath ? existsSync(job.mtlPath) : false}`)
          if (!job.mtlPath) {
            return new Response(JSON.stringify({ error: 'No MTL file for this job' }), {
              status: 404,
              headers: { 'content-type': 'application/json', 'cache-control': 'no-cache' },
            })
          }
          if (!existsSync(job.mtlPath)) {
            return new Response(JSON.stringify({ error: 'MTL file no longer available' }), {
              status: 410,
              headers: { 'content-type': 'application/json' },
            })
          }
          const data = await readFile(job.mtlPath)
          return new Response(data.buffer as ArrayBuffer, {
            status: 200,
            headers: {
              'content-type': 'text/plain',
              'content-length': String(data.byteLength),
              'cache-control': 'private, max-age=300',
            },
          })
        }

        // Serve texture files when ?texture=<relativePath>
        const textureName = url.searchParams.get('texture')
        if (textureName) {
          if (!job.textureDir) {
            return new Response(JSON.stringify({ error: 'No textures for this job' }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }
          // Normalize Windows backslashes to forward slashes, then sanitize
          const safe = normalize(textureName.replace(/\\/g, '/')).replace(/\.\./g, '').replace(/^\/+/, '')
          let texPath = resolve(job.textureDir, safe)

          // Security: ensure resolved path is inside textureDir
          if (!texPath.startsWith(resolve(job.textureDir))) {
            return new Response(JSON.stringify({ error: 'Texture not found' }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          }

          // Fallback: if exact path doesn't exist, search by filename
          if (!existsSync(texPath)) {
            const target = basename(safe).toLowerCase()
            const found = await findFileByName(job.textureDir, target)
            if (found) {
              texPath = found
            } else {
              return new Response(JSON.stringify({ error: 'Texture not found' }), {
                status: 404,
                headers: { 'content-type': 'application/json' },
              })
            }
          }

          const data = await readFile(texPath)
          const ext = texPath.split('.').pop()?.toLowerCase() ?? ''
          const MIME: Record<string, string> = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
            gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
            tga: 'application/octet-stream', tif: 'image/tiff', tiff: 'image/tiff',
            exr: 'application/octet-stream', hdr: 'application/octet-stream',
          }
          return new Response(data.buffer as ArrayBuffer, {
            status: 200,
            headers: {
              'content-type': MIME[ext] ?? 'application/octet-stream',
              'content-length': String(data.byteLength),
              'cache-control': 'private, max-age=300',
            },
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
          } else if (job.fileType === 'dwg') {
            // Convert DWG to DXF via ODA File Converter
            data = await convertDwgToDxf(job.filePath)
            contentType = 'text/plain'
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

      // POST: add companion files (MTL, textures) to an existing job
      POST: async ({ params, request }) => {
        const job = getJob(params.jobId)
        if (!job) {
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

        // Add MTL file
        const mtlFile = formData.get('mtl')
        if (mtlFile instanceof File) {
          const mtlBytes = await mtlFile.arrayBuffer()
          const mtlPath = resolve(tmpdir(), `model-upload-${randomUUID()}.mtl`)
          await writeFile(mtlPath, Buffer.from(mtlBytes))
          updateJob(job.id, { mtlPath })
          addedMtl = true
        }

        // Add texture files
        const textures = formData.getAll('textures')
        const texturePaths = formData.getAll('texturePaths')
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
          }
          if (!job.textureDir) updateJob(job.id, { textureDir })
          addedTextures = true
        }

        return new Response(
          JSON.stringify({ ok: true, addedMtl, addedTextures }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    },
  },
})
