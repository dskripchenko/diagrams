/**
 * Sankey diagrams: flows between nodes, as bands as wide as their value.
 *
 *     sankey-beta
 *       Solar,Grid,40
 *       Wind,Grid,30
 *       Grid,Homes,45
 *       Grid,Industry,25
 *
 * One flow per line, comma-separated: source, target, value (quotes for a
 * name with a comma, `""` for a quote inside). Nodes stand in columns — a
 * node one column right of the furthest node that flows into it, the final
 * ones in the last column; flows must not go round in a circle.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { DiagramError, tooLarge } from '../../core/errors'
import { statements } from '../../core/scanner'
import { el, PathBuilder, type SvgElement } from '../../core/svg'
import { measureLabel, parseLabel, renderLabel, type TextMeasurer } from '../../core/text'
import { BASE_FONT, paletteVar, v } from '../../core/theme'
import { accessibilityStatement, type Accessibility } from '../common'

export interface SankeyLink {
  source: string
  target: string
  value: number
}

export interface SankeyDiagram {
  type: 'sankey'
  nodes: string[]
  links: SankeyLink[]
  accessibility: Accessibility
}

const MAX_LINKS = 1000

/** One CSV record: fields split by commas, `"…"` quoting, `""` for a quote. */
function csv(line: string): string[] | null {
  const out: string[] = []
  let i = 0
  while (i <= line.length) {
    if (line[i] === '"') {
      let field = ''
      i++
      for (;;) {
        if (i >= line.length) return null
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"'
          i += 2
        } else if (line[i] === '"') {
          i++
          break
        } else field += line[i++]
      }
      out.push(field.trim())
      while (i < line.length && line[i] !== ',') if (line[i++] !== ' ') return null
      i++
    } else {
      const next = line.indexOf(',', i)
      const end = next < 0 ? line.length : next
      out.push(line.slice(i, end).trim())
      i = end + 1
    }
  }
  return out
}

export function parseSankey(source: string): SankeyDiagram {
  const list = statements(source)
  const head = list[0]
  if (!head || !/^sankey(-beta)?$/.test(head.text)) throw new DiagramError('A sankey diagram starts with "sankey-beta"', head?.line ?? 1, 1)
  const d: SankeyDiagram = { type: 'sankey', nodes: [], links: [], accessibility: {} }
  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const consumed = accessibilityStatement(list, i, d.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    const f = csv(s.text)
    if (!f || f.length !== 3) throw new DiagramError(`"${s.text}" is not a flow`, s.line, s.column, 'Source,Target,42')
    const value = Number(f[2])
    if (!Number.isFinite(value) || value < 0) throw new DiagramError(`"${f[2]}" is not a value`, s.line, s.column)
    if (f[0] === '' || f[1] === '') throw new DiagramError('A flow needs a source and a target', s.line, s.column)
    for (const n of [f[0]!, f[1]!]) if (!d.nodes.includes(n)) d.nodes.push(n)
    d.links.push({ source: f[0]!, target: f[1]!, value })
    if (d.links.length > MAX_LINKS) throw tooLarge('flows', d.links.length, MAX_LINKS)
  }
  if (d.links.length === 0) throw new DiagramError('The diagram has no flows', 0, 0, 'Source,Target,42')
  return d
}

const HEIGHT = 420
const NODE_WIDTH = 14
const NODE_GAP = 14
const COLUMN_GAP = 170

export function renderSankey(d: SankeyDiagram, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const out = new Map(d.nodes.map((n) => [n, [] as SankeyLink[]]))
  const into = new Map(d.nodes.map((n) => [n, [] as SankeyLink[]]))
  for (const l of d.links) {
    out.get(l.source)!.push(l)
    into.get(l.target)!.push(l)
  }

  // Columns: the longest path from a source; nodes with no outflow go last.
  const column = new Map<string, number>()
  const state = new Map<string, 'visiting' | 'done'>()
  const depth = (n: string): number => {
    if (state.get(n) === 'done') return column.get(n)!
    if (state.get(n) === 'visiting') throw new DiagramError(`The flows go round in a circle through "${n}"`)
    state.set(n, 'visiting')
    const c = Math.max(0, ...into.get(n)!.map((l) => depth(l.source) + 1))
    state.set(n, 'done')
    column.set(n, c)
    return c
  }
  for (const n of d.nodes) depth(n)
  const last = Math.max(...column.values())
  for (const n of d.nodes) if (out.get(n)!.length === 0) column.set(n, last)
  const value = (n: string) => Math.max(sum(into.get(n)!), sum(out.get(n)!))
  const columns: string[][] = Array.from({ length: last + 1 }, () => [])
  for (const n of d.nodes) columns[column.get(n)!]!.push(n)

  // One scale for all columns: the fullest column fills the height.
  const scale = Math.min(...columns.filter((c) => c.length > 0).map((c) => (HEIGHT - NODE_GAP * (c.length - 1)) / Math.max(1e-9, c.reduce((a, n) => a + value(n), 0))))
  const labels = new Map(d.nodes.map((n) => [n, measureLabel(parseLabel(`${n} ${fmt(value(n))}`), BASE_FONT, measure)]))
  const leftPad = 0
  const rightPad = Math.max(0, ...columns[last]!.map((n) => labels.get(n)!.width)) + 10
  const box = new Map<string, { x: number; y: number; h: number }>()
  columns.forEach((c, k) => {
    const total = c.reduce((a, n) => a + value(n), 0) * scale + NODE_GAP * (c.length - 1)
    let y = (HEIGHT - total) / 2
    for (const n of c) {
      const h = Math.max(1, value(n) * scale)
      box.set(n, { x: leftPad + k * COLUMN_GAP, y, h })
      y += h + NODE_GAP
    }
  })

  // Bands: each starts where the source's previous outflows end, top to bottom
  // in the order of their targets, and lands the same way on the target.
  const outY = new Map(d.nodes.map((n) => [n, box.get(n)!.y]))
  const inY = new Map(d.nodes.map((n) => [n, box.get(n)!.y]))
  const ordered = [...d.links].sort((a, b) => box.get(a.target)!.y - box.get(b.target)!.y || box.get(a.source)!.y - box.get(b.source)!.y)
  const bands: SvgElement[] = []
  for (const l of ordered) {
    const w = l.value * scale
    const s = box.get(l.source)!
    const t = box.get(l.target)!
    const y1 = outY.get(l.source)! + w / 2
    const y2 = inY.get(l.target)! + w / 2
    outY.set(l.source, outY.get(l.source)! + w)
    inY.set(l.target, inY.get(l.target)! + w)
    const x1 = s.x + NODE_WIDTH
    const x2 = t.x
    const mx = (x1 + x2) / 2
    bands.push(
      el('path', {
        class: 'dg-sankey-link',
        d: new PathBuilder().moveTo(r(x1), r(y1)).curveTo(r(mx), r(y1), r(mx), r(y2), r(x2), r(y2)).toString(),
        style: `stroke:${paletteVar(d.nodes.indexOf(l.source))};stroke-width:${r(Math.max(1, w))}px`,
      }, [el('title', {}, [{ text: `${l.source} → ${l.target}: ${fmt(l.value)}` }])]),
    )
  }
  const nodes: SvgElement[] = d.nodes.map((n, k) => {
    const b = box.get(n)!
    const l = labels.get(n)!
    const atEnd = column.get(n) === last && last > 0
    return el('g', { class: 'dg-sankey-node', 'data-id': n }, [
      el('rect', { class: 'dg-sankey-bar', x: r(b.x), y: r(b.y), width: NODE_WIDTH, height: r(b.h), style: `fill:${paletteVar(k)}` }),
      renderLabel(l, r(atEnd ? b.x - 6 : b.x + NODE_WIDTH + 6), r(b.y + b.h / 2), { anchor: atEnd ? 'end' : 'start', className: 'dg-sankey-label' }),
    ])
  })
  const r_ = `#${id}`
  const css = [
    `${r_} .dg-sankey-link{fill:none;stroke-opacity:0.35}`,
    `${r_} .dg-sankey-link:hover{stroke-opacity:0.6}`,
    // A halo in the background colour keeps a label readable over the bands it crosses.
    `${r_} .dg-sankey-label{fill:${v('--dg-text')};paint-order:stroke;stroke:${v('--dg-row-fill')};stroke-width:3px;stroke-linejoin:round}`,
  ].join('')
  // Labels of the first columns stand right of their bars; give the last column's labels room on the left.
  const width = leftPad + last * COLUMN_GAP + NODE_WIDTH + (last === 0 ? rightPad : 0)
  return documentSvg({
    id,
    type: 'sankey',
    width,
    height: HEIGHT,
    title: title ?? d.accessibility.title ?? 'Sankey diagram',
    description: d.accessibility.description,
    body: [el('g', { class: 'dg-sankey-links' }, bands), el('g', { class: 'dg-sankey-nodes' }, nodes)],
    css,
  })
}

function sum(links: SankeyLink[]): number {
  return links.reduce((a, l) => a + l.value, 0)
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

function r(n: number): number {
  return Math.round(n * 100) / 100
}
