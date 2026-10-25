/**
 * XY charts: bars and lines over a categorical or numeric x axis.
 *
 *     xychart-beta horizontal
 *         title "Sales revenue"
 *         x-axis [jan, feb, mar]
 *         y-axis "Revenue (in $)" 4000 --> 11000
 *         bar [5000, 6000, 7500]
 *         line [5000, 6000, 7500]
 *
 * Mermaid quietly drops values past the last category and draws a missing
 * one as nothing; here a series that does not match its axis is an error,
 * so a chart never shows fewer points than were written.
 */
import { DiagramError } from '../../core/errors'
import { statements, type Statement } from '../../core/scanner'
import { accessibilityStatement, type Accessibility } from '../common'

export interface XyBandAxis {
  kind: 'band'
  title?: string
  categories: string[]
}

export interface XyLinearAxis {
  kind: 'linear'
  title?: string
  /** Both bounds, or neither (then the range comes from the data). */
  min?: number
  max?: number
}

export interface XySeries {
  kind: 'bar' | 'line'
  title?: string
  values: number[]
  line: number
  column: number
}

export interface XyChart {
  type: 'xychart'
  horizontal: boolean
  title?: string
  /** Absent: the categories are the point numbers, 1 to n. */
  xAxis?: XyBandAxis | XyLinearAxis
  yAxis: XyLinearAxis
  series: XySeries[]
  accessibility: Accessibility
}

const NUMBER = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/
const RANGE = new RegExp(`^(${NUMBER.source})\\s*-->\\s*(${NUMBER.source})$`)
const MAX_POINTS = 1000

/** Reads a title at the start of `text`: `"quoted"`, a markdown string, or bare words. */
function readTitle(text: string, s: Statement, offset: number): { title?: string; rest: string; restOffset: number } {
  const lead = text.length - text.trimStart().length
  const t = text.trimStart()
  if (t.startsWith('"')) {
    const close = t.indexOf('"', 1)
    if (close < 0) {
      throw new DiagramError('The quoted text is not closed', s.line, s.column + offset + lead, 'Add the closing "')
    }
    let title = t.slice(1, close)
    if (title.startsWith('`') && title.endsWith('`') && title.length >= 2) title = title.slice(1, -1)
    const after = t.slice(close + 1)
    return { title, rest: after, restOffset: offset + lead + close + 1 }
  }
  return { rest: text, restOffset: offset }
}

/** Splits `a, "b, c", d` on commas outside quotes, keeping each item's offset. */
function splitList(body: string): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = []
  let quote = false
  let start = 0
  for (let i = 0; i <= body.length; i++) {
    const ch = body[i]
    if (ch === '"') quote = !quote
    if (i === body.length || (ch === ',' && !quote)) {
      const raw = body.slice(start, i)
      out.push({ text: raw.trim(), offset: start + (raw.length - raw.trimStart().length) })
      start = i + 1
    }
  }
  return out
}

/** The `[ … ]` at the end of `text`, or null when there is none. */
function bracketList(text: string, s: Statement, offset: number): { before: string; items: { text: string; offset: number }[] } | null {
  const open = text.indexOf('[')
  if (open < 0) return null
  const trimmed = text.trimEnd()
  if (!trimmed.endsWith(']')) {
    throw new DiagramError('The list is not closed', s.line, s.column + offset + open, 'End it with "]"')
  }
  const body = trimmed.slice(open + 1, -1)
  const items = body.trim() === '' ? [] : splitList(body).map((item) => ({ ...item, offset: offset + open + 1 + item.offset }))
  return { before: text.slice(0, open), items }
}

function parseNumber(text: string): number | null {
  const m = new RegExp(`^${NUMBER.source}$`).exec(text)
  if (!m) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function bareTitle(text: string): string | undefined {
  const t = text.trim()
  return t === '' ? undefined : t
}

function parseAxis(s: Statement, keyword: 'x-axis' | 'y-axis'): XyBandAxis | XyLinearAxis {
  const offset = keyword.length
  const { title: quoted, rest, restOffset } = readTitle(s.text.slice(offset), s, offset)
  const list = bracketList(rest, s, restOffset)
  if (list) {
    if (keyword === 'y-axis') {
      throw new DiagramError('The y axis is numeric and has no categories', s.line, s.column, 'Write y-axis "Title" 0 --> 100')
    }
    const title = quoted ?? bareTitle(list.before)
    if (quoted !== undefined && list.before.trim() !== '') {
      throw new DiagramError(`Unexpected "${list.before.trim()}"`, s.line, s.column + restOffset)
    }
    const categories = list.items.map((item) => {
      if (item.text === '') {
        throw new DiagramError('A category is empty', s.line, s.column + item.offset, 'Remove the extra comma')
      }
      return item.text.length >= 2 && item.text.startsWith('"') && item.text.endsWith('"') ? item.text.slice(1, -1) : item.text
    })
    if (categories.length === 0) {
      throw new DiagramError('The x axis has no categories', s.line, s.column, 'List them: x-axis [a, b, c]')
    }
    return { kind: 'band', title, categories }
  }
  const trimmed = rest.trim()
  const range = /(\S+)\s*-->\s*(\S+)\s*$/.exec(trimmed)
  if (range) {
    const at = s.column + restOffset + (rest.length - rest.trimStart().length) + range.index
    const exact = RANGE.exec(range[0].trim())
    if (!exact) {
      throw new DiagramError(`"${range[0].trim()}" is not a range of numbers`, s.line, at, 'Write min --> max, e.g. 0 --> 100')
    }
    const min = Number(exact[1])
    const max = Number(exact[2])
    if (!(max > min)) {
      throw new DiagramError('The end of the range must be greater than its start', s.line, at)
    }
    const before = trimmed.slice(0, range.index)
    if (quoted !== undefined && before.trim() !== '') {
      throw new DiagramError(`Unexpected "${before.trim()}"`, s.line, s.column + restOffset)
    }
    return { kind: 'linear', title: quoted ?? bareTitle(before), min, max }
  }
  if (quoted !== undefined && trimmed !== '') {
    throw new DiagramError(`Unexpected "${trimmed}"`, s.line, s.column + restOffset + (rest.length - rest.trimStart().length))
  }
  return { kind: 'linear', title: quoted ?? bareTitle(trimmed) }
}

function parseSeries(s: Statement, kind: 'bar' | 'line'): XySeries {
  const offset = kind.length
  const { title: quoted, rest, restOffset } = readTitle(s.text.slice(offset), s, offset)
  const list = bracketList(rest, s, restOffset)
  if (!list) {
    throw new DiagramError(`A ${kind} series needs its values in brackets`, s.line, s.column, `Write ${kind} [1, 2, 3]`)
  }
  if (quoted !== undefined && list.before.trim() !== '') {
    throw new DiagramError(`Unexpected "${list.before.trim()}"`, s.line, s.column + restOffset)
  }
  const values = list.items.map((item) => {
    const value = parseNumber(item.text)
    if (value === null) {
      throw new DiagramError(`"${item.text}" is not a number`, s.line, s.column + item.offset, 'Values are plain numbers: 12, -3.5, .25')
    }
    return value
  })
  if (values.length === 0) {
    throw new DiagramError(`The ${kind} series has no values`, s.line, s.column, `Write ${kind} [1, 2, 3]`)
  }
  if (values.length > MAX_POINTS) {
    throw new DiagramError(`The series has ${values.length} values; the limit is ${MAX_POINTS}`, s.line, s.column)
  }
  return { kind, title: quoted ?? bareTitle(list.before), values, line: s.line, column: s.column }
}

export function parseXyChart(source: string): XyChart {
  const list = statements(source)
  const head = list[0]
  const m = head ? /^(xychart-beta|xychart)\b\s*(.*)$/.exec(head.text) : null
  if (!head || !m) {
    throw new DiagramError('An XY chart starts with "xychart-beta"', head?.line ?? 1, 1)
  }
  const chart: XyChart = { type: 'xychart', horizontal: false, yAxis: { kind: 'linear' }, series: [], accessibility: {} }
  const option = m[2]!.trim()
  if (option === 'horizontal') chart.horizontal = true
  else if (option !== '' && option !== 'vertical') {
    throw new DiagramError(`Unexpected "${option}" after "${m[1]}"`, head.line, head.column + m[1]!.length + 1, 'Write "horizontal", or nothing')
  }

  let xSeen: Statement | null = null
  let ySeen: Statement | null = null
  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const consumed = accessibilityStatement(list, i, chart.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    const keyword = /^(title|x-axis|y-axis|bar|line)\b/.exec(s.text)?.[1]
    switch (keyword) {
      case 'title': {
        const { title, rest } = readTitle(s.text.slice(5), s, 5)
        const text = title ?? rest.trim()
        if (title !== undefined && rest.trim() !== '') {
          throw new DiagramError(`Unexpected "${rest.trim()}"`, s.line, s.column + s.text.indexOf(rest.trim(), 6))
        }
        chart.title = text === '' ? undefined : text
        break
      }
      case 'x-axis':
      case 'y-axis': {
        const seen = keyword === 'x-axis' ? xSeen : ySeen
        if (seen) {
          throw new DiagramError(`The ${keyword} is already declared on line ${seen.line}`, s.line, s.column, 'Declare each axis once')
        }
        const axis = parseAxis(s, keyword)
        if (keyword === 'x-axis') {
          chart.xAxis = axis
          xSeen = s
        } else {
          chart.yAxis = axis as XyLinearAxis
          ySeen = s
        }
        break
      }
      case 'bar':
      case 'line':
        chart.series.push(parseSeries(s, keyword))
        break
      default:
        throw new DiagramError(
          `"${s.text}" is not an XY chart statement`,
          s.line,
          s.column,
          'Expected title, x-axis, y-axis, bar or line',
        )
    }
  }

  if (chart.series.length === 0) {
    throw new DiagramError('The chart has no data', 0, 0, 'Add a series: bar [1, 2, 3] or line [1, 2, 3]')
  }
  const x = chart.xAxis
  const expected = x?.kind === 'band' ? x.categories.length : chart.series[0]!.values.length
  for (const series of chart.series) {
    if (series.values.length !== expected) {
      const what = x?.kind === 'band' ? `the x axis has ${expected} categories` : `the first series has ${expected}`
      throw new DiagramError(
        `The ${series.kind} series has ${series.values.length} values, but ${what}`,
        series.line,
        series.column,
        'Give every series one value per point',
      )
    }
  }
  return chart
}
