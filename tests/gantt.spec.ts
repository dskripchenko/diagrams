/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { approximateMeasurer, detect, DiagramError, parse, render } from '../src'
import { parseGantt, renderGantt } from '../src/diagrams/gantt'
import { compileFormat, formatDate, parseDate, ticks } from '../src/diagrams/gantt/dates'
import basic from './fixtures/gantt-basic.mmd?raw'
import excludes from './fixtures/gantt-excludes.mmd?raw'
import hours from './fixtures/gantt-hours.mmd?raw'
import sections from './fixtures/gantt-sections.mmd?raw'

const opts = { measureText: approximateMeasurer }
const utc = (iso: string) => Date.parse(`${iso}Z`)

function error(source: string): DiagramError {
  try {
    parseGantt(source)
  } catch (e) {
    expect(e).toBeInstanceOf(DiagramError)
    return e as DiagramError
  }
  throw new Error('expected a DiagramError')
}

describe('gantt dates', () => {
  it('parses the supported date formats in UTC', () => {
    expect(parseDate('2024-03-05', compileFormat('YYYY-MM-DD'))).toBe(utc('2024-03-05T00:00:00'))
    expect(parseDate('2024-03-05 14:30', compileFormat('YYYY-MM-DD HH:mm'))).toBe(utc('2024-03-05T14:30:00'))
    expect(parseDate('05.03.2024', compileFormat('DD.MM.YYYY'))).toBe(utc('2024-03-05T00:00:00'))
    expect(parseDate('14:30', compileFormat('HH:mm'))).toBe(utc('1970-01-01T14:30:00'))
    expect(parseDate('1700000000', compileFormat('X'))).toBe(1700000000000)
  })

  it('rejects dates that do not exist', () => {
    expect(parseDate('2023-02-29', compileFormat('YYYY-MM-DD'))).toBeNull()
    expect(parseDate('2024-13-01', compileFormat('YYYY-MM-DD'))).toBeNull()
    expect(parseDate('2024/01/01', compileFormat('YYYY-MM-DD'))).toBeNull()
  })

  it('formats with the strftime subset', () => {
    const t = utc('2024-03-05T09:07:03')
    expect(formatDate(t, '%Y-%m-%d %H:%M:%S')).toBe('2024-03-05 09:07:03')
    expect(formatDate(t, '%e %b %y, %a')).toBe(' 5 Mar 24, Tue')
    expect(formatDate(t, '%-d %B %I%p %j %%')).toBe('5 March 09AM 065 %')
  })

  it('aligns week ticks to Sunday and month ticks to the first', () => {
    const weeks = ticks(utc('2024-03-01T00:00:00'), utc('2024-03-20T00:00:00'), { unit: 'w', step: 1 })
    expect(weeks.map((t) => new Date(t).toISOString().slice(0, 10))).toEqual(['2024-03-03', '2024-03-10', '2024-03-17'])
    const months = ticks(utc('2024-01-15T00:00:00'), utc('2024-04-02T00:00:00'), { unit: 'M', step: 1 })
    expect(months.map((t) => new Date(t).toISOString().slice(0, 10))).toEqual(['2024-02-01', '2024-03-01', '2024-04-01'])
  })
})

describe('gantt parsing', () => {
  it('is detected', () => {
    expect(detect('gantt\n  A : 2024-01-01, 1d')).toBe('gantt')
  })

  it('reads ids, dates, durations, after and implicit starts', () => {
    const d = parseGantt(`gantt
      dateFormat YYYY-MM-DD
      A : a, 2024-01-01, 3d
      B : b, after a, 2w
      C : 12h
      D : 2024-02-01, 2024-02-03
      E : e, after a b, 1d`)
    const byId = Object.fromEntries(d.tasks.map((t) => [t.id, t]))
    expect(byId.a!.end).toBe(utc('2024-01-04T00:00:00'))
    expect(byId.b!.start).toBe(utc('2024-01-04T00:00:00'))
    expect(byId.b!.end).toBe(utc('2024-01-18T00:00:00'))
    // No start: begins where the previous task ends.
    expect(byId.task3!.start).toBe(utc('2024-01-18T00:00:00'))
    expect(byId.task3!.end).toBe(utc('2024-01-18T12:00:00'))
    expect(byId.task4!.end).toBe(utc('2024-02-03T00:00:00'))
    // `after a b` takes the later of the two ends.
    expect(byId.e!.start).toBe(byId.b!.end)
  })

  it('resolves after and until against tasks defined later', () => {
    const d = parseGantt(`gantt
      First : f, after s, 2d
      Second : s, 2024-01-01, 3d
      Third : t, 2024-01-02, until f`)
    expect(d.tasks[0]!.start).toBe(utc('2024-01-04T00:00:00'))
    expect(d.tasks[2]!.end).toBe(d.tasks[0]!.start)
  })

  it('applies a dateFormat written after the tasks', () => {
    const d = parseGantt('gantt\n  A : 05.03.2024, 1d\n  dateFormat DD.MM.YYYY')
    expect(d.tasks[0]!.start).toBe(utc('2024-03-05T00:00:00'))
  })

  it('reads tags in any combination', () => {
    const d = parseGantt(`gantt
      A : done, crit, a, 2024-01-01, 1d
      B : active, 1d
      M : milestone, crit, after a, 0d`)
    expect(d.tasks.map((t) => t.tags)).toEqual([
      { done: true, active: false, crit: true, milestone: false },
      { done: false, active: true, crit: false, milestone: false },
      { done: false, active: false, crit: true, milestone: true },
    ])
  })

  it('collects sections in order of appearance', () => {
    const d = parseGantt('gantt\n  Loose : 2024-01-01, 1d\n  section One\n  A : 1d\n  section Two\n  B : 1d')
    expect(d.sections).toEqual(['', 'One', 'Two'])
    expect(d.tasks.map((t) => t.section)).toEqual(['', 'One', 'Two'])
  })

  it('stretches a task over excluded weekends and dates', () => {
    // 2024-05-03 is a Friday; 3 working days end on Wednesday the 8th.
    const d = parseGantt(`gantt
      excludes weekends
      A : 2024-05-03, 3d`)
    expect(d.tasks[0]!.end).toBe(utc('2024-05-08T00:00:00'))
    expect(d.excludedRanges).toEqual([{ start: utc('2024-05-04T00:00:00'), end: utc('2024-05-06T00:00:00') }])

    const holiday = parseGantt('gantt\n  excludes 2024-05-01\n  A : 2024-04-30, 2d')
    expect(holiday.tasks[0]!.end).toBe(utc('2024-05-03T00:00:00'))

    const named = parseGantt('gantt\n  excludes monday\n  A : 2024-05-03, 4d')
    expect(named.tasks[0]!.end).toBe(utc('2024-05-08T00:00:00'))
  })

  it('does not stretch a task given by an end date', () => {
    const d = parseGantt('gantt\n  excludes weekends\n  A : 2024-05-03, 2024-05-07')
    expect(d.tasks[0]!.end).toBe(utc('2024-05-07T00:00:00'))
  })

  it('honours weekend friday and includes', () => {
    const d = parseGantt('gantt\n  excludes weekends\n  weekend friday\n  includes 2024-05-03\n  A : 2024-05-02, 3d')
    // Thu 2, Fri 3 (included), Sat 4 excluded, Sun 5 → ends on Mon 6.
    expect(d.tasks[0]!.end).toBe(utc('2024-05-06T00:00:00'))
  })

  it('makes end dates inclusive on request', () => {
    const d = parseGantt('gantt\n  inclusiveEndDates\n  A : 2024-01-01, 2024-01-03')
    expect(d.tasks[0]!.end).toBe(utc('2024-01-04T00:00:00'))
  })

  it('accepts colons inside settings', () => {
    const d = parseGantt('gantt\n  dateFormat YYYY-MM-DD HH:mm\n  axisFormat %H:%M\n  A : 2024-01-01 10:00, 2h')
    expect(d.tasks[0]!.end).toBe(utc('2024-01-01T12:00:00'))
    expect(d.axisFormat).toBe('%H:%M')
  })

  it('reports errors at their position', () => {
    expect(error('gantt\n  A : 2024-01-01, 1d\n  B : after nope, 1d')).toMatchObject({ line: 3 })
    expect(error('gantt\n  A : 2024-01-01, 1d\n  B : 2024-01-05, soon')).toMatchObject({ line: 3, column: 19 })
    expect(error('gantt\n  A : 1d')).toMatchObject({ line: 2 })
    expect(error('gantt\n  dateFormat MMM D\n  A : Jan 1, 1d')).toMatchObject({ line: 2 })
    expect(error('gantt\n  axisFormat %Q\n  A : 2024-01-01, 1d')).toMatchObject({ line: 2 })
    expect(error('gantt\n  A : a, 2024-01-01, 1d\n  B : a, 2024-01-01, 1d')).toMatchObject({ line: 3 })
    expect(error('gantt\n  A : a, after b, 1d\n  B : b, after a, 1d').message).toMatch(/depends on itself/)
    expect(error('gantt\n  A : 2024-01-05, 2024-01-01')).toMatchObject({ line: 2 })
    expect(error('gantt\n  just words')).toMatchObject({ line: 2 })
    expect(error('gantt\n  excludes someday\n  A : 2024-01-01, 1d')).toMatchObject({ line: 2 })
  })

  it('refuses callbacks and unsafe links', () => {
    expect(error('gantt\n  A : a, 2024-01-01, 1d\n  click a call alert(1)').message).toMatch(/href/)
    expect(error('gantt\n  A : a, 2024-01-01, 1d\n  click a href "javascript:alert(1)"').message).toMatch(/not allowed/)
    const d = parseGantt('gantt\n  A : a, 2024-01-01, 1d\n  click a href "https://example.com/a"')
    expect(d.tasks[0]!.href).toBe('https://example.com/a')
  })
})

describe('gantt rendering', () => {
  const fixtures = [basic, sections, excludes, hours]

  it('renders every fixture deterministically', () => {
    for (const source of fixtures) {
      const first = render(source, opts)
      expect(first.type).toBe('gantt')
      expect(first.svg.startsWith('<svg')).toBe(true)
      expect(render(source, opts).svg).toBe(first.svg)
    }
  })

  it('draws one bar per task and milestones as diamonds', () => {
    const { svg } = render(fixtures[1]!, opts)
    expect(svg.match(/<rect class="dg-task[ "]/g)).toHaveLength(7)
    expect(svg.match(/<polygon class="dg-task dg-milestone/g)).toHaveLength(2)
    expect(svg).toContain('dg-task dg-task-active dg-task-crit')
  })

  it('shades excluded days', () => {
    expect(render(fixtures[2]!, opts).svg).toContain('class="dg-gantt-exclude"')
  })

  it('draws the today line only when given a moment inside the chart', () => {
    const d = parseGantt(fixtures[0]!)
    expect(renderGantt(d, approximateMeasurer, 'g').svg).not.toContain('class="dg-gantt-today"')
    expect(renderGantt(d, approximateMeasurer, 'g', undefined, new Date(utc('2024-01-10T00:00:00'))).svg).toContain(
      'class="dg-gantt-today"',
    )
    expect(renderGantt(d, approximateMeasurer, 'g', undefined, new Date(utc('2030-01-01T00:00:00'))).svg).not.toContain(
      'class="dg-gantt-today"',
    )
    const off = parseGantt(`${fixtures[0]!}\n    todayMarker off`)
    expect(renderGantt(off, approximateMeasurer, 'g', undefined, new Date(utc('2024-01-10T00:00:00'))).svg).not.toContain(
      'class="dg-gantt-today"',
    )
    const styled = parseGantt(`${fixtures[0]!}\n    todayMarker stroke-width:5px,stroke:#0f0`)
    expect(renderGantt(styled, approximateMeasurer, 'g', undefined, new Date(utc('2024-01-10T00:00:00'))).svg).toContain(
      'style="stroke-width:5px;stroke:#0f0"',
    )
  })

  it('wraps linked tasks in an anchor', () => {
    const { svg } = render('gantt\n  A : a, 2024-01-01, 1d\n  click a href "https://example.com/?x=1&y=2"', opts)
    expect(svg).toContain('<a href="https://example.com/?x=1&amp;y=2">')
  })

  it('escapes names, sections and titles', () => {
    const { svg } = render(
      'gantt\n  title <b>t</b>\n  section <img src=x onerror=alert(1)>\n  <script>x</script> : 2024-01-01, 1d',
      opts,
    )
    expect(svg).not.toMatch(/<(script|img|b)[\s>]/)
    expect(svg).toContain('&lt;script&gt;')
    expect(svg).toContain('&lt;img src=x')
  })

  it('honours tickInterval and refuses one that floods the axis', () => {
    const source = 'gantt\n  tickInterval 1day\n  A : 2024-01-01, 5d'
    expect(render(source, opts).svg.match(/class="dg-gantt-axis"/g)).toHaveLength(6)
    expect(() => render('gantt\n  tickInterval 1second\n  A : 2024-01-01, 5d', opts)).toThrow(DiagramError)
  })

  it('parse() returns the resolved tasks', () => {
    expect(parse('gantt\n  A : 2024-01-01, 1d')).toMatchObject({ type: 'gantt', tasks: [{ name: 'A' }] })
  })
})

describe('today option', () => {
  const src = 'gantt\n  dateFormat YYYY-MM-DD\n  A : 2026-01-01, 10d'
  it('draws the today line only when asked', async () => {
    const { render, approximateMeasurer } = await import('../src')
    const plain = render(src, { measureText: approximateMeasurer }).svg
    const marked = render(src, { measureText: approximateMeasurer, today: new Date(Date.UTC(2026, 0, 5)) }).svg
    expect(marked).not.toBe(plain)
    expect(marked.length).toBeGreaterThan(plain.length)
    const off = render(src + '\n  todayMarker off', { measureText: approximateMeasurer, today: new Date(Date.UTC(2026, 0, 5)) }).svg
    expect(off).toBe(render(src + '\n  todayMarker off', { measureText: approximateMeasurer }).svg)
  })
})
