import { randomUUID } from 'node:crypto'
import { unlink, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'

export type JobStatus = 'pending' | 'streaming' | 'done' | 'error'
export type FileType = 'e57' | 'obj' | 'dae' | 'skp' | 'dxf' | 'dwg' | 'ply'

export interface BoundingBox {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

export interface Job {
  id: string
  filePath: string
  mtlPath?: string
  textureDir?: string
  fileType: FileType
  status: JobStatus
  totalPoints: number
  bbox: BoundingBox | null
  hasColor: boolean
  hasIntensity: boolean
  error?: string
  createdAt: number
}

// Persist the store on globalThis so Vite hot-reloads don't wipe it
const STORE_KEY = Symbol.for('e57:jobStore')
const g = globalThis as typeof globalThis & { [key: symbol]: Map<string, Job> | undefined }
if (!g[STORE_KEY]) g[STORE_KEY] = new Map<string, Job>()
const store: Map<string, Job> = g[STORE_KEY]!
const TTL_MS = 5 * 60 * 1000 // 5 minutes

export function createJob(filePath: string, fileType: FileType, mtlPath?: string, textureDir?: string): Job {
  const job: Job = {
    id: randomUUID(),
    filePath,
    mtlPath,
    textureDir,
    fileType,
    status: 'pending',
    totalPoints: 0,
    bbox: null,
    hasColor: false,
    hasIntensity: false,
    createdAt: Date.now(),
  }
  store.set(job.id, job)
  return job
}

export function getJob(id: string): Job | undefined {
  return store.get(id)
}

export function updateJob(id: string, patch: Partial<Job>): void {
  const job = store.get(id)
  if (job) store.set(id, { ...job, ...patch })
}

async function cleanupJob(job: Job): Promise<void> {
  store.delete(job.id)
  if (existsSync(job.filePath)) {
    await unlink(job.filePath).catch(() => {})
  }
  if (job.mtlPath && existsSync(job.mtlPath)) {
    await unlink(job.mtlPath).catch(() => {})
  }
  if (job.textureDir && existsSync(job.textureDir)) {
    await rm(job.textureDir, { recursive: true, force: true }).catch(() => {})
  }
}

// Periodic TTL cleanup
setInterval(async () => {
  const now = Date.now()
  for (const job of store.values()) {
    if (now - job.createdAt > TTL_MS) {
      await cleanupJob(job)
    }
  }
}, 60_000)
