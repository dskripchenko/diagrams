/**
 * Quadrant charts: points on two axes from 0 to 1, over four labelled
 * quadrants.
 *
 *     quadrantChart
 *       title Reach and engagement
 *       x-axis Low reach --> High reach
 *       y-axis Low engagement --> High engagement
 *       quadrant-1 Expand
 *       quadrant-2 Promote
 *       quadrant-3 Re-evaluate
 *       quadrant-4 Improve
 *       Campaign A: [0.3, 0.6]
 *       Campaign B: [0.45, 0.23] radius: 10, color: #ff3300
 *       Campaign C:::hot: [0.8, 0.8]
 *       classDef hot color: #e11d48, radius: 8
 *
 * Quadrant 1 is top right, 2 top left, 3 bottom left, 4 bottom right.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { DiagramError } from '../../core/errors'
import { statements } from '../../core/scanner'
import { parseStyle } from '../../core/style'
import { el, type SvgElement } from '../../core/svg'
import { measureLabel, parseLabel, renderLabel, wrapLabel, type TextMeasurer } from '../../core/text'
import { BASE_FONT, v } from '../../core/theme'
import { accessibilityStatement, type Accessibility } from '../common'

export interface PointStyle {
  radius?: number
  color?: string
  strokeColor?: string
  strokeWidth?: number
}

export interface QuadrantPoint {
  label: string
  x: number
  y: number
  style: PointStyle
  classes: string[]
}

export interface QuadrantChart {
  type: 'quadrant'
  title?: string
  xAxis: [string, string]
  yAxis: [string, string]
  /** Labels of quadrants 1 to 4. */
  quadrants: [string, string, string, string]
  points: QuadrantPoint[]
  classDefs: Map<string, PointStyle>
  accessibility: Accessibility
}

/** `radius: 10, color: #f30, stroke-color: #0ff, stroke-width: 2px`, validated. */
function pointStyle(text: string, line: number, column: number): PointStyle {
  const out: PointStyle = {}
  for (const part of text.split(',')) {
    const m = /^\s*([\w-]+)\s*:\s*(.+?)\s*$/.exec(part)
    if (!m) continue
    const key = m[1]!.toLowerCase()
    const value = m[2]!
    if (key === 'radius') out.radius = Math.min(40, Math.max(1, Number(value)))
    else if (key === 'color') out.color = parseStyle(`fill:${value}`, line, column).shape.fill
    else if (key === 'stroke-color') out.strokeColor = parseStyle(`stroke:${value}`, line, column).shape.stroke
    else if (key === 'stroke-width') out.strokeWidth = Math.min(10, Math.max(0, parseFloat(value)))
    else throw new DiagramError(`"${key}" is not a point style`, line, column, 'radius, color, stroke-color, stroke-width')
  }
  return out
}

export function parseQuadrant(source: string): QuadrantChart {
  const list = statements(source)
  const head = list[0]
  if (!head || head.text !== 'quadrantChart') throw new DiagramError('A quadrant chart starts with "quadrantChart"', head?.line ?? 1, 1)
  const d: QuadrantChart = { type: 'quadrant', xAxis: ['', ''], yAxis: ['', ''], quadrants: ['', '', '', ''], points: [], classDefs: new Map(), accessibility: {} }
  const axis = (text: string): [string, string] => {
    const [a, b] = text.split(/\s*-->\s*/)
    return [a!.trim(), (b ?? '').trim()]
  }
  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const consumed = accessibilityStatement(list, i, d.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    let m: RegExpExecArray | null
    if ((m = /^title\s+(.*)$/.exec(s.text))) d.title = m[1]!.trim()
    else if ((m = /^x-axis\s+(.*)$/.exec(s.text))) d.xAxis = axis(m[1]!)
    else if ((m = /^y-axis\s+(.*)$/.exec(s.text))) d.yAxis = axis(m[1]!)
    else if ((m = /^quadrant-([1-4])\s+(.*)$/.exec(s.text))) d.quadrants[Number(m[1]) - 1] = m[2]!.trim()
    else if ((m = /^classDef\s+([\w-]+)\s+(.*)$/.exec(s.text))) d.classDefs.set(m[1]!, pointStyle(m[2]!, s.line, s.column))
    else if ((m = /^(.+?)(?::::([\w-]+))?\s*:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*(.*)$/.exec(s.text))) {
      const x = Number(m[3])
      const y = Number(m[4])
      if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw new DiagramError('A point\'s coordinates are from 0 to 1', s.line, s.column)
      d.points.push({ label: m[1]!.trim(), x, y, style: pointStyle(m[5]!, s.line, s.column), classes: m[2] ? [m[2]] : [] })
    } else throw new DiagramError(`"${s.text}" is not a quadrant chart statement`, s.line, s.column, 'Point: [0.3, 0.6]')
  }
  return d
}

const SIZE = 420

export function renderQuadrant(d: QuadrantChart, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const small = { ...BASE_FONT, size: 12 }
  const titleLabel = d.title ? measureLabel(parseLabel(d.title), { ...BASE_FONT, size: 18, weight: 'bold' }, measure) : null
  const top = titleLabel ? titleLabel.height + 14 : 0
  const yAxisWidth = d.yAxis.some(Boolean) ? 24 : 0
  const left = yAxisWidth
  const half = SIZE / 2
  const body: SvgElement[] = []
  if (titleLabel) body.push(renderLabel(titleLabel, left + half, titleLabel.height / 2, { className: 'dg-title' }))
  // Quadrants 1..4: top right, top left, bottom left, bottom right.
  const origins: [number, number][] = [[left + half, top], [left, top], [left, top + half], [left + half, top + half]]
  origins.forEach(([qx, qy], k) => {
    body.push(el('rect', { class: `dg-quadrant dg-quadrant-${k + 1}`, x: qx, y: qy, width: half, height: half }))
    if (d.quadrants[k]) {
      const l = measureLabel(wrapLabel(parseLabel(d.quadrants[k]!), half - 20, { ...BASE_FONT, weight: 'bold' }, measure), { ...BASE_FONT, weight: 'bold' }, measure)
      body.push(renderLabel(l, qx + half / 2, qy + 14 + l.height / 2, { className: 'dg-quadrant-label' }))
    }
  })
  body.push(el('rect', { class: 'dg-quadrant-frame', x: left, y: top, width: SIZE, height: SIZE }))
  body.push(el('line', { class: 'dg-quadrant-axis', x1: left + half, y1: top, x2: left + half, y2: top + SIZE }))
  body.push(el('line', { class: 'dg-quadrant-axis', x1: left, y1: top + half, x2: left + SIZE, y2: top + half }))

  // Axis texts: low at the start, high at the end; one text alone is centred.
  const [xLow, xHigh] = d.xAxis
  const axisY = top + SIZE + 14
  if (xLow && xHigh) {
    body.push(renderLabel(measureLabel(parseLabel(xLow), small, measure), left + half / 2, axisY, { className: 'dg-quadrant-axis-text' }))
    body.push(renderLabel(measureLabel(parseLabel(xHigh), small, measure), left + half + half / 2, axisY, { className: 'dg-quadrant-axis-text' }))
  } else if (xLow) body.push(renderLabel(measureLabel(parseLabel(xLow), small, measure), left + half, axisY, { className: 'dg-quadrant-axis-text' }))
  const [yLow, yHigh] = d.yAxis
  const yText = (text: string, cy: number) => el('g', { transform: `translate(${yAxisWidth / 2},${cy}) rotate(-90)` }, [renderLabel(measureLabel(parseLabel(text), small, measure), 0, 0, { className: 'dg-quadrant-axis-text' })])
  if (yLow && yHigh) {
    body.push(yText(yLow, top + half + half / 2))
    body.push(yText(yHigh, top + half / 2))
  } else if (yLow) body.push(yText(yLow, top + half))

  for (const p of d.points) {
    const style = Object.assign({}, ...p.classes.map((c) => d.classDefs.get(c) ?? {}), p.style) as PointStyle
    const cx = left + p.x * SIZE
    const cy = top + (1 - p.y) * SIZE
    const radius = style.radius ?? 5
    const css = [style.color ? `fill:${style.color}` : '', style.strokeColor ? `stroke:${style.strokeColor}` : '', style.strokeWidth !== undefined ? `stroke-width:${style.strokeWidth}px` : ''].filter(Boolean).join(';')
    const l = measureLabel(parseLabel(p.label), small, measure)
    body.push(
      el('g', { class: 'dg-quadrant-point' }, [
        el('circle', { class: 'dg-quadrant-dot', cx, cy, r: radius, style: css || undefined }),
        renderLabel(l, cx, cy + radius + 4 + l.height / 2, { className: 'dg-quadrant-point-text' }),
      ]),
    )
  }

  const r = `#${id}`
  const css = [
    `${r} .dg-title{fill:${v('--dg-text')};font-size:18px;font-weight:bold}`,
    `${r} .dg-quadrant-1{fill:${v('--dg-quadrant-1')}}`,
    `${r} .dg-quadrant-2{fill:${v('--dg-quadrant-2')}}`,
    `${r} .dg-quadrant-3{fill:${v('--dg-quadrant-3')}}`,
    `${r} .dg-quadrant-4{fill:${v('--dg-quadrant-4')}}`,
    `${r} .dg-quadrant-frame{fill:none;stroke:${v('--dg-cluster-stroke')};stroke-width:1px}`,
    `${r} .dg-quadrant-axis{stroke:${v('--dg-cluster-stroke')};stroke-width:1px}`,
    `${r} .dg-quadrant-label{fill:${v('--dg-text-muted')};font-weight:bold}`,
    `${r} .dg-quadrant-axis-text{fill:${v('--dg-text-muted')};font-size:12px}`,
    `${r} .dg-quadrant-dot{fill:${v('--dg-node-stroke')};stroke:${v('--dg-row-fill')};stroke-width:1.5px}`,
    `${r} .dg-quadrant-point-text{fill:${v('--dg-text')};font-size:12px}`,
  ].join('')
  return documentSvg({
    id,
    type: 'quadrant',
    width: left + SIZE,
    height: top + SIZE + 28,
    title: title ?? d.accessibility.title ?? d.title ?? 'Quadrant chart',
    description: d.accessibility.description,
    body,
    css,
  })
}
