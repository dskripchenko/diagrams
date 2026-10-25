import { describe, expect, it } from 'vitest'
import { approximateMeasurer, DiagramError, detect, parse, render } from '../src'
import type { ClassDiagram } from '../src/diagrams/class'
import { generics, parseMember } from '../src/diagrams/class/parser'

const opts = { measureText: approximateMeasurer }
const p = (src: string) => parse(src) as ClassDiagram

function error(src: string): DiagramError {
  try {
    p(src)
  } catch (e) {
    expect(e).toBeInstanceOf(DiagramError)
    return e as DiagramError
  }
  throw new Error('expected a DiagramError')
}

describe('class members', () => {
  it('turns tilde generics into angle brackets, nested too', () => {
    expect(generics('List~int~')).toBe('List<int>')
    expect(generics('Map~String, List~Shape~~')).toBe('Map<String, List<Shape>>')
    expect(generics('List~List~int~~ grid')).toBe('List<List<int>> grid')
    expect(generics('plain')).toBe('plain')
  })

  it('reads attributes with visibility and classifiers', () => {
    expect(parseMember('+String name')).toEqual({ kind: 'attribute', text: '+String name', visibility: '+', classifier: undefined })
    expect(parseMember('-int count$')).toMatchObject({ text: '-int count', visibility: '-', classifier: 'static' })
    expect(parseMember('#List~T~ items')).toMatchObject({ text: '#List<T> items', visibility: '#' })
    expect(parseMember('~id : int')).toMatchObject({ text: '~id : int', visibility: '~' })
    expect(parseMember('RED')).toMatchObject({ kind: 'attribute', text: 'RED', visibility: undefined })
  })

  it('reads methods with parameters, return types and classifiers', () => {
    expect(parseMember('+isMammal() bool')).toMatchObject({ kind: 'method', text: '+isMammal() : bool' })
    expect(parseMember('-draw(Canvas c, int z)*')).toMatchObject({ text: '-draw(Canvas c, int z)', classifier: 'abstract' })
    expect(parseMember('+count()$ int')).toMatchObject({ text: '+count() : int', classifier: 'static' })
    expect(parseMember('+area() double*')).toMatchObject({ text: '+area() : double', classifier: 'abstract' })
    expect(parseMember('+load(List~int~ ids) Map~K,V~')).toMatchObject({ text: '+load(List<int> ids) : Map<K,V>' })
    expect(parseMember('mate()')).toMatchObject({ kind: 'method', text: 'mate()', visibility: undefined })
  })
})

describe('class parser', () => {
  it('is detected by its keyword', () => {
    expect(detect('classDiagram\n  A <|-- B')).toBe('class')
    expect(detect('classDiagram-v2\n  A <|-- B')).toBe('class')
  })

  it('reads class bodies, colon members, generics, labels and annotations', () => {
    const d = p(`classDiagram
      %% a comment
      class Shape {
        <<interface>>
        +area() double
        +String name
      }
      class Square~T~ {
        -List~T~ points
      }
      class Animal["Animal with a label"]
      class Service <<service>>
      class Color:::enumish
      <<enumeration>> Color
      Shape : +draw()
      Shape: -int sides`)
    const shape = d.classes.get('Shape')!
    expect(shape.annotations).toEqual(['interface'])
    expect(shape.attributes.map((m) => m.text)).toEqual(['+String name', '-int sides'])
    expect(shape.methods.map((m) => m.text)).toEqual(['+area() : double', '+draw()'])
    expect(d.classes.get('Square')).toMatchObject({ label: 'Square<T>', generic: 'T' })
    expect(d.classes.get('Square')!.attributes[0]!.text).toBe('-List<T> points')
    expect(d.classes.get('Animal')!.label).toBe('Animal with a label')
    expect(d.classes.get('Service')!.annotations).toEqual(['service'])
    expect(d.classes.get('Color')).toMatchObject({ classes: ['enumish'], annotations: ['enumeration'] })
  })

  it('reads every relationship, in both directions', () => {
    const d = p(`classDiagram
      A <|-- B
      A *-- C
      A o-- D
      A <-- E
      A -- F
      A <|.. G
      A <.. H
      A .. I
      J --|> A
      K --* A
      L --o A
      M --> A
      N ..|> A
      O ..> A
      P <|--|> Q
      R *--o S`)
    const ends = d.relations.map((r) => [r.fromEnd, r.toEnd, r.dashed])
    expect(ends).toEqual([
      ['inheritance', 'none', false],
      ['composition', 'none', false],
      ['aggregation', 'none', false],
      ['arrow', 'none', false],
      ['none', 'none', false],
      ['inheritance', 'none', true],
      ['arrow', 'none', true],
      ['none', 'none', true],
      ['none', 'inheritance', false],
      ['none', 'composition', false],
      ['none', 'aggregation', false],
      ['none', 'arrow', false],
      ['none', 'inheritance', true],
      ['none', 'arrow', true],
      ['inheritance', 'inheritance', false],
      ['composition', 'aggregation', false],
    ])
  })

  it('reads cardinalities and labels', () => {
    const d = p('classDiagram\n  Customer "1" --> "*" Ticket : buys\n  A "0..1" o-- B\n  C --> "many" D : "quoted label"')
    expect(d.relations[0]).toMatchObject({ from: 'Customer', to: 'Ticket', fromCardinality: '1', toCardinality: '*', label: 'buys' })
    expect(d.relations[1]).toMatchObject({ fromCardinality: '0..1', toCardinality: undefined, label: undefined })
    expect(d.relations[2]).toMatchObject({ toCardinality: 'many', label: 'quoted label' })
  })

  it('reads namespaces, notes and direction', () => {
    const d = p(`classDiagram
      direction RL
      namespace Shapes.Base {
        class Triangle
        class Rectangle {
          double width
        }
      }
      Triangle <|-- Rectangle
      note for Triangle "three\\nsides"
      note "free"`)
    expect(d.direction).toBe('RL')
    expect(d.namespaces.has('Shapes.Base')).toBe(true)
    expect(d.classes.get('Rectangle')!.namespace).toBe('Shapes.Base')
    expect(d.notes).toEqual([{ target: 'Triangle', text: 'three\nsides' }, { text: 'free' }])
  })

  it('reads styles, css classes and links; ignores callbacks', () => {
    const d = p(`classDiagram
      class A
      class B
      classDef hot fill:#fee,stroke:#f00
      cssClass "A,B" hot
      style A stroke-width:3px
      link A "https://example.com" "Docs"
      click B href "/b" "B docs" _blank
      callback A "doSomething"
      click B call doSomething()`)
    expect(d.classes.get('A')!.classes).toEqual(['hot'])
    expect(d.classes.get('B')!.classes).toEqual(['hot'])
    expect(d.classes.get('A')!.style!.shape).toEqual({ 'stroke-width': '3px' })
    expect(d.classes.get('A')!.link).toEqual({ href: 'https://example.com', tooltip: 'Docs', target: undefined })
    expect(d.classes.get('B')!.link).toEqual({ href: '/b', tooltip: 'B docs', target: '_blank' })
  })

  it('reports errors with line, column and hint', () => {
    let e = error('classDiagram\n  A <|-- B\n  A <=> B')
    expect([e.line, e.column]).toEqual([3, 5])
    expect(e.hint).toMatch(/<\|--/)

    e = error('classDiagram\n  class A {\n    +int x\n')
    expect(e.message).toMatch(/not closed/)
    expect(e.line).toBe(2)

    e = error('classDiagram\n  namespace N {\n    class A\n')
    expect(e.message).toMatch(/Namespace "N" is not closed/)

    e = error('classDiagram\n  namespace N {\n    A <|-- B\n  }')
    expect(e.line).toBe(3)
    expect(e.hint).toMatch(/after the namespace/)

    e = error('classDiagram\n  namespace N {\n    namespace M {\n  }\n  }')
    expect(e.message).toMatch(/do not nest/)

    e = error('classDiagram\n  Class01 --() bar')
    expect(e.message).toMatch(/Lollipop/)
    expect(e.line).toBe(2)

    e = error('classDiagram\n  class `Animal Class!`')
    expect(e.hint).toMatch(/\["Animal Class!"\]/)

    e = error('classDiagram\n  Square~T~ <|-- Rect')
    expect([e.line, e.column]).toEqual([2, 9])
    expect(e.hint).toMatch(/class Square~T~/)

    expect(error('classDiagram\n  Lonely').hint).toMatch(/class Lonely/)
    expect(error('classDiagram\n  }').message).toMatch(/without an open/)
    expect(error('classDiagram\n  note for X "x"').message).toMatch(/unknown class "X"/)
    expect(error('classDiagram\n  class A\n  link A "javascript:alert(1)"').message).toMatch(/not allowed/)
    expect(error('classDiagram\n  class A {\n    <<interface\n  }').message).toMatch(/annotation/)
    expect(error('classDiagram\n  direction UP').message).toMatch(/not a direction/)
  })
})

describe('class rendering', () => {
  it('draws boxes, compartments and prefixed UML markers', () => {
    const { svg, type } = render(
      'classDiagram\n  Animal <|-- Duck\n  Duck *-- Wing\n  Duck o-- Egg\n  Duck --> Pond\n  Duck ..|> Swimmer\n  Duck ..> Bread\n  Animal : +int age\n  Animal : +breathe()',
      { ...opts, idPrefix: 'c1' },
    )
    expect(type).toBe('class')
    expect(svg).toContain('class="dg-node dg-uml-class" data-id="Animal"')
    expect(svg).toContain('dg-uml-header')
    expect(svg).toContain('dg-uml-rule')
    for (const m of ['triangle', 'diamond', 'diamond-open', 'open-arrow']) expect(svg).toContain(`id="c1-m-${m}`)
    expect(svg).toContain('class="dg-edge dg-edge-dashed"')
    for (const [, value] of svg.matchAll(/ id="([^"]+)"/g)) expect(value!.startsWith('c1')).toBe(true)
  })

  it('lays the base class out above its subclass whichever way the arrow is written', () => {
    const y = (svg: string, id: string) => Number(new RegExp(`data-id="${id}"><rect class="[^"]*" x="[^"]*" y="([^"]+)"`).exec(svg)![1])
    for (const src of ['classDiagram\n  Animal <|-- Duck', 'classDiagram\n  Duck --|> Animal']) {
      const { svg } = render(src, opts)
      expect(y(svg, 'Animal')).toBeLessThan(y(svg, 'Duck'))
    }
  })

  it('draws static members underlined and abstract ones in italics', () => {
    const { svg } = render('classDiagram\n  class A {\n    +int count$\n    +draw()*\n  }', opts)
    expect(svg).toContain('style="text-decoration:underline"')
    expect(svg).toContain('style="font-style:italic"')
  })

  it('draws cardinalities, notes and links', () => {
    const { svg } = render(
      'classDiagram\n  A "1" --> "0..*" B : has\n  note for A "a note"\n  link B "https://example.com/b" "B"\n  A --> A : self',
      opts,
    )
    expect(svg).toContain('dg-uml-cardinality')
    expect(svg).toContain('>0..*<')
    expect(svg).toContain('dg-note-box')
    expect(svg).toContain('<a href="https://example.com/b">')
    expect(svg).toContain('>self<')
  })

  it('never turns text into markup', () => {
    const payloads = ['<script>alert(1)</script>', '"><svg onload=alert(1)>', '</text><img src=x onerror=alert(1)>']
    for (const payload of payloads) {
      const q = payload.replace(/"/g, '#quot;')
      const src = `classDiagram\n  class A["${q}"] {\n    +${payload} field\n    <<${payload.replace(/[<>]/g, '')}>>\n  }\n  A "${q}" --> B : ${payload}\n  note for A "${q}"`
      let svg: string
      try {
        svg = render(src, opts).svg
      } catch {
        continue // rejecting is as safe as escaping
      }
      expect(svg).not.toMatch(/<script/i)
      expect(svg).not.toMatch(/<img/i)
      expect(svg).not.toMatch(/<[^>]*\son\w+=/i)
      expect(svg.match(/<svg/g)).toHaveLength(1)
    }
  })
})
