/**
 * PlantUML Gantt charts (`@startgantt`), read into the Gantt model through
 * Mermaid's Gantt parser. PlantUML states facts about a task over several
 * lines (`lasts`, `starts at … end`, `is 50% completed`); they are gathered
 * per task and written as one Mermaid task each, in an order where every
 * task comes after the ones it depends on.
 *
 *     @startgantt
 *     Project starts 2026-03-02
 *     saturday are closed
 *     sunday are closed
 *     -- Design --
 *     [Discovery] lasts 5 days
 *     [Wireframes] starts at [Discovery]'s end and lasts 4 days
 *     -- Build --
 *     [API] as [A] lasts 10 days
 *     [A] starts at [Wireframes]'s end
 *     [A] is 40% completed
 *     [Release] happens at [A]'s end
 *     @endgantt
 *
 * Supported: `Project starts DATE`; `[Task] lasts / requires N days|weeks`;
 * `starts DATE`, `starts at [X]'s end` or `start`,
 * `ends DATE`, `ends at [X]'s start` (an end before which it stops);
 * `then [Task] …` (after the previous task); `[A] -> [B]`; aliases (`as`);
 * milestones (`happens at [X]'s end`, `happens DATE`); `is N% completed`
 * (100 % — done, less — active); `-- Section --`; closed weekdays and dates;
 * clauses joined with `and`. Colours, resources (`on {Alice}`), scale and
 * language settings are accepted.
 */
import { DiagramError } from '../core/errors'
import type { Statement } from '../core/scanner'
import { parseGantt, type GanttDiagram } from '../diagrams/gantt/parser'
import type { PlantUmlSource } from './source'
import { Translation } from './translate'

interface Task {
  id: string
  name: string
  section: string
  start?: { date?: string; after?: string }
  end?: { date?: string; until?: string }
  days?: number
  milestone: boolean
  progress?: number
  s: Statement
}

const DATE = String.raw`\d{4}-\d{2}-\d{2}`
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function duration(n: string, unit: string): number {
  return Number(n) * (/^week/i.test(unit) ? 7 : 1)
}

export function parsePlantUmlGantt(src: PlantUmlSource): GanttDiagram {
  const tasks = new Map<string, Task>()
  const names = new Map<string, string>()
  const closed: string[] = []
  let projectStart: string | undefined
  let section = ''
  let last: Task | null = null

  const task = (name: string, s: Statement): Task => {
    const known = names.get(name)
    if (known) return tasks.get(known)!
    const t: Task = { id: `t${tasks.size + 1}`, name, section, milestone: false, s }
    tasks.set(t.id, t)
    names.set(name, t.id)
    return t
  }
  const ref = (name: string, s: Statement): string => {
    const id = names.get(name)
    if (!id) throw new DiagramError(`"[${name}]" is not a task`, s.line, s.column, 'Declare the task before referring to it.')
    return id
  }

  for (const s of src.statements) {
    let text = s.text
    let m: RegExpExecArray | null
    if ((m = new RegExp(`^project\\s+starts\\s+(?:the\\s+)?(${DATE})$`, 'i').exec(text))) {
      projectStart = m[1]
      continue
    }
    if ((m = /^--\s*(.*?)\s*--$/.exec(text))) {
      section = m[1]!
      continue
    }
    if ((m = new RegExp(`^(${WEEKDAYS.join('|')})s?\\s+(?:are|is)\\s+closed$`, 'i').exec(text))) {
      closed.push(m[1]!.toLowerCase())
      continue
    }
    if ((m = new RegExp(`^(${DATE})(?:\\s+to\\s+(${DATE}))?\\s+(?:are|is)\\s+closed$`, 'i').exec(text))) {
      closed.push(m[1]!)
      continue
    }
    if (/^(printscale|projectscale|language|today|hide|show|saturday|sunday|\d{4}-\d{2}-\d{2}.*\bopen\b|.*\bare\s+open$|.*\bis\s+open$|<style>|separator)/i.test(text)) continue
    if ((m = /^\[([^\]]+)\]\s*->\s*\[([^\]]+)\]$/.exec(text))) {
      const a = ref(m[1]!, s)
      const b = task(m[2]!, s)
      b.start = { after: a }
      continue
    }
    let then = false
    if (/^then\s+/i.test(text)) {
      then = true
      text = text.replace(/^then\s+/i, '')
    }
    m = /^\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s*(.*)$/.exec(text)
    if (!m) throw new DiagramError(`"${s.text}" is not a Gantt statement`, s.line, s.column, '[Task] lasts 5 days')
    const t = task(m[1]!, s)
    if (m[2]) names.set(m[2], t.id)
    if (then && last) t.start = { after: last.id }
    for (const raw of m[3]!.split(/\s+and\s+/i)) {
      const clause = raw.trim().replace(/\s+on\s+\{[^}]*\}.*$/i, '')
      if (clause === '') continue
      let c: RegExpExecArray | null
      if ((c = /^(?:lasts|requires)\s+(\d+)\s+(days?|weeks?)$/i.exec(clause))) t.days = duration(c[1]!, c[2]!)
      else if ((c = new RegExp(`^starts\\s+(?:the\\s+)?(${DATE})$`, 'i').exec(clause))) t.start = { date: c[1] }
      else if (/^starts\s+\d+\s+days?\s+(after|before)\s/i.test(clause)) {
        throw new DiagramError('A start offset ("N days after") is not supported yet', s.line, s.column, "Start at [X]'s end, or give the task a date.")
      } else if ((c = /^starts\s+(?:at\s+)?\[([^\]]+)\]'s\s+end$/i.exec(clause))) t.start = { after: ref(c[1]!, s) }
      else if ((c = /^starts\s+at\s+\[([^\]]+)\]'s\s+start$/i.exec(clause))) t.start = { after: `start:${ref(c[1]!, s)}` }
      else if ((c = new RegExp(`^ends\\s+(?:the\\s+)?(${DATE})$`, 'i').exec(clause))) t.end = { date: c[1] }
      else if ((c = /^ends\s+at\s+\[([^\]]+)\]'s\s+start$/i.exec(clause))) t.end = { until: ref(c[1]!, s) }
      else if ((c = /^happens\s+at\s+\[([^\]]+)\]'s\s+end$/i.exec(clause))) {
        t.milestone = true
        t.start = { after: ref(c[1]!, s) }
      } else if ((c = new RegExp(`^happens\\s+(?:the\\s+)?(${DATE})$`, 'i').exec(clause))) {
        t.milestone = true
        t.start = { date: c[1] }
      } else if ((c = /^is\s+(\d+)%\s+(?:completed|complete)$/i.exec(clause))) t.progress = Number(c[1])
      else if (/^is\s+completed$/i.test(clause)) t.progress = 100
      else if (/^is\s+colou?red\b|^is\s+deleted$|^displays\s/i.test(clause)) continue
      else throw new DiagramError(`"${clause}" is not something a task can do here`, s.line, s.column, 'lasts 5 days, starts at [X]\'s end, is 40% completed, happens at [X]\'s end')
    }
    last = t
  }
  if (tasks.size === 0) throw new DiagramError('The chart has no tasks', 0, 0, '[Task] lasts 5 days')

  // Dates: a task with no start begins with the project.
  const needsStart = [...tasks.values()].some((t) => !t.start || (!t.start.date && !t.start.after))
  if (needsStart && !projectStart) {
    const first = [...tasks.values()].find((t) => !t.start)!
    throw new DiagramError('The chart needs a start date', first.s.line, first.s.column, 'Project starts 2026-01-05, or give the first task a date.')
  }

  // Dependencies first: Mermaid reads `after id` only for tasks above.
  const order: Task[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (t: Task) => {
    if (state.get(t.id) === 'done') return
    if (state.get(t.id) === 'visiting') throw new DiagramError(`"[${t.name}]" depends on itself`, t.s.line, t.s.column)
    state.set(t.id, 'visiting')
    const after = t.start?.after?.replace(/^start:/, '')
    for (const dep of [after, t.end?.until]) if (dep) visit(tasks.get(dep)!)
    state.set(t.id, 'done')
    order.push(t)
  }
  for (const t of tasks.values()) visit(t)

  const tr = new Translation('gantt')
  const first = src.statements[0]!
  tr.add('dateFormat YYYY-MM-DD', first)
  if (src.title) tr.add(`title ${src.title.replace(/\n/g, ' ')}`, first)
  const weekdays = closed.filter((c) => WEEKDAYS.includes(c))
  const weekend = weekdays.includes('saturday') && weekdays.includes('sunday')
  const excluded = [...(weekend ? ['weekends'] : []), ...weekdays.filter((d) => !weekend || (d !== 'saturday' && d !== 'sunday')), ...closed.filter((c) => !WEEKDAYS.includes(c))]
  if (excluded.length > 0) tr.add(`excludes ${excluded.join(' ')}`, first)
  let current: string | null = null
  // Mermaid groups by section in source order: emit section headers when the section changes.
  for (const t of order) {
    if (t.section !== current) {
      current = t.section
      if (t.section) tr.add(`section ${t.section}`, t.s)
    }
    const tags: string[] = []
    if (t.milestone) tags.push('milestone')
    if (t.progress !== undefined) tags.push(t.progress >= 100 ? 'done' : t.progress > 0 ? 'active' : '')
    let start: string
    if (t.start?.date) start = t.start.date
    else if (t.start?.after?.startsWith('start:')) start = tasks.get(t.start.after.slice(6))!.start?.date ?? projectStart!
    else if (t.start?.after) start = `after ${t.start.after}`
    else start = projectStart!
    let end: string
    if (t.milestone) end = '0d'
    else if (t.end?.date) end = t.end.date
    else if (t.end?.until) end = `until ${t.end.until}`
    else end = `${t.days ?? 1}d`
    const name = t.name.replace(/[:#;]/g, ' ').trim() + (t.progress !== undefined && t.progress > 0 && t.progress < 100 ? ` (${t.progress}%)` : '')
    tr.add(`${name} :${[...tags.filter(Boolean), t.id, start, end].join(', ')}`, t.s)
  }
  return tr.parse(parseGantt)
}
