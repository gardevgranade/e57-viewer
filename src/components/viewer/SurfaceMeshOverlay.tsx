'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import { useViewer } from '../../lib/viewerState.js'

/** Renders a semi-transparent coloured overlay mesh for each detected surface (mesh mode only). */
export default function SurfaceMeshOverlay() {
  const { surfaces, surfaceColorMode, fileType } = useViewer()

  const isMesh = fileType && fileType !== 'e57'
  if (!surfaceColorMode || !isMesh) return null

  return (
    <>
      {surfaces
        .filter((s) => s.visible && s.worldTriangles && s.worldTriangles.length > 0)
        .map((s) => (
          <SurfaceOverlayMesh key={s.id} color={s.color} triangles={s.worldTriangles!} />
        ))}
    </>
  )
}

function SurfaceOverlayMesh({
  color,
  triangles,
}: {
  color: string
  triangles: Float32Array
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(triangles, 3))
    geo.computeVertexNormals()
    return geo
  }, [triangles])

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [color],
  )

  return <mesh geometry={geometry} material={material} renderOrder={2} />
}
