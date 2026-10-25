/**
 * XY charts: a plot area with a category axis and a value axis, bars
 * grouped side by side per category, lines drawn over them.
 *
 * Everything is laid out in two abstract directions — along the categories
 * and along the values — and mapped to x/y at the end, so the vertical and
 * the horizontal chart are one layout read two ways.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { el, PathBuilder, type SvgElement } from '../../core/svg'
import {
  measureLabel,
  parseLabel,
  plainLabel,
  renderLabel,
  wrapLabel,
  type FontSpec,
  type MeasuredLabel,
  type TextMeasurer,
} from '../../core/text'
import { BASE_FONT, paletteVar, v } from '../../core/theme'
import type { XyChart } from './parser'
import { axisFormatter, ticks } from './scale'

const TITLE_FONT: FontSpec = { ...BASE_FONT, size: 18, weight: 'bold' }
const AXIS_TITLE_FONT: FontSpec = { ...BASE_FONT, size: 13, weight: 'bold' }
const TICK_FONT: FontSpec = { ...BASE_FONT, size: 12 }
const LEGEND_FONT: FontSpec = { ...BASE_FONT, size: 13 }
const GAP = 8
const SWATCH = 12
/* Rotated category labels lean at 45 degrees. */
const SIN45 = Math.SQRT1_2

interface Placed {
  measured: MeasuredLabel
  /** Position along the category axis, from the plot's start. */
  at: number
}

/** A category label: one line per `<br>`, the text otherwise as written. */
function categoryLabel(text: string, measure: TextMeasurer, maxWidth?: number): MeasuredLabel {
  const label = parseLabel(text)
  return measureLabel(maxWidth ? wrapLabel(label, maxWidth, TICK_FONT, measure) : label, TICK_FONT, measure)
}

export function renderXyChart(chart: XyChart, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const horizontal = chart.horizontal
  const n = chart.series[0]!.values.length
  const bars = chart.series.filter((s) => s.kind === 'bar')
  const lines = chart.series.filter((s) => s.kind === 'line')

  // Category axis: named categories, a numeric range, or the point numbers.
  const x = chart.xAxis
  const linearX = x?.kind === 'linear' && x.min !== undefined && x.max !== undefined ? { min: x.min, max: x.max } : null
  const categories = x?.kind === 'band' ? x.categories : Array.from({ length: n }, (_, i) => String(i + 1))

  // Plot size: a band per category, within limits that keep a chart readable on a page.
  const catLabels = linearX ? [] : categories.map((c) => categoryLabel(c, measure, horizontal ? 160 : undefined))
  let catLen: number
  if (horizontal) {
    const tallest = Math.max(0, ...catLabels.map((m) => m.height))
    const band = linearX ? 0 : Math.max(30, bars.length * 14 + 12, tallest + 10)
    catLen = linearX ? 320 : Math.min(Math.max(n * band, 120), 1600)
  } else {
    catLen = linearX ? 600 : Math.min(Math.max(n * 60, 400), 800)
  }
  const valueLen = horizontal ? 520 : 320
  const band = catLen / n

  // Value axis: the range as written, or one that holds the data — from zero when there are bars.
  const all = chart.series.flatMap((s) => s.values)
  const y = chart.yAxis
  const explicit = y.min !== undefined && y.max !== undefined
  let dataMin = Math.min(...all)
  let dataMax = Math.max(...all)
  if (bars.length > 0) {
    dataMin = Math.min(dataMin, 0)
    dataMax = Math.max(dataMax, 0)
  }
  const tickCount = horizontal ? Math.max(2, Math.floor(valueLen / 90)) : Math.max(2, Math.floor(valueLen / 45))
  const vt = explicit ? ticks(y.min!, y.max!, tickCount, false) : ticks(dataMin, dataMax, tickCount, true)
  const vmin = explicit ? y.min! : vt.min
  const vmax = explicit ? y.max! : vt.max
  const vfmt = axisFormatter(vt.values, vt.step)
  const vPx = (value: number) => ((value - vmin) / (vmax - vmin)) * valueLen

  // Where each point sits along the category axis.
  const pad = linearX && bars.length > 0 ? band / 2 : 0
  const linearPos = (value: number) => pad + ((value - linearX!.min) / (linearX!.max - linearX!.min)) * (catLen - pad * 2)
  const pointAt = (i: number): number => {
    if (!linearX) return (i + 0.5) * band
    const value = n === 1 ? (linearX.min + linearX.max) / 2 : linearX.min + (i * (linearX.max - linearX.min)) / (n - 1)
    return linearPos(value)
  }

  const placedCats: Placed[] = linearX
    ? (() => {
        const ct = ticks(linearX.min, linearX.max, Math.max(2, Math.floor(catLen / (horizontal ? 40 : 70))), false)
        const fmt = axisFormatter(ct.values, ct.step)
        return ct.values.map((value) => ({ measured: measureLabel(plainLabel(fmt(value)), TICK_FONT, measure), at: linearPos(value) }))
      })()
    : catLabels.map((measured, i) => ({ measured, at: pointAt(i) }))
  const valueLabels = vt.values.map((value) => ({
    measured: measureLabel(plainLabel(vfmt(value)), TICK_FONT, measure),
    at: vPx(value),
  }))

  // Vertical charts tilt category labels that do not fit their band.
  const rotate = !horizontal && !linearX && catLabels.some((m) => m.width > band - 6)

  // Titles and legend.
  const titleLabel = chart.title ? measureLabel(parseLabel(chart.title), TITLE_FONT, measure) : null
  const catTitle = x?.title ? measureLabel(parseLabel(x.title), AXIS_TITLE_FONT, measure) : null
  const valueTitle = y.title ? measureLabel(parseLabel(y.title), AXIS_TITLE_FONT, measure) : null
  const legendItems = chart.series
    .map((series, index) => ({ series, index }))
    .filter((item) => item.series.title !== undefined)
    .map((item) => ({ ...item, measured: measureLabel(parseLabel(item.series.title!), LEGEND_FONT, measure) }))

  // Extents of each margin around the plot.
  let left: number
  let bottom: number
  let rightOverhang = 0
  if (horizontal) {
    const catW = Math.max(0, ...placedCats.map((p) => p.measured.width))
    left = (catTitle ? catTitle.height + GAP : 0) + catW + GAP
    const tickH = Math.max(0, ...valueLabels.map((l) => l.measured.height))
    bottom = GAP + tickH + (valueTitle ? GAP + valueTitle.height : 0)
    const last = valueLabels[valueLabels.length - 1]
    if (last) rightOverhang = Math.max(0, last.at + last.measured.width / 2 - valueLen)
  } else {
    const valueW = Math.max(0, ...valueLabels.map((l) => l.measured.width))
    left = (valueTitle ? valueTitle.height + GAP : 0) + valueW + GAP
    let catH: number
    if (rotate) {
      const reach = Math.max(...catLabels.map((m) => (m.width + m.height / 2) * SIN45))
      catH = reach + Math.max(...catLabels.map((m) => m.height)) * SIN45
      // The first label leans left past the plot's edge.
      const first = catLabels[0]!
      left = Math.max(left, (first.width + first.height / 2) * SIN45 - band / 2 + 4)
    } else {
      catH = Math.max(0, ...placedCats.map((p) => p.measured.height))
      const lastCat = placedCats[placedCats.length - 1]
      if (lastCat) rightOverhang = Math.max(0, lastCat.at + lastCat.measured.width / 2 - catLen)
      const firstCat = placedCats[0]
      if (firstCat) left = Math.max(left, firstCat.measured.width / 2 - firstCat.at)
    }
    bottom = GAP + catH + (catTitle ? GAP + catTitle.height : 0)
  }
  const plotW = horizontal ? valueLen : catLen
  const plotH = horizontal ? catLen : valueLen

  // Legend rows, wrapped to the chart's width.
  const legendRows: { items: typeof legendItems; width: number }[] = []
  const itemWidth = (item: (typeof legendItems)[number]) => SWATCH + 6 + item.measured.width
  const legendMax = Math.max(plotW, 200)
  for (const item of legendItems) {
    const row = legendRows[legendRows.length - 1]
    if (row && row.width + 20 + itemWidth(item) <= legendMax) {
      row.items.push(item)
      row.width += 20 + itemWidth(item)
    } else {
      legendRows.push({ items: [item], width: itemWidth(item) })
    }
  }
  const legendRowH = 20
  const legendH = legendRows.length > 0 ? legendRows.length * legendRowH + GAP : 0

  const titleH = titleLabel ? titleLabel.height + 12 : 0
  const plotLeft = left
  const plotTop = titleH + legendH + 6
  const plotRight = plotLeft + plotW
  const plotBottom = plotTop + plotH
  const width = plotRight + rightOverhang
  const height = plotBottom + bottom

  // Abstract (along categories, along values) to SVG coordinates.
  const at = (c: number, value: number) =>
    horizontal ? { x: plotLeft + value, y: plotTop + c } : { x: plotLeft + c, y: plotBottom - value }

  const back: SvgElement[] = []
  const data: SvgElement[] = []
  const front: SvgElement[] = []

  // Grid along the value ticks, and the zero line when the range crosses zero.
  back.push(
    el(
      'g',
      { class: 'dg-xy-grid' },
      valueLabels.map((l) => {
        const a = at(0, l.at)
        const b = at(catLen, l.at)
        return el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y })
      }),
    ),
  )
  const baseValue = Math.min(Math.max(0, vmin), vmax)
  const basePx = vPx(baseValue)
  {
    const a = at(0, basePx)
    const b = at(catLen, basePx)
    front.push(el('line', { class: 'dg-xy-axis', x1: a.x, y1: a.y, x2: b.x, y2: b.y }))
  }
  if (linearX) {
    front.push(
      el(
        'g',
        { class: 'dg-xy-tick' },
        placedCats.map((p) => {
          const a = at(p.at, basePx)
          return horizontal
            ? el('line', { x1: a.x - 4, y1: a.y, x2: a.x, y2: a.y })
            : el('line', { x1: a.x, y1: a.y, x2: a.x, y2: a.y + 4 })
        }),
      ),
    )
  }

  // Bars, grouped side by side within each category's band.
  const group = band * (bars.length > 1 ? 0.8 : 0.66)
  const barGap = bars.length > 1 ? Math.min(4, (group / bars.length) * 0.15) : 0
  const barThickness = (group - barGap * (bars.length - 1)) / Math.max(1, bars.length)
  bars.forEach((series, b) => {
    const index = chart.series.indexOf(series)
    data.push(
      el(
        'g',
        { class: `dg-xy-bars dg-xy-series-${index}` },
        series.values.map((value, i) => {
          const c0 = pointAt(i) - group / 2 + b * (barThickness + barGap)
          const v0 = Math.min(basePx, vPx(value))
          const v1 = Math.max(basePx, vPx(value))
          const p = horizontal ? at(c0, v0) : at(c0, v1)
          return el('rect', {
            class: 'dg-xy-bar',
            x: p.x,
            y: p.y,
            width: horizontal ? v1 - v0 : barThickness,
            height: horizontal ? barThickness : v1 - v0,
            style: `fill:${paletteVar(index)}`,
          })
        }),
      ),
    )
  })

  // Lines over the bars, with a dot on each point while the points are few enough to tell apart.
  for (const series of lines) {
    const index = chart.series.indexOf(series)
    const points = series.values.map((value, i) => at(pointAt(i), vPx(value)))
    const path = new PathBuilder()
    points.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)))
    const dots = points.length <= 60 && band >= 8
    data.push(
      el('g', { class: `dg-xy-line dg-xy-series-${index}` }, [
        el('path', { class: 'dg-xy-line-path', d: path.toString(), style: `stroke:${paletteVar(index)}` }),
        ...(dots ? points.map((p) => el('circle', { class: 'dg-xy-dot', cx: p.x, cy: p.y, r: 3.5, style: `fill:${paletteVar(index)}` })) : []),
      ]),
    )
  }

  // Tick labels.
  if (horizontal) {
    for (const p of placedCats) {
      front.push(renderLabel(p.measured, plotLeft - GAP, plotTop + p.at, { anchor: 'end', className: 'dg-xy-tick-label' }))
    }
    for (const l of valueLabels) {
      front.push(renderLabel(l.measured, plotLeft + l.at, plotBottom + GAP + l.measured.height / 2, { className: 'dg-xy-tick-label' }))
    }
  } else {
    for (const l of valueLabels) {
      front.push(renderLabel(l.measured, plotLeft - GAP, plotBottom - l.at, { anchor: 'end', className: 'dg-xy-tick-label' }))
    }
    for (const p of placedCats) {
      const cx = plotLeft + p.at
      if (rotate) {
        const cy = plotBottom + GAP + (p.measured.height / 2) * SIN45
        front.push(
          el('g', { transform: `rotate(-45 ${round(cx)} ${round(cy)})` }, [
            renderLabel(p.measured, cx, cy, { anchor: 'end', className: 'dg-xy-tick-label' }),
          ]),
        )
      } else {
        front.push(renderLabel(p.measured, cx, plotBottom + GAP + p.measured.height / 2, { className: 'dg-xy-tick-label' }))
      }
    }
  }

  // Axis titles: the left one reads bottom to top.
  const leftTitle = horizontal ? catTitle : valueTitle
  const bottomTitle = horizontal ? valueTitle : catTitle
  if (leftTitle) {
    const cx = leftTitle.height / 2
    const cy = plotTop + plotH / 2
    front.push(
      el('g', { transform: `rotate(-90 ${round(cx)} ${round(cy)})` }, [renderLabel(leftTitle, cx, cy, { className: 'dg-xy-axis-title' })]),
    )
  }
  if (bottomTitle) {
    front.push(renderLabel(bottomTitle, plotLeft + plotW / 2, height - bottomTitle.height / 2, { className: 'dg-xy-axis-title' }))
  }

  // Title and legend, centred on the plot.
  const centre = plotLeft + plotW / 2
  if (titleLabel) front.push(renderLabel(titleLabel, centre, titleLabel.height / 2, { className: 'dg-title' }))
  legendRows.forEach((row, r) => {
    let cursor = centre - row.width / 2
    const cy = titleH + r * legendRowH + legendRowH / 2
    for (const item of row.items) {
      const colour = paletteVar(item.index)
      front.push(
        el('g', { class: 'dg-xy-legend-item' }, [
          item.series.kind === 'bar'
            ? el('rect', { x: cursor, y: cy - SWATCH / 2, width: SWATCH, height: SWATCH, rx: 2, style: `fill:${colour}` })
            : el('line', { class: 'dg-xy-legend-line', x1: cursor, y1: cy, x2: cursor + SWATCH, y2: cy, style: `stroke:${colour}` }),
          renderLabel(item.measured, cursor + SWATCH + 6, cy, { anchor: 'start', className: 'dg-xy-legend' }),
        ]),
      )
      cursor += itemWidth(item) + 20
    }
  })

  // Values outside a written range are cut at the plot's edge, not drawn over the axes.
  const clipId = `${id}-plot`
  const defs = [
    // A little wider than the plot, so the dots on its edges are drawn whole.
    el('clipPath', { id: clipId }, [el('rect', { x: plotLeft - 4, y: plotTop - 4, width: plotW + 8, height: plotH + 8 })]),
  ]
  const body: SvgElement[] = [...back, el('g', { 'clip-path': `url(#${clipId})` }, data), ...front]

  const r = `#${id}`
  const css = [
    `${r} .dg-title{fill:${v('--dg-text')};font-size:18px;font-weight:bold}`,
    `${r} .dg-xy-grid line{stroke:${v('--dg-grid')};stroke-width:1px}`,
    `${r} .dg-xy-axis,${r} .dg-xy-tick line{stroke:${v('--dg-line')};stroke-width:1px}`,
    `${r} .dg-xy-tick-label{fill:${v('--dg-text-muted')};font-size:12px}`,
    `${r} .dg-xy-axis-title{fill:${v('--dg-text')};font-size:13px;font-weight:bold}`,
    `${r} .dg-xy-line-path{fill:none;stroke-width:2.5px;stroke-linejoin:round;stroke-linecap:round}`,
    `${r} .dg-xy-legend-line{stroke-width:2.5px;stroke-linecap:round}`,
    `${r} .dg-xy-legend{fill:${v('--dg-text')};font-size:13px}`,
  ].join('')

  return documentSvg({
    id,
    type: 'xychart',
    width,
    height,
    title: title ?? chart.accessibility.title ?? chart.title ?? 'XY chart',
    description: chart.accessibility.description,
    defs,
    body,
    css,
  })
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
