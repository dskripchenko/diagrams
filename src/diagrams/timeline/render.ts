/**
 * Timelines: one column per time period along a horizontal arrow, the
 * period above the arrow and its events stacked below it. Sections are
 * headers over the columns they contain.
 *
 * Colours follow Mermaid: without sections every period has its own colour;
 * with sections a section and everything in it share one.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { el, num, type SvgElement } from '../../core/svg'
import {
  measureLabel,
  parseLabel,
  renderLabel,
  wrapLabel,
  type FontSpec,
  type MeasuredLabel,
  type TextMeasurer,
} from '../../core/text'
import { BASE_FONT, paletteVar, v } from '../../core/theme'
import type { TimelineDiagram, TimelinePeriod } from './parser'

const COLUMN = 168
const COLUMN_GAP = 16
const PAD_X = 12
const TITLE_FONT: FontSpec = { ...BASE_FONT, size: 18, weight: 'bold' }
const SECTION_FONT: FontSpec = { ...BASE_FONT, weight: 'bold' }
const PERIOD_FONT: FontSpec = { ...BASE_FONT, weight: 'bold' }
const EVENT_FONT: FontSpec = { ...BASE_FONT, size: 13 }
/* Room left for the measurer being wrong outside a browser; see gantt. */
const FIT = 1.08

interface Column {
  period: TimelinePeriod | null
  section: number | null
  colour: number
}

function wrapped(text: string, font: FontSpec, measure: TextMeasurer): MeasuredLabel {
  return measureLabel(wrapLabel(parseLabel(text), (COLUMN - PAD_X * 2) / FIT, font, measure), font, measure)
}

export function renderTimeline(diagram: TimelineDiagram, measure: TextMeasurer, id: string, title?: string): RenderResult {
  // Columns in order; a section without periods still gets one, so its header is drawn.
  const columns: Column[] = []
  let colours = 0
  const sectionColour = new Map<number, number>()
  const colourOf = (section: number | null) => {
    if (section === null) return colours++
    let c = sectionColour.get(section)
    if (c === undefined) {
      c = colours++
      sectionColour.set(section, c)
    }
    return c
  }
  let p = 0
  const periods = diagram.periods
  // Periods before the first section come first.
  while (p < periods.length && periods[p]!.section === null) {
    columns.push({ period: periods[p]!, section: null, colour: colourOf(null) })
    p++
  }
  diagram.sections.forEach((_, s) => {
    const before = columns.length
    while (p < periods.length && periods[p]!.section === s) {
      columns.push({ period: periods[p]!, section: s, colour: colourOf(s) })
      p++
    }
    if (columns.length === before) columns.push({ period: null, section: s, colour: colourOf(s) })
  })

  const hasSections = diagram.sections.length > 0
  const xOf = (index: number) => index * (COLUMN + COLUMN_GAP)
  const width = Math.max(columns.length * (COLUMN + COLUMN_GAP) - COLUMN_GAP, 0)

  // Measure everything first: rows share a height so the boxes line up.
  const titleLabel = diagram.title ? measureLabel(parseLabel(diagram.title), TITLE_FONT, measure) : null
  const sectionSpans = diagram.sections.map((section, s) => {
    const indices = columns.flatMap((c, i) => (c.section === s ? [i] : []))
    const first = indices[0]!
    const last = indices[indices.length - 1]!
    const spanWidth = xOf(last) + COLUMN - xOf(first)
    const label = measureLabel(
      wrapLabel(parseLabel(section.label), (spanWidth - PAD_X * 2) / FIT, SECTION_FONT, measure),
      SECTION_FONT,
      measure,
    )
    return { x: xOf(first), width: spanWidth, label, colour: sectionColour.get(s)! }
  })
  const periodLabels = columns.map((c) => (c.period ? wrapped(c.period.label, PERIOD_FONT, measure) : null))
  const eventLabels = columns.map((c) => (c.period ? c.period.events.map((e) => wrapped(e, EVENT_FONT, measure)) : []))

  const titleH = titleLabel ? titleLabel.height + 16 : 0
  const sectionH = hasSections ? Math.max(34, ...sectionSpans.map((s) => s.label.height + 16)) : 0
  const periodH = Math.max(40, ...periodLabels.map((l) => (l ? l.height + 20 : 0)))
  const sectionTop = titleH
  const periodTop = sectionTop + (hasSections ? sectionH + 12 : 0)
  const periodBottom = periodTop + periodH
  const axisY = periodBottom + 24
  const eventsTop = axisY + 24
  const EVENT_GAP = 10

  const back: SvgElement[] = []
  const front: SvgElement[] = []


  for (const span of sectionSpans) {
    front.push(
      el('g', { class: 'dg-node dg-tl-section' }, [
        el('rect', {
          class: 'dg-tl-section-box',
          x: span.x,
          y: sectionTop,
          width: span.width,
          height: sectionH,
          rx: 6,
          style: `fill:${paletteVar(span.colour)}`,
        }),
        renderLabel(span.label, span.x + span.width / 2, sectionTop + sectionH / 2, { className: 'dg-tl-section-text' }),
      ]),
    )
  }

  // The arrow under the periods.
  const axisEnd = width + 18
  back.push(
    el('line', { class: 'dg-tl-axis', x1: -6, y1: axisY, x2: axisEnd - 8, y2: axisY }),
    el('polygon', {
      class: 'dg-tl-arrow',
      points: `${num(axisEnd - 10)},${num(axisY - 6)} ${num(axisEnd)},${num(axisY)} ${num(axisEnd - 10)},${num(axisY + 6)}`,
    }),
  )

  let bottom = axisY + 8
  columns.forEach((column, index) => {
    if (!column.period) return
    const x = xOf(index)
    const cx = x + COLUMN / 2
    const colour = paletteVar(column.colour)
    const periodLabel = periodLabels[index]!
    const solid = !hasSections
    front.push(
      el('g', { class: 'dg-node dg-tl-period', 'data-line': column.period.line }, [
        el('rect', {
          class: solid ? 'dg-tl-period-box dg-tl-solid' : 'dg-tl-period-box',
          x,
          y: periodTop,
          width: COLUMN,
          height: periodH,
          rx: 6,
          style: solid ? `fill:${colour}` : `fill:${colour};stroke:${colour}`,
        }),
        renderLabel(periodLabel, cx, periodTop + periodH / 2, {
          className: solid ? 'dg-tl-period-text dg-tl-on-solid' : 'dg-tl-period-text',
        }),
      ]),
    )

    // Connector from the period through the axis to its events.
    const events = eventLabels[index]!
    const connectorEnd = events.length > 0 ? eventsTop : axisY
    back.push(el('line', { class: 'dg-tl-connector', x1: cx, y1: periodBottom, x2: cx, y2: connectorEnd, style: `stroke:${colour}` }))
    front.push(el('circle', { class: 'dg-tl-dot', cx, cy: axisY, r: 5, style: `fill:${colour}` }))

    let y = eventsTop
    events.forEach((label, e) => {
      const h = Math.max(32, label.height + 14)
      if (e > 0) {
        back.push(el('line', { class: 'dg-tl-connector', x1: cx, y1: y - EVENT_GAP, x2: cx, y2: y, style: `stroke:${colour}` }))
      }
      front.push(
        el('g', { class: 'dg-node dg-tl-event' }, [
          el('rect', { class: 'dg-tl-event-box', x, y, width: COLUMN, height: h, rx: 6, style: `fill:${colour};stroke:${colour}` }),
          renderLabel(label, cx, y + h / 2, { className: 'dg-tl-event-text' }),
        ]),
      )
      y += h + EVENT_GAP
    })
    bottom = Math.max(bottom, y - EVENT_GAP)
  })

  // A title wider than the columns widens the picture; the columns stay centred under it.
  const content = axisEnd + 12
  const total = Math.max(content, titleLabel ? titleLabel.width : 0)
  const left = 6 + (total - content) / 2
  const body: SvgElement[] = []
  if (titleLabel) body.push(renderLabel(titleLabel, total / 2, titleLabel.height / 2, { className: 'dg-title' }))
  body.push(el('g', { transform: `translate(${num(left)},0)` }, [...back, ...front]))
  const r = `#${id}`
  const css = [
    `${r} .dg-title{fill:${v('--dg-text')};font-size:18px;font-weight:bold}`,
    `${r} .dg-tl-section-text{fill:${v('--dg-pie-text')};font-weight:bold}`,
    `${r} .dg-tl-period-box{fill-opacity:0.2;stroke-width:1.5px}`,
    `${r} .dg-tl-period-box.dg-tl-solid{fill-opacity:1;stroke:none}`,
    `${r} .dg-tl-period-text{fill:${v('--dg-text')};font-weight:bold}`,
    `${r} .dg-tl-on-solid{fill:${v('--dg-pie-text')}}`,
    `${r} .dg-tl-event-box{fill-opacity:0.08;stroke-opacity:0.6;stroke-width:1px}`,
    `${r} .dg-tl-event-text{fill:${v('--dg-text')};font-size:13px}`,
    `${r} .dg-tl-axis{stroke:${v('--dg-line')};stroke-width:2px}`,
    `${r} .dg-tl-arrow{fill:${v('--dg-line')}}`,
    `${r} .dg-tl-connector{stroke-width:1.5px;stroke-dasharray:4 3;stroke-opacity:0.8}`,
  ].join('')

  return documentSvg({
    id,
    type: 'timeline',
    width: total,
    height: bottom,
    title: title ?? diagram.accessibility.title ?? diagram.title ?? 'Timeline',
    description: diagram.accessibility.description,
    body,
    css,
  })
}
