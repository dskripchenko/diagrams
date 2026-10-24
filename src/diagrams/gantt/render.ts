/**
 * Gantt charts: one row per task on a horizontal time axis, sections as
 * shaded bands with their names in a column on the left.
 */
import { DiagramError } from '../../core/errors'
import { documentSvg, type RenderResult } from '../../core/document'
import { cssText, parseStyle } from '../../core/style'
import { el, num, type SvgElement } from '../../core/svg'
import {
  measureLabel,
  parseLabel,
  plainLabel,
  renderLabel,
  wrapLabel,
  type FontSpec,
  type Label,
  type TextMeasurer,
} from '../../core/text'
import { BASE_FONT, v } from '../../core/theme'
import { AUTO_INTERVALS, DAY, formatDate, intervalLength, ticks, type TickInterval } from './dates'
import type { GanttDiagram, GanttTask } from './parser'

const ROW = 28
const BAR = 20
const AXIS = 24
const SECTION_MAX = 160
const TARGET_WIDTH = 800
const TASK_FONT: FontSpec = { ...BASE_FONT, size: 13 }
const AXIS_FONT: FontSpec = { ...BASE_FONT, size: 12 }
const SECTION_FONT: FontSpec = { ...BASE_FONT, weight: 'bold' }
const TITLE_FONT: FontSpec = { ...BASE_FONT, size: 18, weight: 'bold' }
const TICK_LIMIT = 1000
/*
 * Room left for the measurer being wrong. Outside a browser widths come from
 * a glyph table, and the system font a reader ends up with can be a tenth
 * wider; a label that only just fits in the estimate would spill out of its bar.
 */
const FIT = 1.12

/**
 * The axis format when the chart does not name one. Mermaid always uses
 * `%Y-%m-%d`, which on a chart of hours prints the same date under every
 * tick; the format follows the tick interval instead.
 */
function autoFormat(interval: TickInterval): string {
  switch (interval.unit) {
    case 'ms':
      return '%H:%M:%S.%L'
    case 's':
      return '%H:%M:%S'
    case 'm':
    case 'h':
      return '%H:%M'
    case 'M':
      return interval.step >= 12 ? '%Y' : '%b %Y'
    default:
      return '%Y-%m-%d'
  }
}

/** A label on one line: `<br>` in a task name becomes a space, since a bar holds one line. */
function oneLine(text: string): Label {
  const label = parseLabel(text)
  return { lines: [label.lines.flatMap((line, i) => (i === 0 ? line : [{ text: ' ' }, ...line]))] }
}

function taskClasses(task: GanttTask): string {
  const out = ['dg-task']
  if (task.tags.milestone) out.push('dg-milestone')
  if (task.tags.done) out.push('dg-task-done')
  if (task.tags.active) out.push('dg-task-active')
  if (task.tags.crit) out.push('dg-task-crit')
  return out.join(' ')
}

/**
 * Renders a resolved gantt chart.
 *
 * @param now The moment the "today" line marks. It is a parameter rather than
 *   the clock so that the same text always renders to the same SVG; without
 *   it no today line is drawn, whatever `todayMarker` says.
 */
export function renderGantt(
  diagram: GanttDiagram,
  measure: TextMeasurer,
  id: string,
  title?: string,
  now?: Date,
): RenderResult {
  const tasks = diagram.tasks
  if (tasks.length === 0) {
    throw new DiagramError('The gantt chart has no tasks', 0, 0, 'Add lines like: Task : 2024-01-01, 3d')
  }
  let min = Math.min(...tasks.map((t) => t.start))
  let max = Math.max(...tasks.map((t) => t.end))
  if (max <= min) {
    // A chart of milestones on one instant still needs a span to draw on.
    min -= DAY / 2
    max += DAY / 2
  }

  // Section column.
  const named = diagram.sections.filter((s) => s !== '')
  const sectionLabels = new Map(
    named.map((name) => [name, measureLabel(wrapLabel(parseLabel(name), SECTION_MAX, SECTION_FONT, measure), SECTION_FONT, measure)]),
  )
  const sectionWidth = named.length > 0 ? Math.min(SECTION_MAX, Math.max(...[...sectionLabels.values()].map((m) => m.width))) + 24 : 0
  const plotLeft = sectionWidth
  const plotWidth = Math.min(TARGET_WIDTH, Math.max(480, TARGET_WIDTH - sectionWidth))
  const plotRight = plotLeft + plotWidth
  const xOf = (time: number) => plotLeft + ((time - min) / (max - min)) * plotWidth

  // Axis ticks: the given interval, or the finest whose labels do not collide.
  let tickTimes: number[] = []
  let axisFormat = diagram.axisFormat
  const formatFor = (interval: TickInterval) => (diagram.axisFormatSet ? diagram.axisFormat : autoFormat(interval))
  const labelWidth = (times: number[], format: string) =>
    Math.max(0, ...times.map((t) => measure(formatDate(t, format), AXIS_FONT).width))
  if (diagram.tickInterval) {
    tickTimes = ticks(min, max, diagram.tickInterval, TICK_LIMIT + 1)
    if (tickTimes.length > TICK_LIMIT) {
      throw new DiagramError('tickInterval puts more than 1000 ticks on the axis', 0, 0, 'Choose a longer interval.')
    }
    axisFormat = formatFor(diagram.tickInterval)
  } else {
    for (const interval of AUTO_INTERVALS) {
      if ((max - min) / intervalLength(interval) > 80) continue
      const candidate = ticks(min, max, interval)
      tickTimes = candidate
      axisFormat = formatFor(interval)
      if (candidate.length * (labelWidth(candidate, axisFormat) + 16) <= plotWidth) break
    }
  }

  // Vertical layout.
  const titleMeasured = diagram.title ? measureLabel(plainLabel(diagram.title), TITLE_FONT, measure) : null
  const titleHeight = titleMeasured ? titleMeasured.height + 14 : 0
  const rowsTop = titleHeight + (diagram.topAxis ? AXIS : 0) + 4
  const rowsBottom = rowsTop + tasks.length * ROW
  const height = rowsBottom + AXIS

  const back: SvgElement[] = []
  const front: SvgElement[] = []
  let left = 0
  let right = plotRight

  // Section bands, one per run of consecutive rows in the same section.
  let runStart = 0
  tasks.forEach((task, index) => {
    const next = tasks[index + 1]
    if (next && next.section === task.section) return
    const sectionIndex = diagram.sections.indexOf(task.section)
    const y = rowsTop + runStart * ROW
    const h = (index - runStart + 1) * ROW
    back.push(
      el('rect', {
        class: `dg-gantt-section dg-gantt-section-${sectionIndex % 2}`,
        x: 0,
        y,
        width: plotRight,
        height: h,
      }),
    )
    const measured = sectionLabels.get(task.section)
    if (measured) {
      front.push(renderLabel(measured, 12, y + h / 2, { anchor: 'start', className: 'dg-gantt-section-label' }))
    }
    runStart = index + 1
  })

  // Excluded days.
  for (const range of diagram.excludedRanges) {
    const x0 = Math.max(plotLeft, xOf(range.start))
    const x1 = Math.min(plotRight, xOf(range.end))
    if (x1 > x0) {
      back.push(el('rect', { class: 'dg-gantt-exclude', x: x0, y: rowsTop, width: x1 - x0, height: rowsBottom - rowsTop }))
    }
  }

  // Grid and axis labels.
  const axisLabels = (y: number) =>
    tickTimes.map((t) => {
      const measured = measureLabel(plainLabel(formatDate(t, axisFormat)), AXIS_FONT, measure)
      const x = xOf(t)
      left = Math.min(left, x - measured.width / 2)
      right = Math.max(right, x + measured.width / 2)
      return renderLabel(measured, x, y, { className: 'dg-gantt-axis' })
    })
  back.push(
    el(
      'g',
      { class: 'dg-gantt-grid' },
      tickTimes.map((t) => el('line', { x1: xOf(t), y1: rowsTop, x2: xOf(t), y2: rowsBottom })),
    ),
  )
  front.push(el('g', {}, axisLabels(rowsBottom + AXIS / 2)))
  if (diagram.topAxis) front.push(el('g', {}, axisLabels(rowsTop - AXIS / 2)))

  // Tasks.
  tasks.forEach((task, index) => {
    const cy = rowsTop + index * ROW + ROW / 2
    const label = measureLabel(oneLine(task.name), TASK_FONT, measure)
    const parts: SvgElement[] = []
    const classes = taskClasses(task)
    let textX: number
    let anchor: 'start' | 'middle' | 'end'
    let inside = false
    if (task.tags.milestone) {
      const cx = (xOf(task.start) + xOf(task.renderEnd)) / 2
      const r = BAR / 2
      parts.push(
        el('polygon', {
          class: classes,
          points: `${num(cx)},${num(cy - r)} ${num(cx + r)},${num(cy)} ${num(cx)},${num(cy + r)} ${num(cx - r)},${num(cy)}`,
        }),
      )
      textX = cx + r + 6
      anchor = 'start'
    } else {
      const x0 = xOf(task.start)
      const width = Math.max(2, xOf(task.renderEnd) - x0)
      const x1 = x0 + width
      parts.push(el('rect', { class: classes, x: x0, y: cy - BAR / 2, width, height: BAR, rx: 3, ry: 3 }))
      if (label.width * FIT + 12 <= width) {
        inside = true
        textX = x0 + width / 2
        anchor = 'middle'
      } else if (x1 + 6 + label.width * FIT <= plotRight || x0 - 6 - label.width * FIT < plotLeft) {
        textX = x1 + 6
        anchor = 'start'
      } else {
        textX = x0 - 6
        anchor = 'end'
      }
    }
    if (!inside) {
      if (anchor === 'start') right = Math.max(right, textX + label.width * FIT)
      if (anchor === 'end') left = Math.min(left, textX - label.width * FIT)
    }
    const textClass = inside
      ? `dg-task-text dg-task-text-inside${task.tags.done || task.tags.active ? ' dg-task-text-dark' : ''}`
      : 'dg-task-text'
    parts.push(renderLabel(label, textX, cy, { anchor, className: textClass }))
    const group = el('g', { class: 'dg-gantt-task', 'data-id': task.id }, parts)
    front.push(task.href ? el('a', { href: task.href }, [group]) : group)
  })

  // Today.
  if (now && diagram.todayMarker !== 'off') {
    const t = now.getTime()
    if (t >= min && t <= max) {
      const style = diagram.todayMarker === 'on' ? undefined : cssText(parseStyle(diagram.todayMarker).shape)
      front.push(
        el('line', { class: 'dg-gantt-today', x1: xOf(t), y1: rowsTop - 4, x2: xOf(t), y2: rowsBottom + 4, style }),
      )
    }
  }

  // Everything was laid out from x = 0; labels may reach past either side.
  const shift = Math.ceil(-left)
  const width = right - left
  const body: SvgElement[] = []
  if (titleMeasured) {
    body.push(renderLabel(titleMeasured, width / 2, titleMeasured.height / 2, { className: 'dg-title' }))
  }
  body.push(el('g', { transform: shift > 0 ? `translate(${shift},0)` : undefined }, [...back, ...front]))

  const r = `#${id}`
  const css = [
    `${r} .dg-title{fill:${v('--dg-text')};font-size:18px;font-weight:bold}`,
    `${r} .dg-gantt-section-0{fill:${v('--dg-section-fill-0')}}`,
    `${r} .dg-gantt-section-1{fill:${v('--dg-section-fill-1')}}`,
    `${r} .dg-gantt-section-label{fill:${v('--dg-text')};font-weight:bold}`,
    `${r} .dg-gantt-exclude{fill:${v('--dg-exclude-fill')}}`,
    `${r} .dg-gantt-grid line{stroke:${v('--dg-grid')};stroke-width:1px}`,
    `${r} .dg-gantt-axis{fill:${v('--dg-text-muted')};font-size:12px}`,
    `${r} .dg-task{fill:${v('--dg-task-fill')};stroke:${v('--dg-task-stroke')};stroke-width:1px}`,
    `${r} .dg-task-active{fill:${v('--dg-task-active-fill')}}`,
    `${r} .dg-task-done{fill:${v('--dg-task-done-fill')};stroke:${v('--dg-task-done-stroke')}}`,
    `${r} .dg-task-crit{fill:${v('--dg-task-crit-fill')};stroke:${v('--dg-task-crit-stroke')}}`,
    `${r} .dg-task-crit.dg-task-done{fill:${v('--dg-task-done-fill')};stroke:${v('--dg-task-crit-stroke')};stroke-width:2px}`,
    `${r} .dg-task-crit.dg-task-active{fill:${v('--dg-task-active-fill')};stroke:${v('--dg-task-crit-stroke')};stroke-width:2px}`,
    `${r} .dg-task-text{fill:${v('--dg-text')};font-size:13px}`,
    `${r} .dg-task-text-inside{fill:${v('--dg-task-text')}}`,
    `${r} .dg-task-text-dark{fill:${v('--dg-task-text-dark')}}`,
    `${r} .dg-gantt-today{stroke:${v('--dg-today')};stroke-width:2px}`,
  ].join('')

  return documentSvg({
    id,
    type: 'gantt',
    width,
    height,
    title: title ?? diagram.accessibility.title ?? diagram.title ?? 'Gantt chart',
    description: diagram.accessibility.description,
    body,
    css,
  })
}
