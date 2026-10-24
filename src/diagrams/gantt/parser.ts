/**
 * Gantt charts: reading the text and working out when every task runs.
 *
 *     gantt
 *         title A plan
 *         dateFormat YYYY-MM-DD
 *         excludes weekends
 *         section Design
 *         Research      :done, r1, 2024-01-01, 5d
 *         Prototype     :active, p1, after r1, 1w
 *         section Release
 *         Ship it       :milestone, after p1, 0d
 *
 * Settings apply to the whole chart wherever they appear, as in Mermaid —
 * tasks are resolved after the last line is read, so `dateFormat` at the
 * bottom still governs dates at the top, and `after` may name a task that
 * comes later.
 */
import { DiagramError } from '../../core/errors'
import { statements, unquote, type Statement } from '../../core/scanner'
import { safeHref } from '../../core/style'
import { decodeEntities } from '../../core/text'
import { accessibilityStatement, type Accessibility } from '../common'
import {
  addDuration,
  compileFormat,
  DateFormatError,
  DAY,
  dayKey,
  parseDate,
  parseDuration,
  parseTickInterval,
  startOfDay,
  unsupportedDirective,
  weekday,
  WEEKDAY_INDEX,
  type DateFormat,
  type TickInterval,
} from './dates'

export interface GanttTags {
  done: boolean
  active: boolean
  crit: boolean
  milestone: boolean
}

export interface GanttTask {
  id: string
  name: string
  /** Section name; '' for tasks before the first `section`. */
  section: string
  tags: GanttTags
  /** Milliseconds since the epoch, UTC. */
  start: number
  end: number
  /**
   * Where the bar is drawn to. Differs from `end` only when excluded days
   * stretched the task: the bar stops at the last working day rather than
   * running across the weekend that follows it.
   */
  renderEnd: number
  href?: string
  line: number
}

export interface GanttDiagram {
  type: 'gantt'
  title?: string
  dateFormat: string
  axisFormat: string
  /** True when `axisFormat` was written; otherwise the renderer may pick a shorter one. */
  axisFormatSet: boolean
  tickInterval?: TickInterval
  excludes: string[]
  includes: string[]
  /** 'on' (default), 'off', or a style for the marker line. */
  todayMarker: string
  topAxis: boolean
  inclusiveEndDates: boolean
  sections: string[]
  tasks: GanttTask[]
  /** Excluded days within the chart's span, merged into ranges, for shading. */
  excludedRanges: { start: number; end: number }[]
  accessibility: Accessibility
}

interface RawTask {
  id: string
  name: string
  section: string
  tags: GanttTags
  startSpec: string | null
  endSpec: string
  statement: Statement
  href?: string
  // Filled during resolution.
  start?: number
  end?: number
  renderEnd?: number
  manualEnd?: boolean
  resolving?: boolean
}

const TAGS = ['done', 'active', 'crit', 'milestone'] as const

const KEYWORDS = new Set([
  'title',
  'dateFormat',
  'axisFormat',
  'tickInterval',
  'excludes',
  'includes',
  'weekend',
  'todayMarker',
  'topAxis',
  'inclusiveEndDates',
  'section',
  'click',
  'displayMode',
])

export function parseGantt(source: string): GanttDiagram {
  const list = statements(source)
  const head = list[0]
  if (!head || !/^gantt$/.test(head.text)) {
    throw new DiagramError('A gantt chart starts with "gantt"', head?.line ?? 1, head?.column ?? 1)
  }
  const diagram: GanttDiagram = {
    type: 'gantt',
    dateFormat: 'YYYY-MM-DD',
    axisFormat: '%Y-%m-%d',
    axisFormatSet: false,
    excludes: [],
    includes: [],
    todayMarker: 'on',
    topAxis: false,
    inclusiveEndDates: false,
    sections: [],
    tasks: [],
    excludedRanges: [],
    accessibility: {},
  }
  let weekend: [number, number] = [6, 0]
  let dateFormatStatement: Statement = head
  const raw: RawTask[] = []
  const clicks: { id: string; href: string; statement: Statement }[] = []
  let section = ''
  let auto = 0
  const excludeLines = new Map<string, Statement>()

  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const consumed = accessibilityStatement(list, i, diagram.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    const keyword = /^([A-Za-z]+)(?:\s+(.*))?$/.exec(s.text)
    const word = keyword?.[1] ?? ''
    const arg = (keyword?.[2] ?? '').trim()
    if (KEYWORDS.has(word) || !s.text.includes(':')) {
      switch (word) {
        case 'title':
          diagram.title = decodeEntities(arg)
          continue
        case 'dateFormat':
          diagram.dateFormat = arg
          dateFormatStatement = s
          continue
        case 'axisFormat':
          if (unsupportedDirective(arg)) {
            throw new DiagramError(
              `The axis format directive "${unsupportedDirective(arg)}" is not supported`,
              s.line,
              s.column,
              'Supported: %Y %y %m %d %e %H %I %M %S %L %p %j %a %A %b %B %w %u %%.',
            )
          }
          diagram.axisFormat = arg
          diagram.axisFormatSet = true
          continue
        case 'tickInterval': {
          const interval = parseTickInterval(arg)
          if (!interval) {
            throw new DiagramError(`"${arg}" is not a tick interval`, s.line, s.column, 'Write e.g. 1day, 2week, 1month.')
          }
          diagram.tickInterval = interval
          continue
        }
        case 'excludes':
          for (const item of splitList(arg)) {
            diagram.excludes.push(item)
            excludeLines.set(item, s)
          }
          continue
        case 'includes':
          diagram.includes.push(...splitList(arg))
          continue
        case 'weekend':
          if (arg === 'friday') weekend = [5, 6]
          else if (arg === 'saturday') weekend = [6, 0]
          else throw new DiagramError(`"${arg}" cannot start a weekend`, s.line, s.column, 'Write friday or saturday.')
          continue
        case 'todayMarker':
          diagram.todayMarker = arg === '' ? 'on' : arg
          continue
        case 'topAxis':
          diagram.topAxis = true
          continue
        case 'inclusiveEndDates':
          diagram.inclusiveEndDates = true
          continue
        case 'section':
          section = decodeEntities(arg)
          continue
        case 'click': {
          const m = /^(\S+)\s+href\s+("[^"]*"|\S+)\s*$/.exec(arg)
          if (!m) {
            throw new DiagramError(
              'Only "click <id> href <url>" is supported',
              s.line,
              s.column,
              'Callbacks are not run: a diagram cannot execute code.',
            )
          }
          const href = safeHref(unquote(m[2]!))
          if (href === null) {
            throw new DiagramError(`The link "${unquote(m[2]!)}" is not allowed`, s.line, s.column, 'Use http(s), mailto or a relative link.')
          }
          for (const id of m[1]!.split(',')) clicks.push({ id: id.trim(), href, statement: s })
          continue
        }
        case 'displayMode':
          throw new DiagramError('displayMode is not supported', s.line, s.column, 'Remove the line; every task gets its own row.')
        default:
          throw new DiagramError(`"${s.text}" is not a task`, s.line, s.column, 'Write: Task name : 2024-01-01, 3d')
      }
    }

    // A task: `name : [tags,] [id,] [start,] end`.
    const colon = s.text.indexOf(':')
    const name = decodeEntities(s.text.slice(0, colon).trim())
    if (name === '') {
      throw new DiagramError('The task has no name', s.line, s.column)
    }
    const items = s.text
      .slice(colon + 1)
      .split(',')
      .map((item) => item.trim())
    const tags: GanttTags = { done: false, active: false, crit: false, milestone: false }
    while (items.length > 0 && (TAGS as readonly string[]).includes(items[0]!)) {
      tags[items.shift() as (typeof TAGS)[number]] = true
    }
    if (items.some((item) => item === '')) {
      throw new DiagramError('The task has an empty item', s.line, s.column + colon + 1)
    }
    let id = `task${++auto}`
    let startSpec: string | null = null
    let endSpec: string
    if (items.length === 1) {
      endSpec = items[0]!
    } else if (items.length === 2) {
      startSpec = items[0]!
      endSpec = items[1]!
    } else if (items.length === 3) {
      id = items[0]!
      startSpec = items[1]!
      endSpec = items[2]!
    } else {
      throw new DiagramError(
        items.length === 0 ? 'The task has no dates' : 'The task has too many items',
        s.line,
        s.column + colon + 1,
        'Write: [tags,] [id,] [start,] end or duration',
      )
    }
    if (/\s/.test(id)) {
      throw new DiagramError(`"${id}" cannot be a task id: it contains a space`, s.line, s.column + colon + 1)
    }
    if (raw.some((task) => task.id === id)) {
      throw new DiagramError(`The task id "${id}" is used twice`, s.line, s.column + colon + 1)
    }
    if (startSpec === null && raw.length === 0) {
      throw new DiagramError('The first task needs a start date', s.line, s.column + colon + 1, 'Write: Task : 2024-01-01, 3d')
    }
    raw.push({ id, name, section, tags, startSpec, endSpec, statement: s })
  }

  let format: DateFormat
  try {
    format = compileFormat(diagram.dateFormat)
  } catch (error) {
    if (error instanceof DateFormatError) {
      throw new DiagramError(error.message, dateFormatStatement.line, dateFormatStatement.column)
    }
    throw error
  }

  const excluded = exclusionTest(diagram, format, weekend, excludeLines)
  const byId = new Map(raw.map((task) => [task.id, task]))
  raw.forEach((task, index) => resolve(task, index, raw, byId, format, diagram, excluded))

  for (const click of clicks) {
    const task = byId.get(click.id)
    if (!task) {
      throw new DiagramError(`No task has the id "${click.id}"`, click.statement.line, click.statement.column)
    }
    task.href = click.href
  }

  for (const task of raw) {
    if (!diagram.sections.includes(task.section)) diagram.sections.push(task.section)
    diagram.tasks.push({
      id: task.id,
      name: task.name,
      section: task.section,
      tags: task.tags,
      start: task.start!,
      end: task.end!,
      renderEnd: task.renderEnd!,
      href: task.href,
      line: task.statement.line,
    })
  }
  if (excluded && diagram.tasks.length > 0) {
    const from = startOfDay(Math.min(...diagram.tasks.map((t) => t.start)))
    const to = Math.max(...diagram.tasks.map((t) => t.end))
    // Ten years of days at most: shading beyond that is invisible anyway.
    for (let day = from; day < to && day < from + 3660 * DAY; day += DAY) {
      if (!excluded(day)) continue
      const last = diagram.excludedRanges[diagram.excludedRanges.length - 1]
      if (last && last.end === day) last.end = day + DAY
      else diagram.excludedRanges.push({ start: day, end: day + DAY })
    }
  }
  return diagram
}

function splitList(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

/** Whether a day is excluded: by weekday, by `weekends`, or by its date. */
function exclusionTest(
  diagram: GanttDiagram,
  format: DateFormat,
  weekend: [number, number],
  lines: Map<string, Statement>,
): ((time: number) => boolean) | null {
  if (diagram.excludes.length === 0) return null
  const days = new Set<number>()
  const dates = new Set<string>()
  const iso = compileFormat('YYYY-MM-DD')
  const toKey = (text: string): string | null => {
    const t = parseDate(text, format) ?? parseDate(text, iso)
    return t === null ? null : dayKey(t)
  }
  for (const item of diagram.excludes) {
    if (item === 'weekends') {
      days.add(weekend[0])
      days.add(weekend[1])
    } else if (item in WEEKDAY_INDEX) {
      days.add(WEEKDAY_INDEX[item]!)
    } else {
      const key = toKey(item)
      if (key === null) {
        const at = lines.get(item)
        throw new DiagramError(`"${item}" in excludes is neither a weekday nor a date`, at?.line ?? 0, at?.column ?? 0)
      }
      dates.add(key)
    }
  }
  const included = new Set(diagram.includes.map(toKey).filter((key): key is string => key !== null))
  return (time) => {
    const key = dayKey(time)
    if (included.has(key)) return false
    return days.has(weekday(time)) || dates.has(key)
  }
}

/** An error about a task, pointing at `item` within it when given, else after the colon. */
function fail(task: RawTask, message: string, hint?: string, item?: string): DiagramError {
  const colon = task.statement.text.indexOf(':')
  const at = item ? task.statement.text.indexOf(item, colon) : -1
  return new DiagramError(message, task.statement.line, task.statement.column + (at >= 0 ? at : colon + 1), hint)
}

function resolve(
  task: RawTask,
  index: number,
  all: RawTask[],
  byId: Map<string, RawTask>,
  format: DateFormat,
  diagram: GanttDiagram,
  excluded: ((time: number) => boolean) | null,
): void {
  if (task.end !== undefined) return
  if (task.resolving) {
    throw fail(task, `The task "${task.name}" depends on itself through "after" or "until"`)
  }
  task.resolving = true
  const dependency = (id: string): RawTask => {
    const other = byId.get(id)
    if (!other) throw fail(task, `No task has the id "${id}"`, undefined, id)
    resolve(other, all.indexOf(other), all, byId, format, diagram, excluded)
    return other
  }

  // Start.
  let start: number
  if (task.startSpec === null) {
    const previous = all[index - 1]!
    resolve(previous, index - 1, all, byId, format, diagram, excluded)
    start = previous.end!
  } else if (/^after\s/.test(task.startSpec)) {
    const ids = task.startSpec.slice(5).trim().split(/\s+/)
    start = Math.max(...ids.map((id) => dependency(id).end!))
  } else {
    const parsed = parseDate(task.startSpec, format)
    if (parsed === null) {
      throw fail(task, `"${task.startSpec}" is not a date in the format ${format.source}`, undefined, task.startSpec)
    }
    start = parsed
  }

  // End.
  let end: number
  let manualEnd = false
  const duration = parseDuration(task.endSpec)
  if (duration) {
    end = addDuration(start, duration)
  } else if (/^until\s/.test(task.endSpec)) {
    const ids = task.endSpec.slice(5).trim().split(/\s+/)
    end = Math.min(...ids.map((id) => dependency(id).start!))
    manualEnd = true
  } else {
    const parsed = parseDate(task.endSpec, format)
    if (parsed === null) {
      throw fail(
        task,
        `"${task.endSpec}" is neither a duration nor a date in the format ${format.source}`,
        'Durations: 3d, 2w, 4h, 30m, 1M.',
        task.endSpec,
      )
    }
    end = diagram.inclusiveEndDates ? parsed + DAY : parsed
    manualEnd = true
  }
  if (end < start) {
    throw fail(task, `The task "${task.name}" ends before it starts`)
  }

  // Excluded days stretch a task given by duration, as Mermaid does: each
  // excluded day inside it pushes the end one day further.
  let renderEnd = end
  if (excluded && !manualEnd && !task.tags.milestone) {
    let cursor = start
    let invalid = false
    let guard = 0
    while (cursor <= end && guard++ < 100000) {
      if (!invalid) renderEnd = end
      invalid = excluded(cursor)
      if (invalid) end += DAY
      cursor += DAY
    }
  }

  task.start = start
  task.end = end
  task.renderEnd = Math.max(start, Math.min(renderEnd, end))
  task.manualEnd = manualEnd
  task.resolving = false
}
