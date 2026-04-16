

import { useState } from 'react'
import { useViewer } from '../../lib/viewerState'
import type { SavedMeasurement, MeasurementGroup } from '../../lib/viewerState'
import { useUnits } from '../../lib/units'

type Point3 = { x: number; y: number; z: number }

function dist3(a: Point3 | undefined, b: Point3 | undefined) {
  if (!a || !b) return 0
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
}

function polygonArea3D(pts: { x: number; y: number; z: number }[]): number {
  if (pts.length < 3) return 0
  let nx = 0, ny = 0, nz = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    nx += a.y * b.z - a.z * b.y
    ny += a.z * b.x - a.x * b.z
    nz += a.x * b.y - a.y * b.x
  }
  return Math.hypot(nx, ny, nz) / 2
}

function measurePerimeter(m: SavedMeasurement): number {
  const pts = m.points
  if (pts.length < 2) return 0
  let d = pts.slice(0, -1).reduce((s, p, i) => s + dist3(p, pts[i + 1]), 0)
  const lastPt = pts.at(-1)
  if (m.isClosed && pts.length >= 3 && lastPt) d += dist3(lastPt, pts[0])
  return d
}

function measureNetArea(m: SavedMeasurement, all: SavedMeasurement[]): number {
  if (!m.isClosed || m.points.length < 3) return 0
  const gross = polygonArea3D(m.points)
  const cutouts = all
    .filter(c => c.parentId === m.id && c.isClosed && c.points.length >= 3)
    .reduce((s, c) => s + polygonArea3D(c.points), 0)
  return gross - cutouts
}

function descendantGroupIds(groupId: string, groups: MeasurementGroup[]): Set<string> {
  const ids = new Set<string>()
  const queue = [groupId]
  while (queue.length > 0) {
    const cur = queue.shift()
    if (!cur) break
    ids.add(cur)
    groups.filter(g => g.parentId === cur).forEach(g => queue.push(g.id))
  }
  return ids
}

function groupTotals(groupId: string, groups: MeasurementGroup[], measurements: SavedMeasurement[]): { area: number; perimeter: number; count: number } {
  const ids = descendantGroupIds(groupId, groups)
  const members = measurements.filter(m => m.groupId !== undefined && m.groupId !== null && ids.has(m.groupId) && !m.parentId)
  return {
    area: members.reduce((s, m) => s + measureNetArea(m, measurements), 0),
    perimeter: members.reduce((s, m) => s + measurePerimeter(m), 0),
    count: members.length,
  }
}

// ── Single measurement row ───────────────────────────────────────────────────

function MeasurementRow({
  m, onRename, onDelete, onToggleVisibility, onHighlight, onSetParent, onSetGroup,
  fmt, fmtArea, allMeasurements, allGroups, indent,
}: {
  m: SavedMeasurement
  onRename: (id: string, label: string) => void
  onDelete: (id: string) => void
  onToggleVisibility: (id: string) => void
  onHighlight: (id: string | null, segIdx?: number | null) => void
  onSetParent: (id: string, parentId: string | null) => void
  onSetGroup: (id: string, groupId: string | null) => void
  fmt: (v: number) => string
  fmtArea: (v: number) => string
  allMeasurements: SavedMeasurement[]
  allGroups: MeasurementGroup[]
  indent?: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const isCutout = Boolean(m.parentId)
  const pts = m.points
  const segments = pts.slice(0, -1).map((p, i) => ({ idx: i, length: dist3(p, pts[i + 1]) }))
  const lastPtForClosing = pts.at(-1)
  const closingLength = m.isClosed && pts.length >= 3 && lastPtForClosing ? dist3(lastPtForClosing, pts[0]) : 0
  const totalDist = segments.reduce((s, seg) => s + seg.length, 0) + closingLength
  const grossArea = m.isClosed ? polygonArea3D(pts) : 0
  const cutoutArea = m.isClosed
    ? allMeasurements.filter(c => c.parentId === m.id && c.isClosed && c.points.length >= 3).reduce((s, c) => s + polygonArea3D(c.points), 0)
    : 0
  const netArea = grossArea - cutoutArea
  const possibleParents = allMeasurements.filter(p => p.id !== m.id && p.isClosed && p.points.length >= 3 && !p.parentId)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', borderRadius: 6, overflow: 'hidden',
      opacity: m.visible ? 1 : 0.45, marginLeft: indent ? 12 : 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 6px' }}
        onMouseEnter={() => onHighlight(m.id)} onMouseLeave={() => onHighlight(null)}>
        <button type="button" onClick={() => setExpanded(v => !v)} style={{
          background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 9, padding: 0, flexShrink: 0, width: 12, textAlign: 'center',
        }}>{expanded ? '▼' : '▶'}</button>

        <button type="button" onClick={() => onToggleVisibility(m.id)} title={m.visible ? 'Hide' : 'Show'} style={{
          background: 'none', border: 'none', color: m.visible ? '#94a3b8' : '#475569',
          cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1, flexShrink: 0,
        }}>{m.visible ? '👁' : '👁‍🗨'}</button>

        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: isCutout ? '#ef4444' : (m.isClosed ? '#4ade80' : '#f97316'),
        }} />

        {isCutout && <span style={{ color: '#ef4444', fontSize: 9, flexShrink: 0 }}>↳</span>}

        <input value={m.label} onChange={e => onRename(m.id, e.target.value)} style={{
          flex: 1, background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: 11, fontWeight: 500, outline: 'none', minWidth: 0,
        }} />

        <span style={{ color: '#94a3b8', fontSize: 10, flexShrink: 0, fontFamily: 'monospace' }}>{fmt(totalDist)}</span>

        <button type="button" onClick={() => onDelete(m.id)} title="Delete" style={{
          background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1, flexShrink: 0,
        }}>🗑</button>
      </div>

      {m.isClosed && grossArea > 0 && !isCutout && (
        <div style={{ padding: '0 6px 4px 25px', fontSize: 10, fontFamily: 'monospace', fontWeight: 600, lineHeight: 1.5 }}>
          <span style={{ color: '#4ade80' }}>⬡ {fmtArea(netArea)}</span>
          {cutoutArea > 0 && <span style={{ color: '#64748b', marginLeft: 6 }}>({fmtArea(grossArea)} − {fmtArea(cutoutArea)})</span>}
        </div>
      )}
      {m.isClosed && grossArea > 0 && isCutout && (
        <div style={{ padding: '0 6px 4px 25px', fontSize: 10, color: '#ef4444', fontFamily: 'monospace', fontWeight: 600 }}>− {fmtArea(grossArea)}</div>
      )}

      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '4px 6px 4px 25px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {segments.map((seg, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', padding: '1px 0', cursor: 'default' }}
              onMouseEnter={() => onHighlight(m.id, i)} onMouseLeave={() => onHighlight(null)}>
              <span>Segment {i + 1}</span>
              <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{fmt(seg.length)}</span>
            </div>
          ))}
          {m.isClosed && closingLength > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', padding: '1px 0', cursor: 'default' }}
              onMouseEnter={() => onHighlight(m.id, segments.length)} onMouseLeave={() => onHighlight(null)}>
              <span>Closing</span>
              <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{fmt(closingLength)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: '#e2e8f0', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 3, marginTop: 1 }}>
            <span>Total</span>
            <span style={{ fontFamily: 'monospace' }}>{fmt(totalDist)}</span>
          </div>

          {/* Group assignment */}
          {allGroups.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#64748b' }}>
              <span style={{ flexShrink: 0 }}>Group:</span>
              <select value={m.groupId ?? ''} onChange={e => onSetGroup(m.id, e.target.value || null)} style={{
                flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 3, color: '#94a3b8', fontSize: 9, padding: '1px 2px', outline: 'none', cursor: 'pointer',
              }}>
                <option value="">Ungrouped</option>
                {allGroups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </div>
          )}

          {/* Cutout assignment */}
          {m.isClosed && m.points.length >= 3 && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#64748b' }}>
              <span style={{ flexShrink: 0 }}>Cutout of:</span>
              <select value={m.parentId ?? ''} onChange={e => onSetParent(m.id, e.target.value || null)} style={{
                flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 3, color: '#94a3b8', fontSize: 9, padding: '1px 2px', outline: 'none', cursor: 'pointer',
              }}>
                <option value="">None</option>
                {possibleParents.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Group section ────────────────────────────────────────────────────────────

function MeasurementGroupSection({
  group, allGroups, allMeasurements, depth,
  onRenameGroup, onDeleteGroup, onAddSubGroup,
  onRename, onDelete, onToggleVisibility, onHighlight, onSetParent, onSetGroup, fmt, fmtArea,
}: {
  group: MeasurementGroup
  allGroups: MeasurementGroup[]
  allMeasurements: SavedMeasurement[]
  depth: number
  onRenameGroup: (id: string, patch: Partial<Pick<MeasurementGroup, 'label'>>) => void
  onDeleteGroup: (id: string) => void
  onAddSubGroup: (parentId: string) => void
  onRename: (id: string, label: string) => void
  onDelete: (id: string) => void
  onToggleVisibility: (id: string) => void
  onHighlight: (id: string | null, segIdx?: number | null) => void
  onSetParent: (id: string, parentId: string | null) => void
  onSetGroup: (id: string, groupId: string | null) => void
  fmt: (v: number) => string
  fmtArea: (v: number) => string
}) {
  const [expanded, setExpanded] = useState(true)
  const { area, perimeter, count } = groupTotals(group.id, allGroups, allMeasurements)
  const childGroups = allGroups.filter(g => g.parentId === group.id)
  const directMeasurements = allMeasurements.filter(m => m.groupId === group.id && !m.parentId)

  const orderedRows: { m: SavedMeasurement; indent: boolean }[] = []
  for (const m of directMeasurements) {
    orderedRows.push({ m, indent: false })
    for (const c of allMeasurements.filter(c => c.parentId === m.id)) {
      orderedRows.push({ m: c, indent: true })
    }
  }

  return (
    <div style={{ marginLeft: depth > 0 ? 10 : 0, marginBottom: 3 }}>
      {/* Group header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px',
        background: 'rgba(255,255,255,0.04)', borderRadius: 5,
      }}>
        <button type="button" onClick={() => setExpanded(v => !v)} style={{
          background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 9, padding: 0, flexShrink: 0, width: 12, textAlign: 'center',
        }}>{expanded ? '▼' : '▶'}</button>

        <span style={{ color: '#7dd3fc', fontSize: 9, flexShrink: 0 }}>📁</span>

        <input value={group.label} onChange={e => onRenameGroup(group.id, { label: e.target.value })} style={{
          flex: 1, background: 'transparent', border: 'none', color: '#e2e8f0', fontSize: 11, fontWeight: 600, outline: 'none', minWidth: 0,
        }} />

        {count > 0 && (
          <span style={{ color: '#64748b', fontSize: 9, fontFamily: 'monospace', flexShrink: 0 }}>
            {fmt(perimeter)}
          </span>
        )}

        <button type="button" onClick={() => onAddSubGroup(group.id)} title="Add sub-group" style={{
          background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1, flexShrink: 0,
        }}>+</button>

        <button type="button" onClick={() => onDeleteGroup(group.id)} title="Delete group" style={{
          background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1, flexShrink: 0,
        }}>🗑</button>
      </div>

      {expanded && area > 0 && (
        <div style={{ padding: '0 6px 3px 28px', fontSize: 9, fontFamily: 'monospace', color: '#4ade80', fontWeight: 600 }}>
          Σ {fmtArea(area)}
        </div>
      )}

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
          {childGroups.map(cg => (
            <MeasurementGroupSection key={cg.id} group={cg} allGroups={allGroups} allMeasurements={allMeasurements} depth={depth + 1}
              onRenameGroup={onRenameGroup} onDeleteGroup={onDeleteGroup} onAddSubGroup={onAddSubGroup}
              onRename={onRename} onDelete={onDelete} onToggleVisibility={onToggleVisibility}
              onHighlight={onHighlight} onSetParent={onSetParent} onSetGroup={onSetGroup} fmt={fmt} fmtArea={fmtArea} />
          ))}
          {orderedRows.map(({ m, indent }) => (
            <MeasurementRow key={m.id} m={m} onRename={onRename} onDelete={onDelete}
              onToggleVisibility={onToggleVisibility} onHighlight={onHighlight}
              onSetParent={onSetParent} onSetGroup={onSetGroup} fmt={fmt} fmtArea={fmtArea}
              allMeasurements={allMeasurements} allGroups={allGroups} indent={indent} />
          ))}
          {orderedRows.length === 0 && childGroups.length === 0 && (
            <div style={{ color: '#475569', fontSize: 9, padding: '2px 28px' }}>Empty group</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

export default function MeasurementPanel() {
  const {
    savedMeasurements, removeMeasurement, updateMeasurementLabel, clearAllMeasurements,
    toggleMeasurementVisibility, setHighlightedMeasurement,
    measureActive, setMeasureActive, setMeasurementParent, setMeasurementGroup,
    measurementGroups, addMeasurementGroup, removeMeasurementGroup, updateMeasurementGroup,
  } = useViewer()
  const { fmtLength, fmtArea } = useUnits()
  const [open, setOpen] = useState(true)

  if (savedMeasurements.length === 0 && measurementGroups.length === 0 && !measureActive) return null

  const handleAddGroup = (parentId: string | null = null) => {
    addMeasurementGroup({
      id: `mgrp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: `Group ${measurementGroups.length + 1}`,
      parentId,
    })
  }

  const topGroups = measurementGroups.filter(g => !g.parentId)

  // Ungrouped measurements
  const ungrouped = savedMeasurements.filter(m => !m.groupId && !m.parentId)
  const ungroupedRows: { m: SavedMeasurement; indent: boolean }[] = []
  for (const m of ungrouped) {
    ungroupedRows.push({ m, indent: false })
    for (const c of savedMeasurements.filter(c => c.parentId === m.id)) {
      ungroupedRows.push({ m: c, indent: true })
    }
  }
  // Orphaned cutouts
  const usedIds = new Set(ungroupedRows.map(r => r.m.id))
  for (const m of savedMeasurements) {
    if (!m.groupId && m.parentId && !usedIds.has(m.id)) {
      ungroupedRows.push({ m, indent: false })
    }
  }

  return (
    <div style={{
      position: 'absolute', bottom: 12, left: 12, zIndex: 10,
      background: 'rgba(13,17,23,0.90)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, minWidth: 240, maxWidth: 300,
      maxHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column',
      backdropFilter: 'blur(8px)', fontFamily: 'system-ui, sans-serif', fontSize: 12, color: '#e2e8f0',
    }}>
      <div style={{ padding: '10px 12px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: open ? 8 : 10 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            📏 Measurements
            {savedMeasurements.length > 0 && (
              <span style={{ color: '#64748b', fontWeight: 400, fontSize: 11, marginLeft: 6 }}>{savedMeasurements.length}</span>
            )}
          </span>
          <button type="button" onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>
            {open ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ overflowY: 'auto', padding: '0 12px 10px', flex: 1, minHeight: 0 }}>
          {/* Groups */}
          {topGroups.map(g => (
            <MeasurementGroupSection key={g.id} group={g} allGroups={measurementGroups} allMeasurements={savedMeasurements} depth={0}
              onRenameGroup={updateMeasurementGroup} onDeleteGroup={removeMeasurementGroup} onAddSubGroup={handleAddGroup}
              onRename={updateMeasurementLabel} onDelete={removeMeasurement}
              onToggleVisibility={toggleMeasurementVisibility}
              onHighlight={(id, segIdx) => setHighlightedMeasurement(id, segIdx ?? null)}
              onSetParent={setMeasurementParent} onSetGroup={setMeasurementGroup}
              fmt={fmtLength} fmtArea={fmtArea} />
          ))}

          {/* Ungrouped */}
          {ungroupedRows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
              {topGroups.length > 0 && (
                <div style={{ color: '#475569', fontSize: 9, padding: '4px 0 2px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Ungrouped
                </div>
              )}
              {ungroupedRows.map(({ m, indent }) => (
                <MeasurementRow key={m.id} m={m} onRename={updateMeasurementLabel} onDelete={removeMeasurement}
                  onToggleVisibility={toggleMeasurementVisibility}
                  onHighlight={(id, segIdx) => setHighlightedMeasurement(id, segIdx ?? null)}
                  onSetParent={setMeasurementParent} onSetGroup={setMeasurementGroup}
                  fmt={fmtLength} fmtArea={fmtArea}
                  allMeasurements={savedMeasurements} allGroups={measurementGroups} indent={indent} />
              ))}
            </div>
          )}

          {savedMeasurements.length === 0 && measurementGroups.length === 0 && (
            <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', padding: '8px 0' }}>No measurements yet</div>
          )}

          {/* Bottom actions */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {measureActive ? (
              <button type="button" onClick={() => setMeasureActive(false)} style={{
                flex: 1, padding: '5px 0', background: '#16a34a', border: '1px solid #22c55e',
                borderRadius: 5, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 11,
              }}>✓ Finish</button>
            ) : (
              <button type="button" onClick={() => setMeasureActive(true)} style={{
                flex: 1, padding: '5px 0', background: '#1e293b', border: '1px solid #334155',
                borderRadius: 5, color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: 11,
              }}>+ New</button>
            )}
            <button type="button" onClick={() => handleAddGroup(null)} style={{
              padding: '5px 10px', background: '#1e293b', border: '1px solid #334155',
              borderRadius: 5, color: '#7dd3fc', fontWeight: 600, cursor: 'pointer', fontSize: 11,
            }}>+ Group</button>
            {(savedMeasurements.length > 0 || measurementGroups.length > 0) && (
              <button type="button" onClick={clearAllMeasurements} style={{
                padding: '5px 10px', background: '#1e293b', border: '1px solid #334155',
                borderRadius: 5, color: '#94a3b8', fontWeight: 600, cursor: 'pointer', fontSize: 11,
              }}>Clear All</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
