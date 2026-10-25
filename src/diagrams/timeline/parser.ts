/**
 * Timelines: time periods in order, each with its events.
 *
 *     timeline
 *         title History of social media
 *         section The early years
 *             2002 : LinkedIn
 *             2004 : Facebook : Google
 *                  : Orkut
 *
 * A period is the text before the first `: `; every `: ` after it starts an
 * event. A colon not followed by a space stays in the text, so `10:30` is a
 * time, not a separator. A line that starts with `:` adds events to the
 * period above it.
 */
import { DiagramError } from '../../core/errors'
import { statements, type Statement } from '../../core/scanner'
import { accessibilityStatement, type Accessibility } from '../common'

export interface TimelinePeriod {
  label: string
  events: string[]
  /** Index into `sections`, or null before the first section. */
  section: number | null
  line: number
}

export interface TimelineSection {
  label: string
  line: number
}

export interface TimelineDiagram {
  type: 'timeline'
  title?: string
  sections: TimelineSection[]
  periods: TimelinePeriod[]
  accessibility: Accessibility
}

const MAX_PERIODS = 200
const MAX_EVENTS = 1000

/** Splits a line on colons that are followed by whitespace or end the line. */
function splitEvents(text: string): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = []
  let start = 0
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || (text[i] === ':' && (i + 1 === text.length || /\s/.test(text[i + 1]!)))) {
      const raw = text.slice(start, i)
      const part = raw.trim()
      // An empty event is reported at the colon that opened it.
      out.push({ text: part, offset: part === '' ? Math.max(0, start - 1) : start + (raw.length - raw.trimStart().length) })
      start = i + 1
    }
  }
  return out
}

function addEvents(period: TimelinePeriod, parts: { text: string; offset: number }[], s: Statement): void {
  for (const part of parts) {
    if (part.text === '') {
      throw new DiagramError('An event is empty', s.line, s.column + part.offset, 'Write text after each ": "')
    }
    period.events.push(part.text)
  }
}

export function parseTimeline(source: string): TimelineDiagram {
  const list = statements(source)
  const head = list[0]
  const m = head ? /^timeline\b\s*(.*)$/.exec(head.text) : null
  if (!head || !m) {
    throw new DiagramError('A timeline starts with "timeline"', head?.line ?? 1, 1)
  }
  const option = m[1]!.trim()
  if (option === 'TD' || option === 'TB') {
    throw new DiagramError('Vertical timelines are not supported', head.line, head.column + 9, 'Write "timeline" or "timeline LR"')
  } else if (option !== '' && option !== 'LR') {
    throw new DiagramError(`Unexpected "${option}" after "timeline"`, head.line, head.column + 9)
  }

  const diagram: TimelineDiagram = { type: 'timeline', sections: [], periods: [], accessibility: {} }
  let events = 0
  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const consumed = accessibilityStatement(list, i, diagram.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    if (/^title(\s|$)/.test(s.text)) {
      const text = s.text.slice(5).trim()
      diagram.title = text === '' ? undefined : text
      continue
    }
    if (/^section(\s|$)/.test(s.text)) {
      const label = s.text.slice(7).trim()
      if (label === '') {
        throw new DiagramError('A section needs a name', s.line, s.column, 'Write section 2020s')
      }
      diagram.sections.push({ label, line: s.line })
      continue
    }
    if (s.text.startsWith(':')) {
      // A continuation line: events for the period above.
      const period = diagram.periods[diagram.periods.length - 1]
      if (!period) {
        throw new DiagramError('Events without a time period', s.line, s.column, 'Start with a period: 2024 : Event')
      }
      const parts = splitEvents(s.text.slice(1)).map((p) => ({ ...p, offset: p.offset + 1 }))
      addEvents(period, parts, s)
      events += parts.length
    } else {
      if (diagram.periods.length >= MAX_PERIODS) {
        throw new DiagramError(`The timeline has more than ${MAX_PERIODS} time periods`, s.line, s.column, 'Split it into several timelines.')
      }
      const [first, ...parts] = splitEvents(s.text)
      const period: TimelinePeriod = {
        label: first!.text,
        events: [],
        section: diagram.sections.length > 0 ? diagram.sections.length - 1 : null,
        line: s.line,
      }
      addEvents(period, parts, s)
      diagram.periods.push(period)
      events += parts.length
    }
    if (events > MAX_EVENTS) {
      throw new DiagramError(`The timeline has more than ${MAX_EVENTS} events`, s.line, s.column, 'Split it into several timelines.')
    }
  }
  if (diagram.periods.length === 0 && diagram.sections.length === 0) {
    throw new DiagramError('The timeline has no time periods', 0, 0, 'Add lines like: 2024 : Event')
  }
  return diagram
}
