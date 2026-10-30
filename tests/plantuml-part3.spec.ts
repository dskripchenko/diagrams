import { describe, expect, it } from 'vitest'
import { approximateMeasurer, detect, DiagramError, parse, render } from '../src'
import type { C4Diagram } from '../src/diagrams/c4/parser'
import type { GanttDiagram } from '../src/diagrams/gantt/parser'
import type { MindmapDiagram } from '../src/diagrams/mindmap/parser'
import type { SaltDiagram, SaltWidget } from '../src/diagrams/salt'
import type { TimingDiagram } from '../src/diagrams/timing'

const opts = { measureText: approximateMeasurer }
const uml = (body: string) => `@startuml\n${body}\n@enduml`
const error = (source: string): DiagramError => {
  try {
    render(source, opts)
  } catch (e) {
    return e as DiagramError
  }
  throw new Error('rendered')
}
const day = (t: number) => new Date(t).toISOString().slice(0, 10)

describe('C4-PlantUML', () => {
  it('takes the level from the library included and the macros as Mermaid reads them', () => {
    const src = uml('!include <C4/C4_Container>\nLAYOUT_WITH_LEGEND()\nPerson(u, "User")\nSystem_Boundary(b, "Shop") {\n  Container(w, "Web", "React")\n}\nRel_Neighbor(u, w, "Uses")\nLay_R(u, w)\nSHOW_LEGEND()')
    expect(detect(src)).toBe('c4')
    const d = parse(src) as C4Diagram
    expect(d.kind).toBe('C4Container')
    expect([...d.elements.keys()]).toEqual(['u', 'w'])
    expect(d.relations).toHaveLength(1)
  })

  it('knows the library by URL and by the deepest level included', () => {
    const src = uml('!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Component.puml\n!include <C4/C4_Container>\nComponent(c, "Api")')
    expect((parse(src) as C4Diagram).kind).toBe('C4Component')
  })

  it('still refuses any other include', () => {
    expect(error(uml('!include <tupadr3/common>\nPerson(u, "U")')).message).toMatch(/not supported/)
  })
})

describe('PlantUML mind maps and WBS', () => {
  it('builds the tree from the stars, with boxless and multi-line nodes', () => {
    const d = parse('@startmindmap\n* Root\n** A\n***_ a1\n***:two\nlines;\n**[#Orange] B\nleft side\n-- C\n@endmindmap') as MindmapDiagram
    expect(d.root.label).toBe('Root')
    expect(d.root.children.map((c) => c.label)).toEqual(['A', 'B', 'C'])
    expect(d.root.children[0]!.children.map((c) => [c.label, c.shape])).toEqual([['a1', 'default'], ['two<br>lines', 'rounded']])
  })

  it('reads a WBS the same way and rejects a second root', () => {
    expect(detect('@startwbs\n* P\n** a\n@endwbs')).toBe('mindmap')
    expect(error('@startmindmap\n* A\n* B\n@endmindmap').message).toMatch(/one root/)
  })
})

describe('PlantUML Gantt charts', () => {
  const gantt = (body: string) => parse(`@startgantt\n${body}\n@endgantt`) as GanttDiagram
  const task = (d: GanttDiagram, name: string) => d.tasks.find((t) => t.name.startsWith(name))!

  it('gathers each task\'s facts and resolves the dates', () => {
    const d = gantt("Project starts 2026-03-02\n-- Design --\n[A] lasts 5 days\n[B] starts at [A]'s end and lasts 2 days\n[A] is completed\n-- Build --\n[C] as [X] lasts 1 week\n[X] starts 2026-03-16\n[X] is 40% completed\nthen [D] lasts 3 days\n[M] happens at [D]'s end\n[E] lasts 1 day\n[A] -> [E]")
    expect([day(task(d, 'A').start), day(task(d, 'A').end)]).toEqual(['2026-03-02', '2026-03-07'])
    expect(day(task(d, 'B').start)).toBe('2026-03-07')
    expect(task(d, 'A').tags.done).toBe(true)
    expect(task(d, 'C').tags.active).toBe(true)
    expect(task(d, 'C').name).toBe('C (40%)')
    expect(day(task(d, 'D').start)).toBe('2026-03-23')
    expect(task(d, 'M').tags.milestone).toBe(true)
    expect(day(task(d, 'E').start)).toBe('2026-03-07')
    expect(d.sections).toEqual(['Design', 'Build'])
  })

  it('skips closed weekends', () => {
    const d = gantt('Project starts 2026-03-06\nsaturday are closed\nsunday are closed\n[A] lasts 2 days')
    expect(day(task(d, 'A').end)).toBe('2026-03-10')
  })

  it('explains what it cannot do', () => {
    expect(error("@startgantt\n[A] lasts 2 days\n@endgantt").hint).toMatch(/Project starts/)
    expect(error("@startgantt\nProject starts 2026-01-01\n[A] lasts 2 days\n[B] starts 2 days after [A]'s end\n@endgantt").message).toMatch(/offset/)
    expect(error("@startgantt\nProject starts 2026-01-01\n[A] lasts 2 days\n[B] starts at [Z]'s end\n@endgantt").message).toMatch(/not a task/)
  })
})

describe('PlantUML timing diagrams', () => {
  const timing = (body: string) => parse(uml(body)) as TimingDiagram

  it('reads signals, moments, relative moments and the per-signal form', () => {
    const d = timing('robust "Browser" as B\nconcise "User" as U\nbinary "Cache" as C\nclock "Clk" as K with period 40 pulse 10 offset 5\nB has Idle,Busy\n@0\nB is Idle\nU is Idle\n@+100\nB is Busy\nU -> B@+20 : go\n@B\n300 is Idle\n@U\n0 is Away\n+50 is "Back again"\nhighlight 100 to 200 #Gold : net')
    expect(detect(uml('robust A\n@0\nA is X'))).toBe('timing')
    expect(d.signals.map((s) => s.kind)).toEqual(['robust', 'concise', 'binary', 'clock'])
    expect(d.signals[0]!.states).toEqual(['Busy', 'Idle'])
    expect(d.signals[0]!.changes).toEqual([{ at: 0, state: 'Idle' }, { at: 100, state: 'Busy' }, { at: 300, state: 'Idle' }])
    expect(d.signals[1]!.changes).toEqual([{ at: 0, state: 'Away' }, { at: 50, state: 'Back again' }])
    expect(d.signals[3]!.clock).toEqual({ period: 40, pulse: 10, offset: 5 })
    expect(d.messages).toEqual([{ from: 'U', to: 'B', at: 100, until: 120, text: 'go' }])
    expect(d.highlights[0]).toMatchObject({ from: 100, to: 200, text: 'net', color: 'Gold' })
  })

  it('refuses changes that go back in time, unknown signals and unsafe colours', () => {
    expect(error(uml('concise A\n@100\nA is X\n@50\nA is Y')).message).toMatch(/before its previous change/)
    expect(error(uml('concise A\n@0\nB is X')).message).toMatch(/not a signal/)
    expect(() => render(uml('concise A\n@0\nA is X\nhighlight 0 to 10 #url(x) : y'), opts)).toThrow()
  })

  it('draws every kind', () => {
    const svg = render(uml('robust R\nconcise C\nbinary B\nclock K with period 10\n@0\nR is a\nC is b\nB is high\n@20\nR is c\nC is {-}\nB is low'), opts).svg
    for (const k of ['robust', 'concise', 'binary', 'clock']) expect(svg).toContain(`dg-timing-${k}`)
  })
})

describe('Salt wireframes', () => {
  const salt = (body: string) => (parse(`@startsalt\n${body}\n@endsalt`) as SaltDiagram).root
  const kinds = (w: SaltWidget): unknown => (w.kind === 'grid' ? w.rows.map((row) => row.map(kinds)) : w.kind)

  it('reads widgets into a grid', () => {
    const root = salt('{+\n  Login | "name   "\n  [X] Keep | [] Other\n  (X) One | () Two\n  ^Lang^ | [OK]\n  . | <b>Bold\n  ..\n}')
    expect(root).toMatchObject({ kind: 'grid', border: 'outer' })
    expect(kinds(root)).toEqual([
      ['text', 'input'],
      ['checkbox', 'checkbox'],
      ['radio', 'radio'],
      ['droplist', 'button'],
      ['empty', 'text'],
      ['separator'],
    ])
    const grid = root as Extract<SaltWidget, { kind: 'grid' }>
    expect(grid.rows[0]![1]).toEqual({ kind: 'input', text: 'name   ' })
    expect(grid.rows[1]![0]).toMatchObject({ checked: true, text: 'Keep' })
    expect(grid.rows[4]![1]).toMatchObject({ text: 'Bold', bold: true })
  })

  it('reads nested blocks: borders, tabs, menu, tree, group box, scroll', () => {
    const root = salt('{\n{# a | b }\n{/ <b>One | Two }\n{* File | Edit }\n{T\n+ root\n++ child\n}\n{^"Group"\nx\n}\n{S\ny\n}\n}') as Extract<SaltWidget, { kind: 'grid' }>
    const [table, tabs, menu, tree, group, scroll] = root.rows.map((row) => row[0]!)
    expect(table).toMatchObject({ kind: 'grid', border: 'all' })
    expect(tabs).toEqual({ kind: 'tabs', tabs: ['One', 'Two'], selected: 0, vertical: false })
    expect(menu).toEqual({ kind: 'menu', items: ['File', 'Edit'] })
    expect(tree).toEqual({ kind: 'tree', items: [{ depth: 1, text: 'root' }, { depth: 2, text: 'child' }] })
    expect(group).toMatchObject({ kind: 'grid', title: 'Group', border: 'outer' })
    expect(scroll).toMatchObject({ kind: 'grid', scroll: true })
  })

  it('is recognised in a @startuml with "salt" and reports unclosed blocks', () => {
    expect(detect(uml('salt\n{\n[OK]\n}'))).toBe('salt')
    expect(error('@startsalt\n{\n[OK]\n@endsalt').message).toMatch(/never closed/)
  })
})

describe('part 3 labels never become markup', () => {
  const payload = '<script>alert(1)</script>'
  const sources = [
    `@startmindmap\n* ${payload}\n@endmindmap`,
    `@startgantt\nProject starts 2026-01-01\n[${payload}] lasts 2 days\n@endgantt`,
    uml(`concise "${payload}" as A\n@0\nA is ${payload}`),
    `@startsalt\n{\n${payload} | [${payload}] | "${payload}"\n}\n@endsalt`,
    uml(`!include <C4/C4_Context>\nPerson(a, "${payload}")`),
  ]
  for (const src of sources) {
    it(src.split('\n')[1]!, () => {
      let svg: string
      try {
        svg = render(src, opts).svg
      } catch {
        return
      }
      expect(svg).not.toMatch(/<script/i)
      expect(svg.match(/<svg/g)).toHaveLength(1)
    })
  }
})
