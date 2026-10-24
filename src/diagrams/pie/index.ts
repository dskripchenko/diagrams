/**
 * Pie charts.
 *
 *     pie showData
 *         title Pets adopted by volunteers
 *         "Dogs" : 386
 *         "Cats" : 85
 *
 * Slices are drawn in source order, clockwise from twelve o'clock — the order
 * the author wrote is the order the reader sees, in the chart and the legend.
 */
import { DiagramError } from '../../core/errors'
import { statements, unquote } from '../../core/scanner'
import { el, PathBuilder, type SvgElement } from '../../core/svg'
import { BASE_FONT, paletteVar, v } from '../../core/theme'
import { measureLabel, parseLabel, plainLabel, renderLabel, type TextMeasurer } from '../../core/text'
import { documentSvg, type RenderResult } from '../../core/document'
import { accessibilityStatement, type Accessibility } from '../common'

export interface PieSlice {
  label: string
  value: number
}

export interface PieDiagram {
  type: 'pie'
  title?: string
  showData: boolean
  slices: PieSlice[]
  accessibility: Accessibility
}

export function parsePie(source: string): PieDiagram {
  const list = statements(source)
  const head = list[0]
  if (!head || !/^pie\b/.test(head.text)) {
    throw new DiagramError('A pie chart starts with "pie"', head?.line ?? 1, 1)
  }
  const diagram: PieDiagram = { type: 'pie', showData: false, slices: [], accessibility: {} }
  let rest = head.text.slice(3).trim()
  if (/^showData\b/.test(rest)) {
    diagram.showData = true
    rest = rest.slice(8).trim()
  }
  if (/^title\b/.test(rest)) {
    diagram.title = rest.slice(5).trim()
  } else if (rest !== '') {
    throw new DiagramError(`Unexpected "${rest}" after "pie"`, head.line, head.column + 4)
  }

  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const consumed = accessibilityStatement(list, i, diagram.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    if (/^title\b/.test(s.text)) {
      diagram.title = s.text.slice(5).trim()
      continue
    }
    if (/^showData$/.test(s.text)) {
      diagram.showData = true
      continue
    }
    const m = /^("(?:[^"]*)"|'(?:[^']*)')\s*:\s*(-?[0-9]+(?:\.[0-9]+)?)\s*$/.exec(s.text)
    if (!m) {
      throw new DiagramError(`"${s.text}" is not a slice`, s.line, s.column, 'Write "Label" : 42')
    }
    const value = Number(m[2])
    if (value < 0) {
      throw new DiagramError('A slice cannot be negative', s.line, s.column)
    }
    diagram.slices.push({ label: unquote(m[1]!.replace(/^'|'$/g, '"')), value })
  }
  if (diagram.slices.length === 0) {
    throw new DiagramError('The pie chart has no slices', 0, 0, 'Add lines like "Label" : 42')
  }
  return diagram
}

const RADIUS = 130
const LEGEND_GAP = 28
const SWATCH = 14

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

export function renderPie(
  diagram: PieDiagram,
  measure: TextMeasurer,
  id: string,
  title?: string,
): RenderResult {
  const total = diagram.slices.reduce((sum, s) => sum + s.value, 0)
  if (total <= 0) {
    throw new DiagramError('All slices are zero', 0, 0)
  }
  const titleFont = { ...BASE_FONT, size: 18, weight: 'bold' as const }
  const titleMeasured = diagram.title ? measureLabel(plainLabel(diagram.title), titleFont, measure) : null
  const top = titleMeasured ? titleMeasured.height + 16 : 0
  const cx = RADIUS
  const cy = top + RADIUS

  const body: SvgElement[] = []

  const slices: SvgElement[] = []
  const labels: SvgElement[] = []
  let angle = -Math.PI / 2
  const visible = diagram.slices.filter((s) => s.value > 0)
  diagram.slices.forEach((slice, index) => {
    if (slice.value <= 0) return
    const fraction = slice.value / total
    const sweep = fraction * Math.PI * 2
    const fill = paletteVar(index)
    if (visible.length === 1) {
      slices.push(el('circle', { class: 'dg-pie-slice', cx, cy, r: RADIUS, style: `fill:${fill}` }))
    } else {
      const a0 = angle
      const a1 = angle + sweep
      const path = new PathBuilder()
        .moveTo(cx, cy)
        .lineTo(cx + RADIUS * Math.cos(a0), cy + RADIUS * Math.sin(a0))
        .arcTo(RADIUS, RADIUS, 0, sweep > Math.PI, true, cx + RADIUS * Math.cos(a1), cy + RADIUS * Math.sin(a1))
        .close()
      slices.push(el('path', { class: 'dg-pie-slice', d: path.toString(), style: `fill:${fill}` }))
    }
    // Percentages under 3% would not fit inside their slice.
    if (fraction >= 0.03) {
      const mid = angle + sweep / 2
      const r = visible.length === 1 ? 0 : RADIUS * 0.68
      const pct = `${Math.round(fraction * 1000) / 10}%`
      labels.push(
        renderLabel(measureLabel(plainLabel(pct), BASE_FONT, measure), cx + r * Math.cos(mid), cy + r * Math.sin(mid), {
          className: 'dg-pie-percent',
        }),
      )
    }
    angle += sweep
  })

  // Legend.
  const legendX = RADIUS * 2 + LEGEND_GAP
  const rowHeight = 22
  const legendHeight = diagram.slices.length * rowHeight
  const legendTop = cy - legendHeight / 2
  let legendWidth = 0
  const legend: SvgElement[] = diagram.slices.map((slice, index) => {
    const text = diagram.showData ? `${slice.label} [${formatValue(slice.value)}]` : slice.label
    const measured = measureLabel(parseLabel(text), BASE_FONT, measure)
    legendWidth = Math.max(legendWidth, SWATCH + 8 + measured.width)
    const y = legendTop + index * rowHeight + rowHeight / 2
    return el('g', { class: 'dg-pie-legend-item' }, [
      el('rect', {
        x: legendX,
        y: y - SWATCH / 2,
        width: SWATCH,
        height: SWATCH,
        rx: 3,
        style: `fill:${paletteVar(index)}`,
      }),
      renderLabel(measured, legendX + SWATCH + 8, y, { anchor: 'start', className: 'dg-pie-legend' }),
    ])
  })

  const width = legendX + legendWidth
  const height = Math.max(cy + RADIUS, legendTop + legendHeight)
  if (titleMeasured && diagram.title) {
    body.push(renderLabel(titleMeasured, width / 2, titleMeasured.height / 2, { className: 'dg-title' }))
  }
  body.push(el('g', { class: 'dg-pie-slices' }, slices), el('g', {}, labels), el('g', {}, legend))

  const css = [
    `#${id} .dg-pie-slice{stroke:${v('--dg-pie-stroke')};stroke-width:2px}`,
    `#${id} .dg-pie-percent{fill:${v('--dg-pie-text')};font-weight:600}`,
    `#${id} .dg-pie-legend{fill:${v('--dg-text')}}`,
    `#${id} .dg-title{fill:${v('--dg-text')};font-size:18px;font-weight:bold}`,
  ].join('')

  return documentSvg({
    id,
    type: 'pie',
    width,
    height,
    title: title ?? diagram.accessibility.title ?? diagram.title ?? 'Pie chart',
    description: diagram.accessibility.description,
    body,
    css,
  })
}
