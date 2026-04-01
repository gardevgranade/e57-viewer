import { spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { encodeChunkBase64 } from './chunkCodec.js'
import type { BoundingBox } from './jobStore.js'

export const POINTS_PER_CHUNK = 50_000

export interface StreamChunkEvent {
  type: 'chunk'
  chunkIndex: number
  base64: string
  hasColor: boolean
  hasIntensity: boolean
  pointCount: number
}

export interface StreamDoneEvent {
  type: 'done'
  totalPoints: number
  bbox: BoundingBox
  hasColor: boolean
  hasIntensity: boolean
}

export interface StreamErrorEvent {
  type: 'error'
  message: string
}

export type StreamEvent = StreamChunkEvent | StreamDoneEvent | StreamErrorEvent

/**
 * Parse an E57 file using PDAL and yield streaming chunk events.
 * PDAL writes a CSV-like text output which we parse line-by-line.
 */
export async function* streamE57(
  filePath: string,
): AsyncGenerator<StreamEvent> {
  if (!existsSync(filePath)) {
    yield { type: 'error', message: `File not found: ${filePath}` }
    return
  }

  // Build PDAL pipeline JSON
  const pipeline = {
    pipeline: [
      {
        type: 'readers.e57',
        filename: filePath,
      },
      {
        type: 'writers.text',
        filename: 'STDOUT',
        // No 'order' or 'keep_unspecified: false' — let PDAL write whatever
        // dimensions the file actually contains. Our header parser reads
        // column names from the first line and handles any set of dims.
        delimiter: ',',
        newline: '\n',
        quote_header: false,
        write_header: true,
      },
    ],
  }

  const pipelineJson = JSON.stringify(pipeline)
  const pipelinePath = join(tmpdir(), `pdal-pipeline-${randomUUID()}.json`)

  // Write pipeline to temp file
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(pipelinePath)
    ws.write(pipelineJson)
    ws.end()
    ws.on('finish', resolve)
    ws.on('error', reject)
  })

  let hasColor = false
  let hasIntensity = false
  let headerParsed = false
  let colX = -1,
    colY = -1,
    colZ = -1,
    colR = -1,
    colG = -1,
    colB = -1,
    colI = -1

  const chunkBuffer: number[] = []
  let chunkIndex = 0
  let totalPoints = 0

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity

  // Yield a chunk from the accumulated buffer
  function* flushChunk(): Generator<StreamChunkEvent> {
    if (chunkBuffer.length === 0) return
    const stride = 3 + (hasColor ? 3 : 0) + (hasIntensity ? 1 : 0)
    const pointCount = chunkBuffer.length / stride
    const data = new Float32Array(chunkBuffer)

    yield {
      type: 'chunk',
      chunkIndex,
      base64: encodeChunkBase64({
        chunkIndex,
        pointCount,
        hasColor,
        hasIntensity,
        data,
      }),
      hasColor,
      hasIntensity,
      pointCount,
    }
    chunkIndex++
    chunkBuffer.length = 0
  }

  const pdal = spawn('pdal', ['pipeline', '--stdin'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  // Prevent unhandled 'error' event (e.g. if 'pdal' binary is not found)
  let spawnError: Error | null = null
  pdal.on('error', (err) => { spawnError = err })

  pdal.stdin.write(pipelineJson)
  pdal.stdin.end()

  let remainder = ''
  let stderrOutput = ''

  pdal.stderr.on('data', (d: Buffer) => {
    stderrOutput += d.toString()
  })

  for await (const raw of pdal.stdout) {
    const text: string = remainder + (raw as Buffer).toString('utf8')
    const lines = text.split('\n')
    remainder = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      if (!headerParsed) {
        // Parse CSV header to find column indices
        const cols = trimmed.toLowerCase().split(',')
        colX = cols.indexOf('x')
        colY = cols.indexOf('y')
        colZ = cols.indexOf('z')
        colR = cols.indexOf('red')
        colG = cols.indexOf('green')
        colB = cols.indexOf('blue')
        colI = cols.indexOf('intensity')
        hasColor = colR >= 0 && colG >= 0 && colB >= 0
        hasIntensity = colI >= 0
        headerParsed = true
        continue
      }

      const parts = trimmed.split(',')
      const x = parseFloat(parts[colX] ?? '0')
      const y = parseFloat(parts[colY] ?? '0')
      const z = parseFloat(parts[colZ] ?? '0')

      if (isNaN(x) || isNaN(y) || isNaN(z)) continue

      chunkBuffer.push(x, y, z)

      if (hasColor) {
        // PDAL outputs 0-65535 for 16-bit or 0-255 for 8-bit color
        const rRaw = parseFloat(parts[colR] ?? '0')
        const gRaw = parseFloat(parts[colG] ?? '0')
        const bRaw = parseFloat(parts[colB] ?? '0')
        const scale = rRaw > 255 || gRaw > 255 || bRaw > 255 ? 65535 : 255
        chunkBuffer.push(rRaw / scale, gRaw / scale, bRaw / scale)
      }

      if (hasIntensity) {
        const iRaw = parseFloat(parts[colI] ?? '0')
        chunkBuffer.push(iRaw / 65535) // normalize 16-bit intensity
      }

      if (x < minX) minX = x
      if (y < minY) minY = y
      if (z < minZ) minZ = z
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      if (z > maxZ) maxZ = z

      totalPoints++
      const stride = 3 + (hasColor ? 3 : 0) + (hasIntensity ? 1 : 0)
      if (chunkBuffer.length >= POINTS_PER_CHUNK * stride) {
        yield* flushChunk()
      }
    }
  }

  // Flush remaining points
  yield* flushChunk()

  await unlink(pipelinePath).catch(() => {})

  if (spawnError) {
    const err = spawnError as Error
    yield { type: 'error', message: `Failed to spawn PDAL: ${err.message}` }
    return
  }

  // Guard against the race where PDAL already exited before we register 'close'
  const exitCode = await new Promise<number>((resolve) => {
    if (pdal.exitCode !== null) {
      resolve(pdal.exitCode)
    } else {
      pdal.on('close', (code) => resolve(code ?? 0))
    }
  })

  if (exitCode !== 0) {
    yield {
      type: 'error',
      message: `PDAL exited with code ${exitCode}: ${stderrOutput.slice(0, 500)}`,
    }
    return
  }

  const bbox: BoundingBox =
    totalPoints > 0
      ? { minX, minY, minZ, maxX, maxY, maxZ }
      : { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }

  yield { type: 'done', totalPoints, bbox, hasColor, hasIntensity }
}

/**
 * Run PDAL Poisson surface reconstruction and return a PLY buffer.
 */
export async function reconstructMesh(filePath: string): Promise<Buffer> {
  const outPath = join(tmpdir(), `mesh-${randomUUID()}.ply`)

  const pipeline = {
    pipeline: [
      { type: 'readers.e57', filename: filePath },
      { type: 'filters.normal', knn: 8 },
      {
        type: 'writers.ply',
        filename: outPath,
        storage_mode: 'ascii',
        faces: true,
      },
    ],
  }

  await new Promise<void>((resolve, reject) => {
    const pdal = spawn('pdal', ['pipeline', '--stdin'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stderr = ''
    pdal.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    pdal.stdin.write(JSON.stringify(pipeline))
    pdal.stdin.end()
    pdal.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`PDAL mesh failed (${code}): ${stderr.slice(0, 300)}`))
    })
  })

  const { readFile } = await import('node:fs/promises')
  const data = await readFile(outPath)
  await unlink(outPath).catch(() => {})
  return data
}
