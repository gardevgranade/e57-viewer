'use client'

import { useMemo } from 'react'
import * as THREE from 'three'
import { useViewer } from '../../lib/viewerState.js'

/** Renders a semi-transparent coloured overlay mesh for each detected surface (mesh mode only). */
export default function SurfaceMeshOverlay() {
  const { surfaces, surfaceColorMode, fileType, hoveredSurfaceId, setHoveredSurfaceId, setSelectedSurfaceId } = useViewer()

  const isMesh = fileType && fileType !== 'e57'
  if (!surfaceColorMode || !isMesh) return null

  return (
    <>
      {surfaces
        .filter((s) => s.visible && s.worldTriangles && s.worldTriangles.length > 0)
        .map((s) => (
          <SurfaceOverlayMesh
            key={s.id}
            id={s.id}
            color={s.color}
            triangles={s.worldTriangles!}
            hovered={s.id === hoveredSurfaceId}
            onHover={setHoveredSurfaceId}
            onSelect={setSelectedSurfaceId}
          />
        ))}
    </>
  )
}

function SurfaceOverlayMesh({
  id,
  color,
  triangles,
  hovered,
  onHover,
  onSelect,
}: {
  id: string
  color: string
  triangles: Float32Array
  hovered: boolean
  onHover: (id: string | null) => void
  onSelect: (id: string | null) => void
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
        opacity: hovered ? 0.80 : 0.40,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [color, hovered],
  )

  return (
    <>
      <mesh
        geometry={geometry}
        material={material}
        renderOrder={2}
        onPointerOver={(e) => { e.stopPropagation(); onHover(id) }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => { e.stopPropagation(); onSelect(id) }}
      />
      {hovered && (
        <mesh geometry={geometry} renderOrder={3}>
          <meshBasicMaterial color={color} wireframe transparent opacity={0.45} depthWrite={false} />
        </mesh>
      )}
    </>
  )
}
