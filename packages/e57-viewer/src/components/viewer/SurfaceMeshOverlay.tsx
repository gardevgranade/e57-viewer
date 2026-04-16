

import { useMemo } from 'react'
import * as THREE from 'three'
import { useViewer } from '../../lib/viewerState'

/** Renders a semi-transparent coloured overlay mesh for each detected surface (mesh mode only). */
export default function SurfaceMeshOverlay() {
  const { surfaces, surfaceGroups, surfaceColorMode, fileType, hoveredSurfaceId, hoveredGroupId, setHoveredSurfaceId, setSelectedSurface, boxSelectMode } = useViewer()

  const isMesh = fileType && fileType !== 'e57'

  // Suppress hover/select interactions when box select tool is active
  const interactionsDisabled = Boolean(boxSelectMode)

  // Collect all group IDs in the hovered group's subtree
  const hoveredGroupIds = useMemo(() => {
    if (!hoveredGroupId) return null
    const ids = new Set<string>()
    const queue = [hoveredGroupId]
    while (queue.length > 0) {
      const cur = queue.shift()
      if (!cur) break
      ids.add(cur)
      surfaceGroups.filter(g => g.parentId === cur).forEach(g => queue.push(g.id))
    }
    return ids
  }, [hoveredGroupId, surfaceGroups])

  if (!surfaceColorMode || !isMesh) return null

  return (
    <>
      {surfaces
        .filter((s) => s.visible && s.worldTriangles && s.worldTriangles.length > 0)
        .map((s) => {
          const hovered = !interactionsDisabled && (s.id === hoveredSurfaceId
            || (hoveredGroupIds !== undefined && hoveredGroupIds !== null && s.groupId !== undefined && s.groupId !== null && hoveredGroupIds.has(s.groupId)))
          return (
            <SurfaceOverlayMesh
              key={s.id}
              id={s.id}
              color={s.color}
              triangles={s.worldTriangles as Float32Array}
              hovered={hovered}
              onHover={interactionsDisabled ? () => { /* noop */ } : setHoveredSurfaceId}
              onSelect={interactionsDisabled ? () => { /* noop */ } : setSelectedSurface}
            />
          )
        })}
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
  onSelect: (id: string | null, pos?: { x: number; y: number }) => void
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
        opacity: hovered ? 0.8 : 0.4,
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
        userData={{ isSurfaceOverlay: true }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(id) }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => { e.stopPropagation(); onSelect(id, { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }) }}
      />
      {hovered && (
        <mesh geometry={geometry} renderOrder={3}>
          <meshBasicMaterial color={color} wireframe transparent opacity={0.45} depthWrite={false} />
        </mesh>
      )}
    </>
  )
}
