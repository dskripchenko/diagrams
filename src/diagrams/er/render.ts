/**
 * Drawing an entity relationship diagram with the layered layout. An entity
 * is a table: its name in a header band, then one row per attribute with
 * aligned columns for type, name, keys and comment. Relationships end in
 * crow's feet that sit square on the entity's side.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { basisPath, type Box } from '../../core/geometry'
import { markerDefs, markerId, type MarkerKind } from '../../core/markers'
import { PADDING_X, PADDING_Y } from '../../core/shapes'
import { cssText, mergeStyles, type UserStyle } from '../../core/style'
import { el, type SvgElement } from '../../core/svg'
import {
  decodeEntities,
  measureLabel,
  parseLabel,
  plainLabel,
  renderLabel,
  type FontSpec,
  type MeasuredLabel,
  type TextMeasurer,
} from '../../core/text'
import { BASE_FONT, v } from '../../core/theme'
import type { LayoutNode } from '../../layout/layered'
import { edgeLabel, layoutBoxes, roundedRect, splitFill, type BoxEdge } from '../boxes'
import type { Cardinality, ErDiagram, ErEntity } from './parser'

const ROW_FONT: FontSpec = { ...BASE_FONT, size: 13 }
const KEY_FONT: FontSpec = { ...BASE_FONT, size: 11, weight: 'bold' }
const HEADER_FONT: FontSpec = { ...BASE_FONT, weight: 'bold' }
const ROW_PADDING_Y = 5
/** Space left of each column's text. */
const CELL_PADDING = 12
const RADIUS = 5
const MIN_WIDTH = 110

const MARKERS: Record<Cardinality, MarkerKind> = {
  one: 'er-one',
  'zero-one': 'er-zero-one',
  'one-many': 'er-one-many',
  'zero-many': 'er-zero-many',
}

type Column = 'type' | 'name' | 'keys' | 'comment'

interface Table {
  header: MeasuredLabel
  /** Per attribute, the measured text of each column (absent when empty). */
  rows: Partial<Record<Column, MeasuredLabel>>[]
  /** Left edge of each column, relative to the box's left edge. */
  columns: Partial<Record<Column, number>>
  headerHeight: number
  rowHeight: number
  width: number
  height: number
}

function text(source: string, font: FontSpec, measure: TextMeasurer): MeasuredLabel {
  return measureLabel(plainLabel(decodeEntities(source)), font, measure)
}

function measureTable(entity: ErEntity, measure: TextMeasurer): Table {
  const header = measureLabel(parseLabel(entity.label), HEADER_FONT, measure)
  const rows = entity.attributes.map((a) => {
    const row: Partial<Record<Column, MeasuredLabel>> = {
      type: text(a.type, ROW_FONT, measure),
      name: text(a.name, ROW_FONT, measure),
    }
    if (a.keys.length > 0) row.keys = text(a.keys.join(', '), KEY_FONT, measure)
    if (a.comment) row.comment = text(a.comment, { ...ROW_FONT, style: 'italic' }, measure)
    return row
  })
  const headerHeight = header.height + PADDING_Y * 2
  if (rows.length === 0) {
    const width = Math.max(header.width + PADDING_X * 2, MIN_WIDTH)
    return { header, rows, columns: {}, headerHeight, rowHeight: 0, width, height: headerHeight }
  }
  const rowHeight = ROW_FONT.size * 1.25 + ROW_PADDING_Y * 2
  const columns: Partial<Record<Column, number>> = {}
  let x = 0
  for (const col of ['type', 'name', 'keys', 'comment'] as const) {
    const widest = Math.max(0, ...rows.map((r) => r[col]?.width ?? -1))
    if (!rows.some((r) => r[col])) continue
    columns[col] = x + CELL_PADDING
    x += CELL_PADDING + widest
  }
  x += CELL_PADDING
  const width = Math.max(x, header.width + PADDING_X * 2, MIN_WIDTH)
  return { header, rows, columns, headerHeight, rowHeight, width, height: headerHeight + rowHeight * rows.length }
}

function styleFor(entity: ErEntity, defs: Map<string, UserStyle>): UserStyle {
  return mergeStyles(defs.get('default'), ...entity.classes.map((c) => defs.get(c)), entity.style)
}

function drawEntity(entity: ErEntity, table: Table, box: Box, style: UserStyle): SvgElement {
  const left = box.x - box.width / 2
  const top = box.y - box.height / 2
  const shapeStyle = cssText(style.shape)
  const split = splitFill(style.shape)
  const textStyle = cssText(style.text)
  const classes = ['dg-node', 'dg-entity', ...entity.classes.map((c) => `dg-class-${c.replace(/[^\w-]/g, '')}`)].join(' ')
  if (table.rows.length === 0) {
    return el('g', { class: classes, 'data-id': entity.id }, [
      el('rect', { class: 'dg-shape', x: left, y: top, width: box.width, height: box.height, rx: RADIUS, style: shapeStyle }),
      renderLabel(table.header, box.x, box.y, { className: 'dg-label dg-entity-title', style: textStyle }),
    ])
  }
  // Fills inset by half the border, so the border drawn first stays whole.
  const inset = 0.75
  const inner = box.width - inset * 2
  const children: SvgElement[] = [
    el('rect', { class: 'dg-shape dg-entity-box', x: left, y: top, width: box.width, height: box.height, rx: RADIUS, style: split.frame }),
    el('path', {
      class: 'dg-entity-header',
      d: roundedRect(left + inset, top + inset, inner, table.headerHeight - inset, RADIUS - inset, 0),
      style: split.band,
    }),
  ]
  table.rows.forEach((row, i) => {
    const rowTop = top + table.headerHeight + i * table.rowHeight
    const last = i === table.rows.length - 1
    if (i % 2 === 1) {
      children.push(
        el('path', {
          class: 'dg-entity-row-alt',
          d: roundedRect(left + inset, rowTop, inner, table.rowHeight - (last ? inset : 0), 0, last ? RADIUS - inset : 0),
        }),
      )
    }
    const cy = rowTop + table.rowHeight / 2
    for (const col of ['type', 'name', 'keys', 'comment'] as const) {
      const cell = row[col]
      const at = table.columns[col]
      if (!cell || at === undefined) continue
      children.push(renderLabel(cell, left + at, cy, { anchor: 'start', className: `dg-entity-${col}` }))
    }
  })
  const ruleY = top + table.headerHeight
  children.push(
    el('line', { class: 'dg-entity-rule', x1: left, y1: ruleY, x2: left + box.width, y2: ruleY, style: style.shape.stroke ? `stroke:${style.shape.stroke}` : undefined }),
    renderLabel(table.header, box.x, top + table.headerHeight / 2, { className: 'dg-label dg-entity-title', style: textStyle }),
  )
  return el('g', { class: classes, 'data-id': entity.id }, children)
}

export function renderEr(d: ErDiagram, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const tables = new Map<string, Table>()
  for (const entity of d.entities.values()) tables.set(entity.id, measureTable(entity, measure))

  const edgeLabels = new Map<number, MeasuredLabel>()
  const edges: BoxEdge[] = d.relationships.map((r, i) => {
    let label: { width: number; height: number } | undefined
    if (r.label.trim() !== '') {
      const m = measureLabel(parseLabel(r.label), BASE_FONT, measure)
      edgeLabels.set(i, m)
      label = { width: m.width + 8, height: m.height + 4 }
    }
    return { from: r.from, to: r.to, label }
  })
  const nodes: LayoutNode[] = [...d.entities.values()].map((e) => ({
    id: e.id,
    width: tables.get(e.id)!.width,
    height: tables.get(e.id)!.height,
  }))
  const { result, routes } = layoutBoxes({ direction: d.direction, nodes, edges, nodeSep: 50, rankSep: 84 })

  const used: MarkerKind[] = []
  const edgeEls: SvgElement[] = []
  const labelEls: SvgElement[] = []
  d.relationships.forEach((r, i) => {
    const route = routes[i]
    if (!route) return
    const start = MARKERS[r.fromCardinality]
    const end = MARKERS[r.toCardinality]
    used.push(start, end)
    edgeEls.push(
      el('path', {
        class: r.identifying ? 'dg-edge' : 'dg-edge dg-edge-dashed',
        d: basisPath(route.points),
        'marker-start': `url(#${markerId(id, start, true)})`,
        'marker-end': `url(#${markerId(id, end)})`,
        'data-from': r.from,
        'data-to': r.to,
      }),
    )
    const m = edgeLabels.get(i)
    if (m && route.label) labelEls.push(edgeLabel(m, route.label))
  })

  const nodeEls = [...d.entities.values()].map((e) =>
    drawEntity(e, tables.get(e.id)!, result.nodes.get(e.id)!, styleFor(e, d.classDefs)),
  )

  const r = `#${id}`
  const css = [
    `${r} .dg-entity .dg-entity-box{fill:${v('--dg-row-fill')}}`,
    `${r} .dg-entity-title{font-weight:bold}`,
    `${r} .dg-entity-header{fill:${v('--dg-node-fill')};stroke:none}`,
    `${r} .dg-entity-row-alt{fill:${v('--dg-row-alt-fill')};stroke:none}`,
    `${r} .dg-entity-rule{stroke:${v('--dg-node-stroke')};stroke-width:1px}`,
    `${r} .dg-entity-type,${r} .dg-entity-comment{fill:${v('--dg-text-muted')}}`,
    `${r} .dg-entity-type,${r} .dg-entity-name,${r} .dg-entity-comment{font-size:${ROW_FONT.size}px}`,
    `${r} .dg-entity-comment{font-style:italic}`,
    `${r} .dg-entity-keys{fill:${v('--dg-node-stroke')};font-size:${KEY_FONT.size}px;font-weight:bold}`,
    `${r} .dg-edge-dashed{stroke-dasharray:6 4}`,
  ].join('')

  return documentSvg({
    id,
    type: 'er',
    width: result.width,
    height: result.height,
    title: title ?? d.accessibility.title ?? 'Entity relationship diagram',
    description: d.accessibility.description,
    defs: markerDefs(id, used),
    body: [el('g', { class: 'dg-edges' }, edgeEls), el('g', { class: 'dg-edge-labels' }, labelEls), el('g', { class: 'dg-nodes' }, nodeEls)],
    css,
  })
}
