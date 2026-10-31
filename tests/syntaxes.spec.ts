import { describe, expect, it } from 'vitest'
import { approximateMeasurer, detect, detectSyntax, DiagramError, parse, render } from '../src'
import type { C4Diagram } from '../src/diagrams/c4/parser'
import type { ErDiagram } from '../src/diagrams/er/parser'
import type { Flowchart } from '../src/diagrams/flowchart/parser'
import type { WardleyMap } from '../src/diagrams/wardley'

const opts = { measureText: approximateMeasurer }
const error = (source: string, syntax?: Parameters<typeof render>[1] extends infer O ? (O extends { syntax?: infer S } ? S : never) : never): DiagramError => {
  try {
    render(source, { ...opts, syntax })
  } catch (e) {
    return e as DiagramError
  }
  throw new Error('rendered')
}

describe('detecting the syntax', () => {
  it('tells each syntax by how it starts', () => {
    expect(detectSyntax('digraph G { a -> b }')).toBe('dot')
    expect(detectSyntax('// a comment\ngraph { a -- b }')).toBe('dot')
    expect(detectSyntax('graph TD\n  A --> B')).toBe('mermaid')
    expect(detectSyntax('Table users {\n  id int\n}')).toBe('dbml')
    expect(detectSyntax('workspace {\n}')).toBe('structurizr')
    expect(detectSyntax('title Map\ncomponent A [0.5, 0.5]')).toBe('wardley')
    expect(detectSyntax('a -> b: hello')).toBe('d2')
    expect(detectSyntax('direction: right\nx')).toBe('d2')
    expect(detectSyntax('sequenceDiagram\n  A->>B: hi')).toBe('mermaid')
    expect(detectSyntax('@startuml\nA -> B\n@enduml')).toBe('plantuml')
  })
  it('reports the model each is drawn with', () => {
    expect(detect('digraph { a -> b }')).toBe('flowchart')
    expect(detect('x -> y')).toBe('flowchart')
    expect(detect('Table t {\n  id int\n}')).toBe('er')
    expect(detect('workspace {\n  model {\n    a = person "A"\n  }\n}')).toBe('c4')
    expect(detect('component A [0.5, 0.5]')).toBe('wardley')
  })
})

describe('DBML', () => {
  const er = (s: string) => parse(s) as ErDiagram
  it('reads tables, columns with settings, aliases, refs in every form and enums', () => {
    const d = er("Table users as U {\n  id int [pk, increment]\n  email varchar [unique, not null, note: 'login']\n}\nTable posts {\n  id int [pk]\n  user_id int [ref: > U.id]\n  editor_id int\n}\nRef: posts.editor_id > users.id\nRef named {\n  posts.id - users.id\n}\nEnum status {\n  draft\n  live [note: 'public']\n}\nProject p {\n  database_type: 'PostgreSQL'\n}")
    expect(d.entities.get('users')!.attributes).toEqual([
      { type: 'int', name: 'id', keys: ['PK'], comment: 'increment' },
      { type: 'varchar', name: 'email', keys: ['UK'], comment: 'not null, login' },
    ])
    expect(d.entities.get('posts')!.attributes.find((a) => a.name === 'editor_id')!.keys).toEqual(['FK'])
    expect(d.relationships.map((r) => [r.from, r.to, r.fromCardinality, r.toCardinality, r.label])).toEqual([
      ['posts', 'users', 'zero-many', 'one', 'user_id → id'],
      ['posts', 'users', 'zero-many', 'one', 'editor_id → id'],
      ['posts', 'users', 'one', 'one', 'id → id'],
    ])
    expect(d.entities.get('status')!.attributes.map((a) => a.name)).toEqual(['draft', 'live'])
  })
  it('refuses unknown tables and statements', () => {
    expect(error('Table a {\n  id int\n}\nRef: a.id > b.id').message).toMatch(/not a table/)
    expect(error('Table a {\n  id int\n}\nWhatever x').message).toMatch(/not a DBML statement/)
  })
})

describe('DOT', () => {
  const dot = (s: string) => parse(s) as Flowchart
  it('reads nodes, edge chains, defaults, clusters, shapes and styles', () => {
    const c = dot('digraph G {\n  rankdir=LR; label="Title"\n  node [shape=box]\n  subgraph cluster_x { label="X"; a; b }\n  a -> b -> c [label="go", color=red]\n  c [shape=cylinder, style=filled, fillcolor="#ffcc00"]\n  c -> d [style=dashed, dir=both, arrowtail=diamond]\n  e -> {f g}\n}')
    expect(c.direction).toBe('LR')
    expect(c.title).toBe('Title')
    expect(c.subgraphs.get('cluster_x')!.title).toBe('X')
    expect(c.nodes.get('a')!.subgraph).toBe('cluster_x')
    expect(c.nodes.get('a')!.shape).toBe('rect')
    expect(c.nodes.get('c')!.shape).toBe('cylinder')
    expect(c.nodes.get('c')!.style!.shape.fill).toBe('#ffcc00')
    expect(c.edges.slice(0, 2).map((e) => [e.from, e.to, e.text])).toEqual([['a', 'b', 'go'], ['b', 'c', 'go']])
    expect(c.edges[2]).toMatchObject({ from: 'c', to: 'd', stroke: 'dotted', start: 'diamond', end: 'arrow' })
    expect(c.edges.slice(3).map((e) => e.to)).toEqual(['f', 'g'])
  })
  it('reads undirected graphs, records, HTML labels and ports', () => {
    const c = dot('graph {\n  r [shape=record, label="{a|b|c}"]\n  h [label=<<b>bold</b> text>]\n  r:p1 -- h\n}')
    expect(c.nodes.get('r')!.text).toBe('a<br>b<br>c')
    expect(c.nodes.get('h')!.text).toBe('bold text')
    expect(c.edges[0]).toMatchObject({ from: 'r', to: 'h', end: 'none' })
  })
  it('explains mistakes', () => {
    expect(error('digraph { a -- b }').message).toMatch(/links with "->"/)
    expect(error('digraph { a -> b ').message).toMatch(/expected/)
  })
})

describe('D2', () => {
  const d2 = (s: string) => parse(s, { syntax: 'd2' }) as Flowchart
  it('reads shapes, labels, containers, dotted paths, edges and attributes', () => {
    const c = d2('direction: right\nu: Users { shape: person }\ncloud: AWS {\n  api: API\n  db: DB { shape: cylinder; style.fill: "#fde68a" }\n  api -> db: SQL\n}\nu -> cloud.api <- x: calls\ncloud.db.style.stroke: red\ny.shape: oval')
    expect(c.direction).toBe('LR')
    expect(c.nodes.get('u')).toMatchObject({ text: 'Users', shape: 'actor' })
    expect(c.subgraphs.get('cloud')!.title).toBe('AWS')
    const db = c.nodes.get('cloud›db')!
    expect(db).toMatchObject({ text: 'DB', shape: 'cylinder', subgraph: 'cloud' })
    expect(db.style!.shape).toMatchObject({ fill: '#fde68a', stroke: 'red' })
    expect(c.edges.map((e) => [e.from, e.to, e.text])).toEqual([
      ['cloud›api', 'cloud›db', 'SQL'],
      ['u', 'cloud›api', undefined],
      ['x', 'cloud›api', 'calls'],
    ])
    expect(c.nodes.get('y')!.shape).toBe('usecase')
  })
  it('reads block strings, comments, ; and edge attribute blocks', () => {
    const c = d2('# a comment\na: |md\n  # Title\n  text\n|; b\na -> b: x {\n  style.stroke-dash: 3\n  target-arrowhead.shape: diamond\n}')
    expect(c.nodes.get('a')!.text).toBe('Title<br>text')
    expect(c.edges[0]).toMatchObject({ stroke: 'dotted', end: 'diamond-open' })
  })
  it('refuses imports, unknown shapes and edge references', () => {
    expect(error('x: @file', 'd2').message).toMatch(/not supported/)
    expect(error('x.shape: blob', 'd2').message).toMatch(/not a D2 shape/)
    expect(error('(a -> b)[0].style.stroke: red', 'd2').message).toMatch(/not supported/)
  })
})

describe('Structurizr DSL', () => {
  const src = 'workspace "Shop" {\n  !identifiers flat\n  model {\n    u = person "Customer"\n    s = softwareSystem "Shop" {\n      web = container "Web" "Store" "React"\n      api = container "API" {\n        ctl = component "Orders" "" "Kotlin"\n        -> db "Reads"\n      }\n      db = container "DB" "" "PostgreSQL" "Database"\n    }\n    p = softwareSystem "Payments" {\n      tags "External"\n    }\n    u -> web "Uses" "HTTPS"\n    web -> ctl "Calls"\n    ctl -> p "Charges"\n  }\n  views {\n    VIEW\n    theme default\n  }\n}'
  const c4 = (view: string) => parse(src.replace('VIEW', view)) as C4Diagram

  it('draws a container view: the system as a boundary, relationships lifted to containers', () => {
    const d = c4('container s {\n      include *\n      autolayout lr\n    }')
    expect(d.kind).toBe('C4Container')
    expect(d.direction).toBe('LR')
    expect(d.boundaries.get('s')).toMatchObject({ kind: 'system', label: 'Shop' })
    expect([...d.elements.keys()].sort()).toEqual(['api', 'db', 'p', 'u', 'web'])
    expect(d.elements.get('db')!.shape).toBe('db')
    expect(d.elements.get('p')!.external).toBe(true)
    expect(d.relations.map((r) => `${r.from}→${r.to}`).sort()).toEqual(['api→db', 'api→p', 'u→web', 'web→api'])
  })
  it('lays the view out along its relationships under autolayout', () => {
    expect(c4('container s {\n      include *\n      autolayout lr\n    }').relations.every((r) => r.direction === 'right')).toBe(true)
    expect(c4('container s {\n      include *\n      autolayout\n    }').relations.every((r) => r.direction === 'down')).toBe(true)
    expect(c4('container s {\n      include *\n    }').relations.every((r) => r.direction === undefined)).toBe(true)
  })
  it('draws a context view with systems only, and a component view inside the container', () => {
    expect(c4('systemContext s {\n      include *\n    }').relations.map((r) => `${r.from}→${r.to}`).sort()).toEqual(['s→p', 'u→s'])
    const d = c4('component api {\n      include *\n    }')
    expect(d.kind).toBe('C4Component')
    expect(d.boundaries.get('api')).toMatchObject({ kind: 'container', parent: 's' })
    expect(d.elements.get('ctl')!.parent).toBe('api')
  })
  it('refuses unknown references and includes', () => {
    expect(error('workspace {\n  model {\n    a = person "A"\n    a -> z\n  }\n}').message).toMatch(/not an element/)
    expect(error('workspace {\n  !include other.dsl\n}').message).toMatch(/not supported/)
  })
})

describe('Wardley maps', () => {
  it('reads components, anchors, links, evolve, inertia, methods, pipelines, notes and annotations', () => {
    const d = parse('title Tea\nanchor Business [0.95, 0.63]\ncomponent Cup of tea [0.79, 0.61] label [5, -10]\ncomponent Kettle [0.43, 0.35] (inertia)\ncomponent Power [0.1, 0.7] (outsource)\nevolve Kettle 0.62\npipeline Kettle [0.3, 0.7]\nBusiness->Cup of tea\nCup of tea->Kettle; heats\nKettle+>Power\nnote Hello [0.3, 0.5]\nannotation 1 [[0.4, 0.5], [0.1, 0.8]] First\nevolution Uncharted->Emerging->Good->Best') as WardleyMap
    expect(d.title).toBe('Tea')
    expect(d.components.get('Business')!.kind).toBe('anchor')
    expect(d.components.get('Cup of tea')!.label).toEqual([5, -10])
    expect(d.components.get('Kettle')).toMatchObject({ inertia: true, evolve: { to: 0.62 }, pipeline: [0.3, 0.7] })
    expect(d.components.get('Power')!.method).toBe('outsource')
    expect(d.links).toEqual([
      { from: 'Business', to: 'Cup of tea', flow: false, label: undefined },
      { from: 'Cup of tea', to: 'Kettle', flow: false, label: 'heats' },
      { from: 'Kettle', to: 'Power', flow: true, label: undefined },
    ])
    expect(d.notes[0]).toEqual({ text: 'Hello', visibility: 0.3, evolution: 0.5 })
    expect(d.annotations[0]!.points).toHaveLength(2)
    expect(d.stages).toEqual(['Uncharted', 'Emerging', 'Good', 'Best'])
  })
  it('turns a label left of its component near the right edge, so it is not cut off', () => {
    const svg = render('component Far right component [0.5, 0.97]\ncomponent Middle [0.5, 0.5]', opts).svg
    expect(svg).toMatch(/<text[^>]*text-anchor="end"[^>]*><tspan[^>]*>Far right component</)
    expect(svg).not.toMatch(/<text[^>]*text-anchor="end"[^>]*><tspan[^>]*>Middle</)
  })
  it('refuses coordinates out of range and unknown components', () => {
    expect(error('component A [1.4, 0.5]').message).toMatch(/between 0 and 1/)
    expect(error('component A [0.5, 0.5]\nA->B').message).toMatch(/not a component/)
    expect(error('component A [0.5, 0.5]\nevolve B 0.8').message).toMatch(/not a component/)
  })
})

describe('labels never become markup in the other syntaxes', () => {
  const p = '<script>alert(1)</script>'
  const sources: [string, Parameters<typeof render>[1]?][] = [
    [`Table "${p}" {\n  "${p}" int [note: '${p}']\n}`],
    [`digraph { a [label="${p}"]; a -> b [label="${p}"] }`],
    [`a: "${p}"\na -> b: "${p}"`, { syntax: 'd2' }],
    [`workspace {\n  model {\n    a = person "${p}"\n  }\n}`],
    [`title ${p}\ncomponent ${p} [0.5, 0.5]`],
  ]
  for (const [src, o] of sources) {
    it(src.split('\n')[0]!, () => {
      let svg: string
      try {
        svg = render(src, { ...opts, ...o }).svg
      } catch {
        return
      }
      expect(svg).not.toMatch(/<script/i)
      expect(svg.match(/<svg/g)).toHaveLength(1)
    })
  }
})
