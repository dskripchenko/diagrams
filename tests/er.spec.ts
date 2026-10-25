import { describe, expect, it } from 'vitest'
import { approximateMeasurer, DiagramError, detect, parse, render } from '../src'
import type { ErDiagram } from '../src/diagrams/er'

const opts = { measureText: approximateMeasurer }
const p = (src: string) => parse(src) as ErDiagram

function error(src: string): DiagramError {
  try {
    p(src)
  } catch (e) {
    expect(e).toBeInstanceOf(DiagramError)
    return e as DiagramError
  }
  throw new Error('expected a DiagramError')
}

describe('ER parser', () => {
  it('is detected by its keyword', () => {
    expect(detect('erDiagram\n  A ||--o{ B : x')).toBe('er')
  })

  it('reads every cardinality on both sides, and both line kinds', () => {
    const d = p(`erDiagram
      A ||--|| B : one
      A |o--o| B : zero-one
      A }|--|{ B : one-many
      A }o--o{ B : zero-many
      A ||..o{ B : dashed
      A |o.-|{ B : mixed
      A }o-.|| B : mixed2`)
    expect(d.relationships.map((r) => [r.fromCardinality, r.toCardinality, r.identifying])).toEqual([
      ['one', 'one', true],
      ['zero-one', 'zero-one', true],
      ['one-many', 'one-many', true],
      ['zero-many', 'zero-many', true],
      ['one', 'zero-many', false],
      ['zero-one', 'one-many', false],
      ['zero-many', 'one', false],
    ])
  })

  it('reads the word forms of cardinalities', () => {
    const d = p(`erDiagram
      CAR 1 to zero or more NAMED-DRIVER : allows
      A only one optionally to one or many B : x
      A zero or one to many(0) B : y
      A one or zero to 1+ B : z
      A many(1) to 0+ B : w
      A one or more to zero or many B : v`)
    expect(d.relationships.map((r) => [r.fromCardinality, r.toCardinality, r.identifying])).toEqual([
      ['one', 'zero-many', true],
      ['one', 'one-many', false],
      ['zero-one', 'zero-many', true],
      ['zero-one', 'one-many', true],
      ['one-many', 'zero-many', true],
      ['one-many', 'zero-many', true],
    ])
    expect(d.entities.has('NAMED-DRIVER')).toBe(true)
  })

  it('reads labels quoted, bare and absent', () => {
    const d = p('erDiagram\n  A ||--o{ B : "places an order"\n  A ||--o{ C : places\n  A ||--o{ D\n  A ||--o{ E : ""')
    expect(d.relationships.map((r) => r.label)).toEqual(['places an order', 'places', '', ''])
  })

  it('reads attribute blocks with keys and comments', () => {
    const d = p(`erDiagram
      %% comment line
      CUSTOMER {
        string id PK "the key" %% trailing comment
        string email UK
        int orderNumber PK, FK
        decimal(10,2) total
        string[] tags
        int *legacy FK,UK "both"
      }
      EMPTY {}
      ALSO-EMPTY { }`)
    const c = d.entities.get('CUSTOMER')!
    expect(c.attributes).toEqual([
      { type: 'string', name: 'id', keys: ['PK'], comment: 'the key' },
      { type: 'string', name: 'email', keys: ['UK'], comment: undefined },
      { type: 'int', name: 'orderNumber', keys: ['PK', 'FK'], comment: undefined },
      { type: 'decimal(10,2)', name: 'total', keys: [], comment: undefined },
      { type: 'string[]', name: 'tags', keys: [], comment: undefined },
      { type: 'int', name: '*legacy', keys: ['FK', 'UK'], comment: 'both' },
    ])
    expect(d.entities.get('EMPTY')!.attributes).toEqual([])
    expect(d.entities.get('ALSO-EMPTY')!.attributes).toEqual([])
  })

  it('reads aliases, quoted names, bare entities and direction', () => {
    const d = p(`erDiagram
      direction LR
      p["Person"] {
        string name
      }
      c[Customer]
      "Order line" ||--|| p : x
      LONELY`)
    expect(d.direction).toBe('LR')
    expect(d.entities.get('p')!.label).toBe('Person')
    expect(d.entities.get('c')!.label).toBe('Customer')
    expect(d.entities.get('Order line')!.label).toBe('Order line')
    expect(d.entities.has('LONELY')).toBe(true)
  })

  it('reads classDef, class, style and :::', () => {
    const d = p(`erDiagram
      A:::warn {
        int id
      }
      A ||--|| B : x
      classDef warn fill:#fee,stroke:#f00
      class B warn
      style A stroke-width:3px`)
    expect(d.entities.get('A')!.classes).toEqual(['warn'])
    expect(d.entities.get('B')!.classes).toEqual(['warn'])
    expect(d.entities.get('A')!.style!.shape).toEqual({ 'stroke-width': '3px' })
  })

  it('reports errors with line, column and hint', () => {
    let e = error('erDiagram\n  A ||--o| B : x\n  A }}--|| B : y')
    expect(e.line).toBe(3)
    expect(e.column).toBe(5)
    expect(e.hint).toMatch(/cardinality/)

    e = error('erDiagram\n  A {\n    string name\n')
    expect(e.message).toMatch(/not closed/)
    expect(e.line).toBe(2)

    e = error('erDiagram\n  A {\n    string name XX\n  }')
    expect([e.line, e.column]).toEqual([3, 17])
    expect(e.hint).toMatch(/PK, FK, UK/)

    e = error('erDiagram\n  A {\n    name\n  }')
    expect(e.line).toBe(3)
    expect(e.hint).toMatch(/type and a name/)

    expect(error('erDiagram\n  }').message).toMatch(/without an open entity/)
    expect(error('erDiagram\n  direction XY').message).toMatch(/not a direction/)
    expect(error('erDiagram\n  A ||--|| B\n  class C warn').message).toMatch(/unknown entity "C"/)
    expect(error('erDiagram\n  A -> B').line).toBe(2)
  })
})

describe('ER rendering', () => {
  it('draws entities as tables with prefixed crow-foot markers', () => {
    const { svg, type } = render('erDiagram\n  A ||--o{ B : has\n  B }|..o| C\n  A {\n    int id PK\n    string name "c"\n  }', {
      ...opts,
      idPrefix: 'er1',
    })
    expect(type).toBe('er')
    expect(svg).toContain('class="dg-node dg-entity" data-id="A"')
    expect(svg).toContain('dg-entity-header')
    expect(svg).toContain('dg-entity-keys')
    expect(svg).toContain('dg-entity-comment')
    expect(svg).toContain('marker-start="url(#er1-m-er-one-start)"')
    expect(svg).toContain('marker-end="url(#er1-m-er-zero-many)"')
    expect(svg).toContain('marker-start="url(#er1-m-er-one-many-start)"')
    expect(svg).toContain('marker-end="url(#er1-m-er-zero-one)"')
    expect(svg).toContain('id="er1-m-er-zero-many"')
    expect(svg).toContain('class="dg-edge dg-edge-dashed"')
    // Every id in the document carries the prefix.
    for (const [, value] of svg.matchAll(/ id="([^"]+)"/g)) expect(value!.startsWith('er1')).toBe(true)
  })

  it('draws self relationships as loops beside the entity', () => {
    const { svg } = render('erDiagram\n  E ||--o{ E : manages', opts)
    expect(svg).toContain('data-from="E" data-to="E"')
    expect(svg).toContain('>manages<')
  })

  it('never turns text into markup', () => {
    const payload = '<script>alert(1)</script>'
    const { svg } = render(
      `erDiagram\n  a["${payload}"] {\n    string name "${payload}"\n  }\n  a ||--|| b : "${payload}"`,
      opts,
    )
    expect(svg).not.toMatch(/<script/i)
    expect(svg).toContain('&lt;script&gt;')
    expect(svg.match(/<svg/g)).toHaveLength(1)
  })

  it('lays out 500 entities quickly', () => {
    let s = 1
    const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    const lines = ['erDiagram']
    for (let i = 0; i < 700; i++) lines.push(`  E${i % 500} ||--o{ E${Math.floor(r() * 500)} : r${i}`)
    const start = performance.now()
    render(lines.join('\n'), opts)
    expect(performance.now() - start).toBeLessThan(3000)
  })

  it('keeps a user fill on the header band only', () => {
    const { svg } = render('erDiagram\n  A {\n    int id\n  }\n  style A fill:#fee,stroke:#f00', opts)
    expect(svg).toMatch(/class="dg-shape dg-entity-box"[^>]*style="stroke:#f00"/)
    expect(svg).toMatch(/class="dg-entity-header"[^>]*style="fill:#fee"/)
  })
})
