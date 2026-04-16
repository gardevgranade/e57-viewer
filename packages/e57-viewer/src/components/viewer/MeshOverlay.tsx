import { useEffect, useRef, useState } from 'react'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { useViewer } from '../../lib/viewerState'
import { useConfig } from '../../config'

export default function MeshOverlay() {
  const { jobId, showMesh, streamStatus } = useViewer()
  const { endpoints } = useConfig()
  const [meshUrl, setMeshUrl] = useState<string | null>(null)
  const [meshError, setMeshError] = useState<string | null>(null)
  const [_loading, setLoading] = useState(false)
  const prevJobId = useRef<string | null>(null)

  useEffect(() => {
    if (!showMesh || !jobId || streamStatus !== 'done') return
    if (!endpoints.mesh) return
    if (prevJobId.current === jobId) return

    prevJobId.current = jobId
    setLoading(true)
    setMeshError(null)

    fetch(`${endpoints.mesh}/${jobId}`)
      .then(async (res) => {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error((json as Record<string, unknown>).error as string ?? `HTTP ${res.status}`)
        }
        const blob = await res.blob()
        setMeshUrl(URL.createObjectURL(blob))
      })
      .catch((error) => {
        setMeshError(error instanceof Error ? error.message : 'Mesh failed')
      })
      .finally(() => setLoading(false))
  }, [showMesh, jobId, streamStatus])

  // Cleanup object URL on unmount / change
  useEffect(() => {
    return () => {
      if (meshUrl) URL.revokeObjectURL(meshUrl)
    }
  }, [meshUrl])

  if (!showMesh) return null
  if (meshError) {
    // Return null — error is shown in ViewerControls via the viewer state
    console.error('Mesh error:', meshError)
    return null
  }
  if (!meshUrl) return null

  return <PLYMesh url={meshUrl} />
}

function PLYMesh({ url }: { url: string }) {
  const geo = useLoader(PLYLoader, url)

  useEffect(() => {
    geo.computeVertexNormals()
  }, [geo])

  return (
    <mesh geometry={geo}>
      <meshStandardMaterial
        color="#4fb8b2"
        transparent
        opacity={0.45}
        side={THREE.DoubleSide}
        roughness={0.6}
        metalness={0.1}
      />
    </mesh>
  )
}
