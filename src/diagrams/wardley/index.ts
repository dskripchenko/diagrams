/**
 * Wardley maps, in the DSL of OnlineWardleyMaps.
 *
 *     title Tea shop
 *     anchor Business [0.95, 0.63]
 *     component Cup of tea [0.79, 0.61]
 *     component Tea [0.63, 0.81]
 *     component Kettle [0.43, 0.35] (inertia)
 *     component Power [0.1, 0.7] (outsource)
 *     evolve Kettle 0.62
 *     Business->Cup of tea
 *     Cup of tea->Tea
 *     Kettle->Power; limited by
 *     note Standardising power [0.3, 0.49]
 *
 * Coordinates are [visibility, evolution]: visibility from 0 (invisible,
 * bottom) to 1 (visible, top), evolution from 0 (genesis, left) to 1
 * (commodity, right). Supported: `title`, `anchor`, `component` (with
 * `label [dx, dy]`, `(inertia)`, `(build)`, `(buy)`, `(outsource)`,
 * `(market)`, `(ecosystem)`), `market`, `ecosystem`, links `A->B`, `A+>B`
 * (flow), `A+<>B`, with `; label`; `evolve Name 0.62 [label …]`, `pipeline
 * Name [start, end]`, `note text [v, e]`, `annotation n [[v, e], …] text`,
 * `annotations [v, e]`, `evolution A->B->C->D` (stage names). `style` and
 * `size` are accepted.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { DiagramError, tooLarge } from '../../core/errors'
import { markerDefs, markerId } from '../../core/markers'
import { statements } from '../../core/scanner'
import { el, type SvgElement } from '../../core/svg'
import { measureLabel, parseLabel, renderLabel, wrapLabel, type TextMeasurer } from '../../core/text'
import { BASE_FONT, v } from '../../core/theme'
import { accessibilityStatement, type Accessibility } from '../common'

export type Method = 'build' | 'buy' | 'outsource'

export interface WardleyComponent {
  name: string
  visibility: number
  evolution: number
  kind: 'component' | 'anchor' | 'market' | 'ecosystem'
  label?: [number, number]
  inertia: boolean
  method?: Method
  evolve?: { to: number; label?: string }
  pipeline?: [number, number]
}

export interface WardleyLink {
  from: string
  to: string
  flow: boolean
  label?: string
}

export interface WardleyMap {
  type: 'wardley'
  title?: string
  stages: [string, string, string, string]
  components: Map<string, WardleyComponent>
  links: WardleyLink[]
  notes: { text: string; visibility: number; evolution: number }[]
  annotations: { n: number; points: [number, number][]; text: string }[]
  annotationsAt?: [number, number]
  accessibility: Accessibility
}

/** True when the source declares components or anchors with coordinates. */
export function isWardley(source: string): boolean {
  return /^\s*wardley(-beta)?\s*$/m.test(source.split('\n').find((l) => l.trim() !== '') ?? '') || /^\s*(component|anchor)\s+.+\[\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\]/m.test(source)
}

const COORD = String.raw`\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]`
const MAX = 500

function unit(n: number, line: number, column: number): number {
  if (!(n >= 0 && n <= 1)) throw new DiagramError(`${n} is not between 0 and 1`, line, column)
  return n
}

export function parseWardley(source: string): WardleyMap {
  const list = statements(source)
  const d: WardleyMap = { type: 'wardley', stages: ['Genesis', 'Custom-Built', 'Product (+rental)', 'Commodity (+utility)'], components: new Map(), links: [], notes: [], annotations: [], accessibility: {} }
  const pending: { name: string; to: number; label?: string; line: number; column: number }[] = []
  const pipes: { name: string; range: [number, number]; line: number; column: number }[] = []
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!
    if (i === 0 && /^wardley(-beta)?$/.test(s.text)) continue
    const consumed = accessibilityStatement(list, i, d.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    let m: RegExpExecArray | null
    if ((m = /^title\s+(.*)$/.exec(s.text))) {
      d.title = m[1]!.trim()
      continue
    }
    if ((m = new RegExp(`^(component|anchor|market|ecosystem)\\s+(.+?)\\s*${COORD}\\s*(.*)$`).exec(s.text))) {
      const [, kind, name, vis, evo, rest] = m
      const c: WardleyComponent = { name: name!, visibility: unit(Number(vis), s.line, s.column), evolution: unit(Number(evo), s.line, s.column), kind: kind as WardleyComponent['kind'], inertia: false }
      const label = new RegExp(`label\\s*\\[\\s*(-?[\\d.]+)\\s*,\\s*(-?[\\d.]+)\\s*\\]`).exec(rest!)
      if (label) c.label = [Number(label[1]), Number(label[2])]
      for (const flag of rest!.matchAll(/\((\w+)\)/g)) {
        const f = flag[1]!.toLowerCase()
        if (f === 'inertia') c.inertia = true
        else if (f === 'build' || f === 'buy' || f === 'outsource') c.method = f
        else if (f === 'market' || f === 'ecosystem') c.kind = f
      }
      if (d.components.has(c.name)) throw new DiagramError(`"${c.name}" is declared twice`, s.line, s.column)
      d.components.set(c.name, c)
      if (d.components.size > MAX) throw tooLarge('components', d.components.size, MAX)
      continue
    }
    if ((m = /^evolve\s+(.+?)\s+(-?[\d.]+)(?:\s+label\s*\[[^\]]*\])?\s*(.*)$/.exec(s.text))) {
      pending.push({ name: m[1]!.trim(), to: unit(Number(m[2]), s.line, s.column), label: m[3]?.trim() || undefined, line: s.line, column: s.column })
      continue
    }
    if ((m = new RegExp(`^pipeline\\s+(.+?)\\s*${COORD}$`).exec(s.text))) {
      pipes.push({ name: m[1]!.trim(), range: [unit(Number(m[2]), s.line, s.column), unit(Number(m[3]), s.line, s.column)], line: s.line, column: s.column })
      continue
    }
    if ((m = new RegExp(`^note\\s+(.+?)\\s*${COORD}$`).exec(s.text))) {
      d.notes.push({ text: m[1]!.trim(), visibility: unit(Number(m[2]), s.line, s.column), evolution: unit(Number(m[3]), s.line, s.column) })
      continue
    }
    if ((m = /^annotation\s+(\d+)\s*(\[\s*\[.*\]\s*\]|\[[^\]]*\])\s*(.*)$/.exec(s.text))) {
      const pts = [...m[2]!.matchAll(/\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g)].map((p) => [unit(Number(p[1]), s.line, s.column), unit(Number(p[2]), s.line, s.column)] as [number, number])
      d.annotations.push({ n: Number(m[1]), points: pts, text: m[3]!.trim() })
      continue
    }
    if ((m = new RegExp(`^annotations\\s*${COORD}$`).exec(s.text))) {
      d.annotationsAt = [Number(m[1]), Number(m[2])]
      continue
    }
    if ((m = /^evolution\s+(.+)$/.exec(s.text))) {
      const parts = m[1]!.split('->').map((p) => p.trim())
      if (parts.length !== 4) throw new DiagramError('Evolution has four stages', s.line, s.column, 'evolution Genesis->Custom->Product->Commodity')
      d.stages = parts as WardleyMap['stages']
      continue
    }
    if (/^(style|size|url|accelerator|deaccelerator|submap)\b/.test(s.text)) continue
    if ((m = /^(.+?)\s*(\+<>|\+>|\+<|->)\s*(.+?)(?:\s*;\s*(.*))?$/.exec(s.text))) {
      d.links.push({ from: m[1]!.trim(), to: m[3]!.trim(), flow: m[2] !== '->', label: m[4]?.trim() || undefined })
      continue
    }
    throw new DiagramError(`"${s.text}" is not a Wardley map statement`, s.line, s.column, 'component Name [0.5, 0.5], A->B')
  }
  for (const p of pending) {
    const c = d.components.get(p.name)
    if (!c) throw new DiagramError(`"${p.name}" is not a component`, p.line, p.column)
    c.evolve = { to: p.to, label: p.label }
  }
  for (const p of pipes) {
    const c = d.components.get(p.name)
    if (!c) throw new DiagramError(`"${p.name}" is not a component`, p.line, p.column)
    c.pipeline = p.range
  }
  for (const l of d.links) for (const n of [l.from, l.to]) if (!d.components.has(n)) throw new DiagramError(`"${n}" is not a component`)
  if (d.components.size === 0) throw new DiagramError('The map has no components', 0, 0, 'component Name [0.5, 0.5]')
  return d
}

const W = 760
const H = 500
const LEFT = 30
const BOTTOM = 40

export function renderWardley(d: WardleyMap, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const small = { ...BASE_FONT, size: 12 }
  const titleLabel = d.title ? measureLabel(parseLabel(d.title), { ...BASE_FONT, size: 18, weight: 'bold' }, measure) : null
  const top = titleLabel ? titleLabel.height + 14 : 0
  const x = (e: number) => LEFT + e * W
  const y = (vis: number) => top + (1 - vis) * H
  const body: SvgElement[] = []
  if (titleLabel) body.push(renderLabel(titleLabel, LEFT + W / 2, titleLabel.height / 2, { className: 'dg-title' }))

  // The frame: value chain up the left, evolution along the bottom, stage boundaries.
  body.push(el('rect', { class: 'dg-wardley-frame', x: LEFT, y: top, width: W, height: H }))
  const bounds = [0, 0.174, 0.4, 0.7, 1]
  for (const b of bounds.slice(1, -1)) body.push(el('line', { class: 'dg-wardley-stage', x1: x(b), y1: top, x2: x(b), y2: top + H }))
  d.stages.forEach((stage, k) => {
    const l = measureLabel(parseLabel(stage), small, measure)
    body.push(renderLabel(l, x((bounds[k]! + bounds[k + 1]!) / 2), top + H + 14, { className: 'dg-wardley-axis' }))
  })
  body.push(renderLabel(measureLabel(parseLabel('Evolution'), { ...small, weight: 'bold' }, measure), x(1) - 34, top + H + 32, { className: 'dg-wardley-axis' }))
  const axis = (text: string, vy: number) => el('g', { transform: `translate(${LEFT - 12},${vy}) rotate(-90)` }, [renderLabel(measureLabel(parseLabel(text), small, measure), 0, 0, { className: 'dg-wardley-axis' })])
  body.push(axis('Visible', top + 40), axis('Invisible', top + H - 44), axis('Value chain', top + H / 2))

  // Pipelines under everything.
  for (const c of d.components.values()) {
    if (!c.pipeline) continue
    body.push(el('rect', { class: 'dg-wardley-pipeline', x: x(c.pipeline[0]), y: y(c.visibility) - 9, width: (c.pipeline[1] - c.pipeline[0]) * W, height: 18, rx: 2 }))
  }
  // Links, then evolution arrows.
  const links: SvgElement[] = []
  for (const l of d.links) {
    const a = d.components.get(l.from)!
    const b = d.components.get(l.to)!
    links.push(el('line', { class: l.flow ? 'dg-wardley-link dg-wardley-flow' : 'dg-wardley-link', x1: x(a.evolution), y1: y(a.visibility), x2: x(b.evolution), y2: y(b.visibility) }))
    if (l.label) {
      const lab = measureLabel(parseLabel(l.label), small, measure)
      links.push(renderLabel(lab, (x(a.evolution) + x(b.evolution)) / 2, (y(a.visibility) + y(b.visibility)) / 2 - 8, { className: 'dg-wardley-link-text' }))
    }
  }
  body.push(el('g', { class: 'dg-wardley-links' }, links))
  const hasEvolve = [...d.components.values()].some((c) => c.evolve)
  for (const c of d.components.values()) {
    if (!c.evolve) continue
    body.push(el('line', { class: 'dg-wardley-evolve', x1: x(c.evolution) + 7, y1: y(c.visibility), x2: x(c.evolve.to) - 8, y2: y(c.visibility), 'marker-end': `url(#${markerId(id, 'arrow')})` }))
    body.push(el('circle', { class: 'dg-wardley-ghost', cx: x(c.evolve.to), cy: y(c.visibility), r: 6 }))
    const l = measureLabel(parseLabel(c.evolve.label ?? c.name), small, measure)
    body.push(renderLabel(l, x(c.evolve.to) + 10, y(c.visibility) - 10, { anchor: 'start', className: 'dg-wardley-ghost-text' }))
  }
  // Components on top.
  for (const c of d.components.values()) {
    const cx = x(c.evolution)
    const cy = y(c.visibility)
    const parts: SvgElement[] = []
    if (c.kind === 'anchor') {
      const l = measureLabel(parseLabel(c.name), { ...BASE_FONT, weight: 'bold' }, measure)
      parts.push(renderLabel(l, cx, cy, { className: 'dg-wardley-anchor' }))
      body.push(el('g', { class: 'dg-wardley-component', 'data-id': c.name }, parts))
      continue
    }
    if (c.method) parts.push(el('circle', { class: `dg-wardley-method dg-wardley-${c.method}`, cx, cy, r: 13 }))
    if (c.inertia) parts.push(el('rect', { class: 'dg-wardley-inertia', x: cx + 11, y: cy - 10, width: 5, height: 20 }))
    if (c.kind === 'market' || c.kind === 'ecosystem') {
      parts.push(el('circle', { class: 'dg-wardley-dot', cx, cy, r: 9 }))
      parts.push(el('circle', { class: 'dg-wardley-dot', cx, cy, r: c.kind === 'market' ? 3 : 5 }))
    } else parts.push(el('circle', { class: 'dg-wardley-dot', cx, cy, r: 6 }))
    // The inertia bar stands right of the dot: the label goes past it.
    const [dx, dy] = c.label ?? (c.inertia ? [24, -8] : [10, -8])
    const l = measureLabel(wrapLabel(parseLabel(c.name), 160, small, measure), small, measure)
    parts.push(renderLabel(l, cx + dx, cy + dy, { anchor: 'start', className: 'dg-wardley-text' }))
    body.push(el('g', { class: 'dg-wardley-component', 'data-id': c.name }, parts))
  }
  for (const n of d.notes) {
    const l = measureLabel(wrapLabel(parseLabel(n.text), 220, small, measure), { ...small, weight: 'bold' }, measure)
    body.push(renderLabel(l, x(n.evolution), y(n.visibility), { anchor: 'start', className: 'dg-wardley-note' }))
  }
  for (const a of d.annotations) {
    for (const [vis, evo] of a.points) {
      body.push(el('circle', { class: 'dg-wardley-annotation', cx: x(evo), cy: y(vis), r: 9 }))
      body.push(renderLabel(measureLabel(parseLabel(String(a.n)), small, measure), x(evo), y(vis), { className: 'dg-wardley-annotation-n' }))
    }
  }
  if (d.annotations.length > 0) {
    const [vis, evo] = d.annotationsAt ?? [0.98, 0.02]
    const rows = [...d.annotations].sort((p, q) => p.n - q.n).map((a) => measureLabel(parseLabel(`${a.n}. ${a.text}`), small, measure))
    const w = Math.max(...rows.map((r) => r.width)) + 16
    const h = rows.reduce((s, r) => s + r.height + 4, 8)
    body.push(el('rect', { class: 'dg-wardley-annotations', x: x(evo), y: y(vis), width: w, height: h, rx: 3 }))
    let ty = y(vis) + 6
    for (const r of rows) {
      body.push(renderLabel(r, x(evo) + 8, ty + r.height / 2, { anchor: 'start', className: 'dg-wardley-text' }))
      ty += r.height + 4
    }
  }
  const r = `#${id}`
  const css = [
    `${r} .dg-title{fill:${v('--dg-text')};font-size:18px;font-weight:bold}`,
    `${r} .dg-wardley-frame{fill:none;stroke:${v('--dg-cluster-stroke')};stroke-width:1px}`,
    `${r} .dg-wardley-stage{stroke:${v('--dg-cluster-stroke')};stroke-width:1px;stroke-dasharray:4 4}`,
    `${r} .dg-wardley-axis{fill:${v('--dg-text-muted')};font-size:12px}`,
    `${r} .dg-wardley-link{stroke:${v('--dg-line')};stroke-width:1.2px}`,
    `${r} .dg-wardley-flow{stroke-dasharray:6 3;stroke-width:2px}`,
    `${r} .dg-wardley-link-text{fill:${v('--dg-text-muted')};font-size:12px}`,
    `${r} .dg-wardley-dot{fill:${v('--dg-row-fill')};stroke:${v('--dg-text')};stroke-width:1.5px}`,
    `${r} .dg-wardley-text{fill:${v('--dg-text')};font-size:12px}`,
    `${r} .dg-wardley-anchor{fill:${v('--dg-text')};font-weight:bold}`,
    `${r} .dg-wardley-inertia{fill:${v('--dg-text')}}`,
    `${r} .dg-wardley-method{stroke:none}`,
    `${r} .dg-wardley-build{fill:rgba(0,0,0,0.12)}`,
    `${r} .dg-wardley-buy{fill:rgba(99,102,241,0.25)}`,
    `${r} .dg-wardley-outsource{fill:rgba(234,88,12,0.25)}`,
    `${r} .dg-wardley-evolve{stroke:${v('--dg-task-crit-stroke')};stroke-width:1.5px;stroke-dasharray:5 3}`,
    `${r} .dg-wardley-ghost{fill:${v('--dg-row-fill')};stroke:${v('--dg-task-crit-stroke')};stroke-width:1.5px}`,
    `${r} .dg-wardley-ghost-text{fill:${v('--dg-task-crit-stroke')};font-size:12px}`,
    `${r} .dg-wardley-pipeline{fill:none;stroke:${v('--dg-text')};stroke-width:1px}`,
    `${r} .dg-wardley-note{fill:${v('--dg-text')};font-size:12px;font-weight:bold}`,
    `${r} .dg-wardley-annotation{fill:${v('--dg-row-fill')};stroke:${v('--dg-line')};stroke-width:1px}`,
    `${r} .dg-wardley-annotation-n{fill:${v('--dg-text')};font-size:12px}`,
    `${r} .dg-wardley-annotations{fill:${v('--dg-row-fill')};stroke:${v('--dg-cluster-stroke')};stroke-width:1px}`,
  ].join('')
  return documentSvg({
    id,
    type: 'wardley',
    width: LEFT + W + 4,
    height: top + H + BOTTOM,
    title: title ?? d.accessibility.title ?? d.title ?? 'Wardley map',
    description: d.accessibility.description,
    defs: hasEvolve ? markerDefs(id, ['arrow']) : [],
    body,
    css,
  })
}
