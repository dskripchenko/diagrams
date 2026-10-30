/**
 * Timing diagrams: signals over time, one row each — a robust signal steps
 * between levels, a concise one shows its state as a band, a binary one is
 * high or low, a clock is a square wave. Messages are arrows between rows at
 * a moment; highlights shade a span of time.
 *
 * The model is filled by the PlantUML reader (`robust`, `concise`, `@100`,
 * `X is State`); the renderer draws it.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { markerDefs, markerId } from '../../core/markers'
import { el, PathBuilder, type SvgElement } from '../../core/svg'
import { measureLabel, parseLabel, renderLabel, type MeasuredLabel, type TextMeasurer } from '../../core/text'
import { BASE_FONT, v } from '../../core/theme'
import type { Accessibility } from '../common'

export type SignalKind = 'robust' | 'concise' | 'binary' | 'clock'

export interface SignalChange {
  at: number
  state: string
}

export interface Signal {
  id: string
  label: string
  kind: SignalKind
  /** Robust signals: the levels, bottom to top. */
  states: string[]
  changes: SignalChange[]
  /** Clocks: the period, the high part of it, the first rising edge. */
  clock?: { period: number; pulse: number; offset: number }
}

export interface TimingMessage {
  from: string
  to: string
  at: number
  /** The arrival time; equal to `at` unless the message took time. */
  until: number
  text: string
}

export interface TimingHighlight {
  from: number
  to: number
  text: string
  color?: string
}

export interface TimingDiagram {
  type: 'timing'
  title?: string
  signals: Signal[]
  messages: TimingMessage[]
  highlights: TimingHighlight[]
  accessibility: Accessibility
}

const ROW_GAP = 14
const PLOT_WIDTH = 720
const LEVEL = 22
const BAND = 26
const AXIS = 28

/** A round axis step: 1, 2 or 5 times a power of ten, about `span / 6`. */
function step(span: number): number {
  const raw = span / 6
  const p = 10 ** Math.floor(Math.log10(raw || 1))
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p
  return 10 * p
}

const round = (n: number) => Math.round(n * 100) / 100

export function renderTiming(d: TimingDiagram, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const labels = d.signals.map((s) => measureLabel(parseLabel(s.label), { ...BASE_FONT, weight: 'bold' }, measure))
  const levelLabels = d.signals.map((s) => (s.kind === 'robust' ? s.states.map((st) => measureLabel(parseLabel(st), BASE_FONT, measure)) : []))
  // Names in the first column, a robust signal's levels in the second.
  const nameWidth = Math.max(40, ...labels.map((l) => l.width))
  const levelWidth = Math.max(0, ...levelLabels.flat().map((l) => l.width))
  const gutter = 8 + nameWidth + (levelWidth > 0 ? 16 + levelWidth : 0) + 12

  // Time span: every change, message and highlight, and a clock's first periods.
  const times = [0, ...d.signals.flatMap((s) => s.changes.map((c) => c.at)), ...d.messages.flatMap((m) => [m.at, m.until]), ...d.highlights.flatMap((h) => [h.from, h.to])]
  const t0 = Math.min(...times)
  let t1 = Math.max(...times)
  for (const s of d.signals) if (s.clock) t1 = Math.max(t1, t0 + s.clock.period * 4)
  if (t1 === t0) t1 = t0 + 100
  const tick = step(t1 - t0)
  t1 = Math.ceil(t1 / tick) * tick + tick
  const scale = PLOT_WIDTH / (t1 - t0)
  const x = (t: number) => gutter + (t - t0) * scale

  const titleLabel = d.title ? measureLabel(parseLabel(d.title), { ...BASE_FONT, size: 18, weight: 'bold' }, measure) : null
  let y = titleLabel ? titleLabel.height + 14 : 0
  const top = y
  const rows: { signal: Signal; top: number; height: number; label: MeasuredLabel; levels: MeasuredLabel[] }[] = []
  d.signals.forEach((s, i) => {
    const height = s.kind === 'robust' ? Math.max(2, s.states.length) * LEVEL + 10 : BAND + 12
    rows.push({ signal: s, top: y, height, label: labels[i]!, levels: levelLabels[i]! })
    y += height + ROW_GAP
  })
  const bottom = y - ROW_GAP
  const rowOf = new Map(rows.map((r) => [r.signal.id, r]))

  const body: SvgElement[] = []
  if (titleLabel) body.push(renderLabel(titleLabel, (gutter + PLOT_WIDTH) / 2, titleLabel.height / 2, { className: 'dg-title' }))

  // Highlights under everything.
  for (const h of d.highlights) {
    const hl = h.text ? measureLabel(parseLabel(h.text), BASE_FONT, measure) : null
    body.push(
      el('g', { class: 'dg-timing-highlight' }, [
        el('rect', { class: 'dg-timing-highlight-box', x: round(x(h.from)), y: top, width: round((h.to - h.from) * scale), height: bottom - top, style: h.color ? `fill:${h.color};fill-opacity:0.45` : undefined }),
        hl ? renderLabel(hl, round(x((h.from + h.to) / 2)), top + hl.height / 2 + 2, { className: 'dg-timing-highlight-text' }) : null,
      ]),
    )
  }

  // Grid and axis.
  const grid: SvgElement[] = []
  for (let t = Math.ceil(t0 / tick) * tick; t <= t1; t += tick) {
    grid.push(el('line', { class: 'dg-timing-grid', x1: round(x(t)), y1: top, x2: round(x(t)), y2: bottom + 4 }))
    const tl = measureLabel(parseLabel(String(round(t))), { ...BASE_FONT, size: 12 }, measure)
    grid.push(renderLabel(tl, round(x(t)), bottom + 8 + tl.height / 2, { className: 'dg-timing-tick' }))
  }
  body.push(el('g', { class: 'dg-timing-axis' }, grid))

  for (const r of rows) {
    const s = r.signal
    const parts: SvgElement[] = [renderLabel(r.label, 8, r.top + 12, { anchor: 'start', className: 'dg-timing-name' })]
    const mid = r.top + r.height / 2
    if (s.kind === 'robust') {
      const levelY = (state: string) => {
        const k = Math.max(0, s.states.indexOf(state))
        return r.top + r.height - 5 - LEVEL / 2 - k * LEVEL
      }
      r.levels.forEach((l, k) => parts.push(renderLabel(l, gutter - 8, r.top + r.height - 5 - LEVEL / 2 - k * LEVEL, { anchor: 'end', className: 'dg-timing-level' })))
      if (s.changes.length > 0) {
        const p = new PathBuilder().moveTo(round(x(s.changes[0]!.at)), round(levelY(s.changes[0]!.state)))
        s.changes.forEach((c, k) => {
          if (k > 0) p.lineTo(round(x(c.at)), round(levelY(s.changes[k - 1]!.state))).lineTo(round(x(c.at)), round(levelY(c.state)))
        })
        p.lineTo(round(x(t1)), round(levelY(s.changes[s.changes.length - 1]!.state)))
        parts.push(el('path', { class: 'dg-timing-wave', d: p.toString() }))
      }
    } else if (s.kind === 'concise') {
      s.changes.forEach((c, k) => {
        const end = s.changes[k + 1]?.at ?? t1
        if (/^\{(-|hidden)\}$/.test(c.state)) return
        const a = x(c.at)
        const b = x(end)
        const h = BAND / 2
        const slant = Math.min(5, (b - a) / 3)
        const points = [[a, mid], [a + slant, mid - h], [b - slant, mid - h], [b, mid], [b - slant, mid + h], [a + slant, mid + h]]
        parts.push(el('polygon', { class: 'dg-timing-band', points: points.map(([px, py]) => `${round(px!)},${round(py!)}`).join(' ') }))
        const tl = measureLabel(parseLabel(c.state), { ...BASE_FONT, size: 13 }, measure)
        if (tl.width < b - a - 2 * slant) parts.push(renderLabel(tl, round((a + b) / 2), mid, { className: 'dg-timing-state' }))
      })
    } else {
      const high = r.top + 8
      const low = r.top + r.height - 8
      const p = new PathBuilder()
      if (s.kind === 'clock' && s.clock) {
        const { period, pulse, offset } = s.clock
        p.moveTo(round(x(t0)), low)
        for (let t = t0 + offset; t < t1; t += period) {
          const fall = Math.min(t + pulse, t1)
          p.lineTo(round(x(t)), low).lineTo(round(x(t)), high).lineTo(round(x(fall)), high).lineTo(round(x(fall)), low)
        }
        p.lineTo(round(x(t1)), low)
      } else {
        const level = (state: string) => (/^(high|1|on|true)$/i.test(state) ? high : low)
        if (s.changes.length > 0) {
          p.moveTo(round(x(s.changes[0]!.at)), level(s.changes[0]!.state))
          s.changes.forEach((c, k) => {
            if (k > 0) p.lineTo(round(x(c.at)), level(s.changes[k - 1]!.state)).lineTo(round(x(c.at)), level(c.state))
          })
          p.lineTo(round(x(t1)), level(s.changes[s.changes.length - 1]!.state))
        }
      }
      parts.push(el('path', { class: 'dg-timing-wave', d: p.toString() }))
    }
    body.push(el('g', { class: `dg-timing-signal dg-timing-${s.kind}`, 'data-id': s.id }, parts))
  }

  // Messages on top: from the middle of one row to the middle of another.
  for (const m of d.messages) {
    const a = rowOf.get(m.from)
    const b = rowOf.get(m.to)
    if (!a || !b) continue
    const x1 = round(x(m.at))
    const x2 = round(x(m.until))
    const y1 = a.top + a.height / 2
    const y2 = b.top + b.height / 2
    const ml = m.text ? measureLabel(parseLabel(m.text), { ...BASE_FONT, size: 13 }, measure) : null
    body.push(
      el('g', { class: 'dg-timing-message' }, [
        el('line', { class: 'dg-timing-arrow', x1, y1, x2, y2, 'marker-end': `url(#${markerId(id, 'arrow')})` }),
        ml ? renderLabel(ml, round((x1 + x2) / 2 + ml.width / 2 + 4), round((y1 + y2) / 2), { className: 'dg-timing-message-text' }) : null,
      ]),
    )
  }

  const r = `#${id}`
  const css = [
    `${r} .dg-title{fill:${v('--dg-text')};font-size:18px;font-weight:bold}`,
    `${r} .dg-timing-grid{stroke:${v('--dg-grid')};stroke-width:1px}`,
    `${r} .dg-timing-tick{fill:${v('--dg-text-muted')};font-size:12px}`,
    `${r} .dg-timing-name{fill:${v('--dg-text')};font-weight:bold}`,
    `${r} .dg-timing-level{fill:${v('--dg-text-muted')}}`,
    `${r} .dg-timing-wave{fill:none;stroke:${v('--dg-node-stroke')};stroke-width:2px}`,
    `${r} .dg-timing-band{fill:${v('--dg-node-fill')};stroke:${v('--dg-node-stroke')};stroke-width:1.5px}`,
    `${r} .dg-timing-state{fill:${v('--dg-node-text')};font-size:13px}`,
    `${r} .dg-timing-arrow{stroke:${v('--dg-line')};stroke-width:1.5px}`,
    `${r} .dg-timing-message-text{fill:${v('--dg-text')};font-size:13px}`,
    `${r} .dg-timing-highlight-box{fill:${v('--dg-rect-fill')}}`,
    `${r} .dg-timing-highlight-text{fill:${v('--dg-text-muted')}}`,
  ].join('')

  return documentSvg({
    id,
    type: 'timing',
    width: gutter + PLOT_WIDTH + 8,
    height: bottom + AXIS,
    title: title ?? d.accessibility.title ?? d.title ?? 'Timing diagram',
    description: d.accessibility.description,
    defs: d.messages.length > 0 ? markerDefs(id, ['arrow']) : [],
    body,
    css,
  })
}
