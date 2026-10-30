import { describe, expect, it } from 'vitest'
import { approximateMeasurer, detect, DiagramError, parse, render } from '../src'
import type { BlockDiagram } from '../src/diagrams/block'
import type { ClassDiagram } from '../src/diagrams/class/parser'
import type { Flowchart } from '../src/diagrams/flowchart/parser'
import type { GitGraph } from '../src/diagrams/gitgraph'
import type { JourneyDiagram } from '../src/diagrams/journey'
import type { KanbanBoard } from '../src/diagrams/kanban'
import type { QuadrantChart } from '../src/diagrams/quadrant'
import type { SankeyDiagram } from '../src/diagrams/sankey'

const opts = { measureText: approximateMeasurer }
const error = (source: string): DiagramError => {
  try {
    render(source, opts)
  } catch (e) {
    return e as DiagramError
  }
  throw new Error('rendered')
}

describe('journey', () => {
  it('reads sections, tasks, scores and actors', () => {
    const d = parse('journey\n  title Day\n  section Morning\n    Tea: 5: Me\n    Work: 1: Me, Cat\n  section Evening\n    Home: 3') as JourneyDiagram
    expect(detect('journey\n  A: 1: B')).toBe('journey')
    expect(d.title).toBe('Day')
    expect(d.sections).toEqual(['Morning', 'Evening'])
    expect(d.tasks.map((t) => [t.name, t.score, t.actors, t.section])).toEqual([
      ['Tea', 5, ['Me'], 'Morning'],
      ['Work', 1, ['Me', 'Cat'], 'Morning'],
      ['Home', 3, [], 'Evening'],
    ])
    expect(d.actors).toEqual(['Me', 'Cat'])
  })
  it('refuses scores out of 1–5 and draws a face per score', () => {
    expect(error('journey\n  A: 7: B').message).toMatch(/1 to 5/)
    const svg = render('journey\n  A: 1: X\n  B: 5: X', opts).svg
    expect(svg).toContain('dg-journey-score-1')
    expect(svg).toContain('dg-journey-score-5')
  })
})

describe('quadrantChart', () => {
  it('reads axes, quadrants, points, styles and classes', () => {
    const d = parse('quadrantChart\n  x-axis Low --> High\n  y-axis Bottom\n  quadrant-2 Two\n  A: [0.1, 0.9] radius: 9, color: #ff0000\n  B:::hot: [0.5, 0.5]\n  classDef hot color: red, stroke-width: 2px') as QuadrantChart
    expect(d.xAxis).toEqual(['Low', 'High'])
    expect(d.yAxis).toEqual(['Bottom', ''])
    expect(d.quadrants[1]).toBe('Two')
    expect(d.points[0]).toMatchObject({ label: 'A', x: 0.1, y: 0.9, style: { radius: 9, color: '#ff0000' } })
    expect(d.points[1]!.classes).toEqual(['hot'])
    expect(d.classDefs.get('hot')).toEqual({ color: 'red', strokeWidth: 2 })
  })
  it('refuses points outside 0–1, unknown styles and unsafe colours', () => {
    expect(error('quadrantChart\n  A: [1.5, 0]').message).toMatch(/0 to 1/)
    expect(error('quadrantChart\n  A: [0.5, 0.5] size: 3').message).toMatch(/not a point style/)
    expect(() => render('quadrantChart\n  A: [0.5, 0.5] color: url(x)', opts)).toThrow()
  })
})

describe('kanban', () => {
  it('reads columns by indentation and cards with metadata', () => {
    const d = parse("kanban\n  todo[To do]\n    a[Write]@{ assigned: 'anna', ticket: T-1, priority: 'Very High' }\n    Plain text card\n  done[Done]") as KanbanBoard
    expect(d.columns.map((c) => [c.id, c.title, c.cards.length])).toEqual([['todo', 'To do', 2], ['done', 'Done', 0]])
    expect(d.columns[0]!.cards[0]).toEqual({ id: 'a', text: 'Write', assigned: 'anna', ticket: 'T-1', priority: 'very-high' })
    expect(d.columns[0]!.cards[1]!.text).toBe('Plain text card')
  })
  it('refuses unknown priorities and metadata', () => {
    expect(error("kanban\n  c[C]\n    a[A]@{ priority: 'Urgent' }").message).toMatch(/not a priority/)
    expect(error("kanban\n  c[C]\n    a[A]@{ owner: 'x' }").message).toMatch(/not card metadata/)
  })
})

describe('requirementDiagram', () => {
  it('reads requirements and elements into boxes with their fields, relations into labelled arrows', () => {
    const d = parse('requirementDiagram\n  requirement r1 {\n    id: 1\n    text: "Sign in"\n    risk: high\n    verifymethod: test\n  }\n  element e {\n    type: service\n  }\n  e - satisfies -> r1\n  r1 <- traces - e') as ClassDiagram
    expect(detect('requirementDiagram\n  element e {\n  }')).toBe('requirement')
    expect(d.classes.get('r1')).toMatchObject({ annotations: ['Requirement'] })
    expect(d.classes.get('r1')!.attributes.map((a) => a.text)).toEqual(['Id: 1', 'Text: Sign in', 'Risk: High', 'Verification: Test'])
    expect(d.relations.map((r) => [r.from, r.to, r.label, r.dashed])).toEqual([['e', 'r1', '«satisfies»', true], ['e', 'r1', '«traces»', true]])
  })
  it('refuses unknown risks, relations and undeclared names', () => {
    expect(error('requirementDiagram\n  requirement r {\n    risk: huge\n  }').message).toMatch(/not a risk/)
    expect(error('requirementDiagram\n  element a {\n  }\n  element b {\n  }\n  a - loves -> b').message).toMatch(/not a relationship/)
    expect(error('requirementDiagram\n  element a {\n  }\n  a - traces -> ghost').message).toMatch(/never declared/)
  })
})

describe('architecture-beta', () => {
  it('reads groups, services with icons, junctions and edges', () => {
    const c = parse('architecture-beta\n  group api(cloud)[API]\n  service db(database)[DB] in api\n  service s(server)[Server] in api\n  service q(aws:sqs)[Queue]\n  junction j in api\n  db:L -- R:s\n  s:R --> L:q\n  s{group}:L <-- R:j\n  s:B -[calls]- T:db') as Flowchart
    expect(detect('architecture-beta\n  service a(server)[A]')).toBe('architecture')
    expect(c.subgraphs.get('api')!.title).toBe('API')
    expect([c.nodes.get('db')!.shape, c.nodes.get('s')!.shape, c.nodes.get('q')!.shape, c.nodes.get('j')!.shape]).toEqual(['cylinder', 'node', 'rect', 'start'])
    expect(c.edges.map((e) => [e.from, e.to, e.start, e.end, e.text])).toEqual([
      ['db', 's', 'none', 'none', undefined],
      ['s', 'q', 'none', 'arrow', undefined],
      // s{group}: the edge starts at the group s is in.
      ['api', 'j', 'arrow', 'none', undefined],
      ['s', 'db', 'none', 'none', 'calls'],
    ])
  })
  it('refuses unknown names and groups declared later', () => {
    expect(error('architecture-beta\n  service a(server)[A] in nowhere').message).toMatch(/not a group/)
    expect(error('architecture-beta\n  service a(server)[A]\n  a:L -- R:b').message).toMatch(/not a service/)
  })
})

describe('sankey-beta', () => {
  it('reads CSV flows with quoting', () => {
    const d = parse('sankey-beta\n  A,B,10\n  "C, Ltd","He said ""hi""",2.5') as SankeyDiagram
    expect(d.links).toEqual([{ source: 'A', target: 'B', value: 10 }, { source: 'C, Ltd', target: 'He said "hi"', value: 2.5 }])
    expect(d.nodes).toEqual(['A', 'B', 'C, Ltd', 'He said "hi"'])
  })
  it('refuses bad rows and circular flows', () => {
    expect(error('sankey-beta\n  A,B').message).toMatch(/not a flow/)
    expect(error('sankey-beta\n  A,B,x').message).toMatch(/not a value/)
    expect(error('sankey-beta\n  A,B,1\n  B,A,1').message).toMatch(/circle/)
  })
  it('draws a band per flow', () => {
    const svg = render('sankey-beta\n  A,B,10\n  A,C,5\n  B,D,10', opts).svg
    expect(svg.match(/class="dg-sankey-link"/g)).toHaveLength(3)
  })
})

describe('gitGraph', () => {
  it('reads commits, branches, checkout, merges and cherry-picks', () => {
    const g = parse('gitGraph\n  commit id: "a"\n  branch dev\n  commit id: "b" tag: "v1" type: HIGHLIGHT\n  checkout main\n  commit\n  merge dev id: "m"\n  switch dev\n  commit id: "c"\n  checkout main\n  cherry-pick id: "c"') as GitGraph
    expect(g.branches.map((b) => [b.name, b.from])).toEqual([['main', undefined], ['dev', 'a']])
    const c = (id: string) => g.commits.find((x) => x.id === id)!
    expect(c('b')).toMatchObject({ branch: 'dev', parents: ['a'], type: 'highlight', tags: ['v1'] })
    expect(c('m')).toMatchObject({ branch: 'main', type: 'merge' })
    expect(c('m').parents).toHaveLength(2)
    expect(g.commits[g.commits.length - 1]).toMatchObject({ branch: 'main', type: 'cherry-pick', tags: ['cherry-pick: c'] })
  })
  it('reads the orientation and refuses impossible steps', () => {
    expect((parse('gitGraph TB:\n  commit') as GitGraph).direction).toBe('TB')
    expect(error('gitGraph\n  checkout nope').message).toMatch(/not a branch/)
    expect(error('gitGraph\n  commit\n  branch b\n  checkout main\n  merge b').message).toMatch(/nothing new/)
    expect(error('gitGraph\n  commit id: "x"\n  commit id: "x"').message).toMatch(/used twice/)
    expect(error('gitGraph\n  commit type: WEIRD').message).toMatch(/not a commit type/)
  })
})

describe('block-beta', () => {
  it('places blocks with columns, spans, spaces, shapes and nested groups', () => {
    const d = parse('block-beta\n  columns 3\n  a["A"]:2 b(("B"))\n  space:2 c[("C")]\n  block:g["Group"]:3\n    columns 2\n    d e\n  end\n  a --> b\n  b -- "x" --> c\n  c -.- g\n  style a fill:#ff0000') as BlockDiagram
    expect(d.columns).toBe(3)
    const [a, b, sp, c, g] = d.items
    expect(a).toMatchObject({ kind: 'block', id: 'a', label: 'A', span: 2, shape: 'rect' })
    expect(b).toMatchObject({ shape: 'circle', label: 'B' })
    expect(sp).toEqual({ kind: 'space', span: 2 })
    expect(c).toMatchObject({ shape: 'cylinder' })
    expect(g).toMatchObject({ kind: 'group', id: 'g', label: 'Group', span: 3, columns: 2 })
    expect(d.edges.map((e) => [e.from, e.to, e.text, e.stroke, e.arrow])).toEqual([
      ['a', 'b', undefined, 'normal', true],
      ['b', 'c', 'x', 'normal', true],
      ['c', 'g', undefined, 'dotted', false],
    ])
    expect((a as { style?: { shape: { fill?: string } } }).style!.shape.fill).toBe('#ff0000')
    expect(render('block-beta\n  a b\n  a --> b', opts).svg).toContain('marker-end')
  })
  it('refuses unknown blocks, duplicates and unclosed groups', () => {
    expect(error('block-beta\n  a\n  a --> z').message).toMatch(/not a block/)
    expect(error('block-beta\n  a a').message).toMatch(/twice/)
    expect(error('block-beta\n  block:g\n  a').message).toMatch(/never closed/)
  })
})

describe('the new types never turn labels into markup', () => {
  const p = '<script>alert(1)</script>'
  const sources = [
    `journey\n  title ${p}\n  section ${p}\n    ${p.replace(/:/g, '')}: 3: ${p}`,
    `quadrantChart\n  title ${p}\n  quadrant-1 ${p}\n  ${p}: [0.5, 0.5]`,
    `kanban\n  c[${p}]\n    a[${p}]@{ assigned: '${p}' }`,
    `requirementDiagram\n  element e {\n    type: ${p}\n  }`,
    `architecture-beta\n  service s(server)[${p}]`,
    `sankey-beta\n  "${p}",B,1`,
    `gitGraph\n  commit id: "${p}" tag: "${p}"`,
    `block-beta\n  a["${p}"]`,
  ]
  for (const src of sources) {
    it(src.split('\n')[0]!, () => {
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
