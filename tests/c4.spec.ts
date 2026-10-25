import { describe, expect, it } from 'vitest'
import { approximateMeasurer, detect, DiagramError, parse, render, THEME_VARIABLES } from '../src'
import type { C4Diagram } from '../src/diagrams/c4'

const opts = { measureText: approximateMeasurer }
const p = (src: string) => parse(src) as C4Diagram

function error(src: string): DiagramError {
  try {
    p(src)
  } catch (e) {
    expect(e).toBeInstanceOf(DiagramError)
    return e as DiagramError
  }
  throw new Error('expected a DiagramError')
}

describe('C4: header', () => {
  it('detects all five keywords', () => {
    for (const k of ['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment']) {
      expect(detect(`${k}\n  Person(a, "A")`)).toBe('c4')
      expect(p(`${k}\n  Person(a, "A")`).kind).toBe(k)
    }
  })

  it('reads the title and accessibility statements', () => {
    const d = p('C4Context\n  title System context\n  accTitle: Shop\n  Person(a, "A")')
    expect(d.title).toBe('System context')
    expect(d.accessibility.title).toBe('Shop')
  })
})

describe('C4: elements', () => {
  it('knows every element macro', () => {
    const levels = { Person: 'person', System: 'system', Container: 'container', Component: 'component' } as const
    const lines: string[] = []
    const expected: [string, string, string, boolean][] = []
    let n = 0
    for (const [prefix, level] of Object.entries(levels)) {
      const suffixes = prefix === 'Person' ? [''] : ['', 'Db', 'Queue']
      for (const suffix of suffixes) {
        for (const ext of ['', '_Ext']) {
          const id = `e${n++}`
          lines.push(`  ${prefix}${suffix}${ext}(${id}, "Label")`)
          const shape = prefix === 'Person' ? 'person' : suffix === 'Db' ? 'db' : suffix === 'Queue' ? 'queue' : 'box'
          expected.push([id, level, shape, ext !== ''])
        }
      }
    }
    const d = p(`C4Container\n${lines.join('\n')}`)
    expect(d.elements.size).toBe(20)
    for (const [id, level, shape, external] of expected) {
      expect(d.elements.get(id)).toMatchObject({ level, shape, external })
    }
  })

  it('binds positional and named arguments', () => {
    const d = p(`C4Container
      Container(api, "API", "Go", "Serves the shop", $sprite="go", $tags="v1", $link="https://example.com")
      Container(web, "Web", $descr="The storefront", $techn="Next.js")
      System(s, "Shop", "Sells", $type="Product")
      Person(u, Customer)`)
    expect(d.elements.get('api')).toMatchObject({ label: 'API', techn: 'Go', description: 'Serves the shop' })
    expect(d.elements.get('web')).toMatchObject({ techn: 'Next.js', description: 'The storefront' })
    expect(d.elements.get('s')).toMatchObject({ type: 'Product', description: 'Sells' })
    expect(d.elements.get('u')!.label).toBe('Customer')
  })

  it('keeps commas and parentheses inside quotes, and reads \\n as a line break', () => {
    const d = p('C4Context\n  System(s, "Shop (EU), main", "line one\\nline two")')
    expect(d.elements.get('s')).toMatchObject({ label: 'Shop (EU), main', description: 'line one<br>line two' })
  })
})

describe('C4: boundaries', () => {
  it('nests boundaries and deployment nodes', () => {
    const d = p(`C4Deployment
      Deployment_Node(dc, "Data centre", "Hetzner") {
        Node(vm, "VM", "Ubuntu", "8 vCPU") {
          Node_L(php, "PHP-FPM") {
            Container(api, "API", "Laravel")
          }
        }
        Node_R(db, "DB host")
        {
          ContainerDb(pg, "Postgres")
        }
      }
      Enterprise_Boundary(e, "Corp") {
        System_Boundary(s, "Shop") {
          Container_Boundary(c, "API app") {
            Component(x, "X")
          }
        }
        Boundary(b, "Team", "squad") {}
      }`)
    expect(d.boundaries.get('vm')).toMatchObject({ kind: 'node', parent: 'dc', type: 'Ubuntu', description: '8 vCPU' })
    expect(d.elements.get('api')!.parent).toBe('php')
    expect(d.elements.get('pg')!.parent).toBe('db')
    expect(d.boundaries.get('c')).toMatchObject({ kind: 'container', parent: 's' })
    expect(d.boundaries.get('s')).toMatchObject({ kind: 'system', parent: 'e' })
    expect(d.boundaries.get('b')).toMatchObject({ kind: 'boundary', type: 'squad' })
    expect(d.children.get('')).toEqual(['dc', 'e'])
    expect(d.children.get('e')).toEqual(['s', 'b'])
  })
})

describe('C4: relations', () => {
  it('reads every relation macro', () => {
    const d = p(`C4Context
      Person(a, "A")
      System(b, "B")
      Rel(a, b, "uses", "HTTPS", "daily")
      BiRel(a, b, "talks")
      Rel_U(a, b, "up")
      Rel_Up(a, b, "up")
      Rel_D(a, b, "down")
      Rel_Down(a, b, "down")
      Rel_L(a, b, "left")
      Rel_Left(a, b, "left")
      Rel_R(a, b, "right")
      Rel_Right(a, b, "right")
      Rel_Back(a, b, "back")
      BiRel_R(a, b, "both")
      Lay_D(a, b)`)
    const r = d.relations
    expect(r[0]).toMatchObject({ from: 'a', to: 'b', label: 'uses', techn: 'HTTPS', description: 'daily', arrows: 'end', hidden: false })
    expect(r[0]!.direction).toBeUndefined()
    expect(r[1]!.arrows).toBe('both')
    expect(r.slice(2, 10).map((x) => x.direction)).toEqual(['up', 'up', 'down', 'down', 'left', 'left', 'right', 'right'])
    expect(r[10]!.arrows).toBe('start')
    expect(r[11]).toMatchObject({ arrows: 'both', direction: 'right' })
    expect(r[12]).toMatchObject({ hidden: true, direction: 'down' })
  })

  it('numbers relations in C4Dynamic and honours RelIndex', () => {
    const d = p(`C4Dynamic
      Container(a, "A")
      Container(b, "B")
      Rel(a, b, "first")
      Rel(b, a, "second")
      RelIndex(7, a, b, "seventh")
      Rel(a, b, "eighth")
      RelIndex(Index(), a, b, "ninth")
      RelIndex("2a", a, b, "branch")
      Lay_R(a, b)`)
    expect(d.relations.map((r) => r.index)).toEqual(['1', '2', '7', '8', '9', '2a', undefined])
    // Outside C4Dynamic only RelIndex carries a number.
    const c = p('C4Container\n  Container(a, "A")\n  Container(b, "B")\n  Rel(a, b, "x")\n  RelIndex(3, a, b, "y")')
    expect(c.relations.map((r) => r.index)).toEqual([undefined, '3'])
  })

  it('may refer to elements declared later and to boundaries', () => {
    const d = p('C4Container\n  Rel(a, s, "uses")\n  Person(a, "A")\n  System_Boundary(s, "S") {\n    Container(c, "C")\n  }')
    expect(d.relations[0]).toMatchObject({ from: 'a', to: 's' })
  })
})

describe('C4: styles and layout config', () => {
  it('applies validated colours and ignores what only PlantUML draws', () => {
    const d = p(`C4Context
      Person(a, "A")
      System(b, "B")
      Boundary(x, "X") {
        System(c, "C")
      }
      Rel(a, b, "uses")
      UpdateElementStyle(a, $bgColor="grey", $fontColor="#ff0000", $borderColor="rgb(1,2,3)", $shadowing="true", $shape="EightSidedShape()")
      UpdateBoundaryStyle(x, $borderColor="red")
      UpdateRelStyle(a, b, $textColor="blue", $lineColor="#00f", $offsetX="5", $offsetY="-10")
      UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")`)
    expect(d.elements.get('a')!.style).toEqual({ fill: 'grey', text: '#ff0000', stroke: 'rgb(1,2,3)' })
    expect(d.boundaries.get('x')!.style).toEqual({ stroke: 'red' })
    expect(d.relations[0]!.style).toEqual({ text: 'blue', line: '#00f' })
    expect(d.shapeInRow).toBe(3)
    expect(d.boundaryInRow).toBe(1)
  })

  it('switches to a left-to-right flow', () => {
    expect(p('C4Context\n  LAYOUT_LEFT_RIGHT()\n  Person(a, "A")').direction).toBe('LR')
    expect(p('C4Context\n  LAYOUT_LEFT_RIGHT()\n  LAYOUT_TOP_DOWN()\n  Person(a, "A")').direction).toBe('TB')
  })
})

describe('C4: errors carry positions', () => {
  it('reports unknown macros, with a hint for C4-PlantUML ones', () => {
    let e = error('C4Context\n  Person(a, "A")\n  Persn(b, "B")')
    expect([e.line, e.column]).toEqual([3, 3])
    expect(e.message).toMatch(/not a C4 macro/)
    e = error('C4Context\n  Person(a, "A")\n  SHOW_LEGEND()')
    expect(e.line).toBe(3)
    expect(e.message).toMatch(/not supported/)
    expect(e.hint).toBeDefined()
  })

  it('reports unknown parameters at the argument', () => {
    const e = error('C4Context\n  Person(a, "A", $colour="red")')
    expect([e.line, e.column]).toEqual([2, 18])
    expect(e.hint).toMatch(/\$descr/)
  })

  it('reports unclosed strings, calls and boundaries', () => {
    expect(error('C4Context\n  Person(a, "A)').message).toMatch(/string is not closed/)
    expect(error('C4Context\n  Person(a, "A"').message).toMatch(/not closed/)
    expect(error('C4Context\n  Boundary(b, "B") {\n  Person(a, "A")').message).toMatch(/not closed/)
    expect(error('C4Context\n  }').line).toBe(2)
    expect(error('C4Context\n  Boundary(b, "B")\n  Person(a, "A")').message).toMatch(/needs a body/)
    expect(error('C4Context\n  Person(a, "A") {\n  }').message).toMatch(/cannot have a body/)
  })

  it('reports bad references and duplicates', () => {
    let e = error('C4Context\n  Person(a, "A")\n  Rel(a, nobody, "uses")')
    expect(e.line).toBe(3)
    expect(e.message).toMatch(/unknown element "nobody"/)
    e = error('C4Context\n  Person(a, "A")\n  System(a, "B")')
    expect([e.line, e.column]).toEqual([3, 10])
    expect(error('C4Context\n  Boundary(b, "B") {\n    Person(a, "A")\n  }\n  Rel(a, b, "x")').message).toMatch(/inside the other/)
    expect(error('C4Context\n  Person(a, "A")\n  UpdateElementStyle(z, $bgColor="red")').line).toBe(3)
    expect(error('C4Context\n  Person(a, "A")\n  UpdateRelStyle(a, a, $lineColor="red")').message).toMatch(/no relation/)
  })

  it('rejects colours and numbers that do not validate', () => {
    const e = error('C4Context\n  Person(a, "A")\n  UpdateElementStyle(a, $bgColor="url(https://example.com/x)")')
    expect(e.line).toBe(3)
    expect(e.message).toMatch(/not a colour/)
    expect(error('C4Context\n  UpdateLayoutConfig($c4ShapeInRow="0")').message).toMatch(/1 to 50/)
  })

  it('needs a label and an alias', () => {
    expect(error('C4Context\n  Person(a)').message).toMatch(/needs a label/)
    expect(error('C4Context\n  Person("", "A")').message).toMatch(/alias/)
    expect(error('C4Context\n  Person(a b, "A")').message).toMatch(/not a valid alias/)
  })
})

describe('C4: rendering', () => {
  const source = `C4Container
    title Shop
    Person(u, "Customer", "Buys things")
    System_Boundary(s, "Shop") {
      Container(web, "Web", "Next.js", "Storefront")
      ContainerDb(db, "DB", "Postgres")
      ContainerQueue(q, "Queue", "Kafka")
    }
    System_Ext(psp, "Payments")
    Rel(u, web, "Uses", "HTTPS")
    Rel_R(web, q, "Publishes")
    Rel(web, db, "Reads")
    BiRel(web, psp, "Charges", "REST")
    Rel_Back(db, q, "Feeds")
    Lay_D(psp, db)`

  it('draws every element, boundary and visible relation', () => {
    const { svg, type } = render(source, opts)
    expect(type).toBe('c4')
    expect(svg.match(/class="dg-node dg-c4-element/g)).toHaveLength(5)
    expect(svg).toContain('dg-c4-person')
    expect(svg).toContain('dg-c4-db')
    expect(svg).toContain('dg-c4-queue')
    expect(svg).toContain('dg-c4-external')
    expect(svg.match(/class="dg-cluster dg-c4-boundary"/g)).toHaveLength(1)
    // Lay_D is a hint only: five drawn relations.
    expect(svg.match(/class="dg-edge dg-c4-rel"/g)).toHaveLength(5)
    expect(svg).toContain('[Container: Next.js]')
    expect(svg).toContain('[Software System]')
    expect(svg).toContain('[HTTPS]')
    expect(svg).toContain('>Shop<')
  })

  it('puts arrowheads where the macro says', () => {
    const { svg } = render(source, opts)
    const path = (from: string, to: string) => new RegExp(`<path[^>]*data-from="${from}" data-to="${to}"[^>]*>`).exec(svg)![0]
    expect(path('u', 'web')).toContain('marker-end')
    expect(path('u', 'web')).not.toContain('marker-start')
    expect(path('web', 'psp')).toMatch(/marker-start.*marker-end/)
    expect(path('db', 'q')).toContain('marker-start')
    expect(path('db', 'q')).not.toContain('marker-end')
  })

  it('places Rel_R / Rel_D / Rel_U as asked', () => {
    const { svg } = render(
      `C4Container
        Container(a, "A")
        Container(b, "B")
        Container(c, "C")
        Container(d, "D")
        Rel_R(a, b, "right")
        Rel_D(a, c, "down")
        Rel_U(a, d, "up")`,
      opts,
    )
    const centre = (id: string) => {
      const g = new RegExp(`data-id="${id}"[^>]*><rect class="dg-shape" x="([\\d.-]+)" y="([\\d.-]+)" width="([\\d.]+)" height="([\\d.]+)"`).exec(svg)!
      return { x: +g[1]! + +g[3]! / 2, y: +g[2]! + +g[4]! / 2 }
    }
    const a = centre('a')
    expect(centre('b').x).toBeGreaterThan(a.x)
    expect(centre('b').y).toBeCloseTo(a.y, 0)
    expect(centre('c').y).toBeGreaterThan(a.y)
    expect(centre('d').y).toBeLessThan(a.y)
  })

  it('wraps unconnected shapes into rows of c4ShapeInRow', () => {
    const shapes = Array.from({ length: 6 }, (_, i) => `  System(s${i}, "S${i}")`).join('\n')
    const rows = (src: string) => {
      const ys = new Set([...render(src, opts).svg.matchAll(/data-id="s\d"[^>]*><rect class="dg-shape" x="[\d.-]+" y="([\d.-]+)"/g)].map((m) => m[1]))
      return ys.size
    }
    expect(rows(`C4Context\n${shapes}`)).toBe(2)
    expect(rows(`C4Context\n  UpdateLayoutConfig($c4ShapeInRow="2")\n${shapes}`)).toBe(3)
  })

  it('numbers relations of a dynamic diagram', () => {
    const { svg } = render('C4Dynamic\n  Container(a, "A")\n  Container(b, "B")\n  Rel(a, b, "go")\n  Rel(b, a, "back")', opts)
    expect(svg.match(/class="dg-c4-index"/g)).toHaveLength(2)
    expect(svg).toMatch(/dg-c4-index-text[^>]*>(<tspan[^>]*>)?1</)
  })

  it('uses inline styles only for validated colours, and coloured markers', () => {
    const { svg } = render(
      'C4Context\n  Person(a, "A")\n  System(b, "B")\n  Rel(a, b, "x")\n  UpdateElementStyle(a, $bgColor="#123456")\n  UpdateRelStyle(a, b, $lineColor="red")',
      opts,
    )
    expect(svg).toContain('style="fill:#123456"')
    expect(svg).toContain('style="stroke:red"')
    expect(svg).toMatch(/<marker id="[^"]*-m-c4-0"/)
  })

  it('prefixes every id', () => {
    const { svg } = render(source, { ...opts, idPrefix: 'mine' })
    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!)
    expect(ids.length).toBeGreaterThan(3)
    for (const id of ids) expect(id.startsWith('mine')).toBe(true)
    for (const ref of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(ref[1])
  })

  it('escapes every label', () => {
    const evil = '<script>alert(1)</script>'
    const { svg } = render(
      `C4Context\n  title ${evil}\n  Person(a, "${evil}", "${evil}")\n  Boundary(b, "${evil}", "${evil}") {\n    System(s, "x", "${evil}")\n  }\n  Rel(a, s, "${evil}", "${evil}", "${evil}")`,
      opts,
    )
    expect(svg).not.toContain('<script')
    expect(svg).toContain('&lt;script&gt;')
    expect(svg.match(/<svg/g)).toHaveLength(1)
  })

  it('documents its colours as theme variables', () => {
    for (const k of ['person', 'system', 'container', 'component', 'external']) {
      for (const part of ['fill', 'stroke', 'text']) expect(THEME_VARIABLES[`--dg-c4-${k}-${part}`]).toBeDefined()
    }
    expect(THEME_VARIABLES['--dg-c4-boundary-stroke']).toBeDefined()
  })

  it('is deterministic', () => {
    expect(render(source, opts).svg).toBe(render(source, opts).svg)
  })
})
