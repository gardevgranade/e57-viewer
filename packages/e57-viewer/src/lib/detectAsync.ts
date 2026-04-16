/**
 * Main-thread API for running surface detection in a Web Worker.
 * Falls back to synchronous detection if workers aren't available.
 */

import * as THREE from 'three'
import type { DetectedSurface } from './surfaceDetect'
import type { DetectWorkerRequest, DetectWorkerResponse } from './detectWorker'

let _worker: Worker | null = null

function getWorker(): Worker | null {
  if (_worker) return _worker
  try {
    _worker = new Worker(new URL('detectWorker.js', import.meta.url), { type: 'module' })
    return _worker
  } catch {
    console.warn('[detectAsync] Web Worker not available, falling back to main thread')
    return null
  }
}

function runInWorker(req: DetectWorkerRequest): Promise<DetectedSurface[]> {
  return new Promise((resolve, reject) => {
    const worker = getWorker()
    if (!worker) {
      reject(new Error('no worker'))
      return
    }

    const timeout = setTimeout(() => {
      reject(new Error('Worker timeout'))
    }, 120_000)

    worker.addEventListener('message', (e: MessageEvent<DetectWorkerResponse>) => {
      clearTimeout(timeout)
      resolve(e.data.surfaces)
    })
    worker.addEventListener('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    // Build transfer list for request
    const transfers: Transferable[] = []
    if (req.type === 'pointcloud') {
      transfers.push(req.worldPos.buffer)
    } else {
      transfers.push(req.triPositions.buffer, req.triNormals.buffer, req.triAreas.buffer)
    }
    worker.postMessage(req, transfers)
  })
}

/**
 * Detect surfaces in a point cloud using a Web Worker.
 */
export async function detectSurfacesAsync(
  worldPos: Float32Array,
  count: number,
): Promise<DetectedSurface[]> {
  try {
    return await runInWorker({ type: 'pointcloud', worldPos, count })
  } catch {
    // Fallback: run on main thread
    const { detectSurfaces } = await import('./surfaceDetect')
    return detectSurfaces(worldPos, count)
  }
}

/**
 * Detect surfaces in a mesh scene using a Web Worker.
 * Extracts geometry data on main thread, sends to worker for processing.
 */
export async function detectMeshSurfacesAsync(
  root: THREE.Object3D,
): Promise<DetectedSurface[]> {
  // Extract triangle data from THREE.js scene on main thread
  const allPos: number[] = []
  const allNormals: number[] = []
  const allAreas: number[] = []

  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3()
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3()
  const normal = new THREE.Vector3()

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const geo = child.geometry as THREE.BufferGeometry
    if (!geo) return
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!posAttr) return

    const index = geo.index
    const mat = child.matrixWorld
    const triCount = index ? index.count / 3 : posAttr.count / 3

    for (let t = 0; t < triCount; t++) {
      const ia = index ? index.getX(t*3)   : t*3
      const ib = index ? index.getX(t*3+1) : t*3+1
      const ic = index ? index.getX(t*3+2) : t*3+2

      va.fromBufferAttribute(posAttr, ia).applyMatrix4(mat)
      vb.fromBufferAttribute(posAttr, ib).applyMatrix4(mat)
      vc.fromBufferAttribute(posAttr, ic).applyMatrix4(mat)

      e1.subVectors(vb, va); e2.subVectors(vc, va)
      normal.crossVectors(e1, e2)
      const area = normal.length() / 2
      if (area < 1e-12) continue
      normal.normalize()

      allPos.push(va.x,va.y,va.z, vb.x,vb.y,vb.z, vc.x,vc.y,vc.z)
      allNormals.push(normal.x, normal.y, normal.z)
      allAreas.push(area)
    }
  })

  if (allAreas.length === 0) return []

  const triPositions = new Float32Array(allPos)
  const triNormals = new Float32Array(allNormals)
  const triAreas = new Float32Array(allAreas)

  try {
    return await runInWorker({ type: 'mesh', triPositions, triNormals, triAreas })
  } catch {
    // Fallback: run on main thread
    const { detectMeshSurfaces } = await import('./meshSurfaceDetect')
    return detectMeshSurfaces(root)
  }
}
