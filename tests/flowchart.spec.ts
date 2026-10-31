import { describe, expect, it } from 'vitest'
import { approximateMeasurer, DiagramError, parse, render } from '../src'
import type { Flowchart } from '../src/diagrams/flowchart'

const opts = { measureText: approximateMeasurer }
const p = (src: string) => parse(src) as Flowchart

describe('flowchart parser', () => {
  it('reads every bracket shape', () => {
    const chart = p(`flowchart LR
      a[r] --> b(r) --> c([s]) --> d[[s]] --> e[(c)] --> f((c)) --> g>a]
      g --> h{r} --> i{{h}} --> j[/p/] --> k[\\p\\] --> l[/t\\] --> m[\\t/] --> n(((d)))`)
    const shapes = [...chart.nodes.values()].map((n) => n.shape)
    expect(shapes).toEqual([
      'rect', 'round', 'stadium', 'subroutine', 'cylinder', 'circle', 'asymmetric',
      'rhombus', 'hexagon', 'parallelogram', 'parallelogram-alt', 'trapezoid', 'trapezoid-alt', 'doublecircle',
    ])
  })

  it('reads edge strokes, heads, lengths and text', () => {
    const chart = p(`flowchart LR
      A --> B
      A --- C
      A -.-> D
      A ==> E
      A --o F
      A --x G
      A <--> H
      A ---> I
      A -- yes --> J
      A -->|no| K
      A -. maybe .-> L
      A == sure ==> M
      A ~~~ N`)
    const e = chart.edges
    expect(e.map((x) => x.stroke)).toEqual([
      'normal', 'normal', 'dotted', 'thick', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'dotted', 'thick', 'invisible',
    ])
    expect(e[1]!.end).toBe('none')
    expect(e[4]!.end).toBe('circle')
    expect(e[5]!.end).toBe('cross')
    expect(e[6]!.start).toBe('arrow')
    expect(e[7]!.length).toBe(2)
    expect(e.slice(8, 12).map((x) => x.text)).toEqual(['yes', 'no', 'maybe', 'sure'])
  })

  it('expands & groups and chains', () => {
    const chart = p('flowchart TD\n  A & B --> C & D --> E')
    expect(chart.edges.map((e) => `${e.from}${e.to}`)).toEqual(['AC', 'AD', 'BC', 'BD', 'CE', 'DE'])
  })

  it('keeps a node in the first subgraph that mentions it', () => {
    const chart = p('flowchart TB\n  subgraph one\n  a1 --> a2\n  end\n  subgraph two\n  a2 --> b1\n  end')
    expect(chart.nodes.get('a2')!.subgraph).toBe('one')
    expect(chart.nodes.get('b1')!.subgraph).toBe('two')
  })

  it('reads subgraph titles and direction', () => {
    const chart = p('flowchart LR\n  subgraph s1 ["Первый блок"]\n  direction TB\n  a\n  end')
    expect(chart.subgraphs.get('s1')).toMatchObject({ title: 'Первый блок', direction: 'TB' })
  })

  it('applies classDef, class, ::: and style', () => {
    const chart = p('flowchart LR\n  classDef hot fill:#f00\n  A:::hot --> B\n  class B hot\n  style A stroke:#000')
    expect(chart.nodes.get('A')!.classes).toEqual(['hot'])
    expect(chart.nodes.get('B')!.classes).toEqual(['hot'])
    expect(chart.nodes.get('A')!.style!.shape.stroke).toBe('#000')
  })

  it('decodes entity codes and keeps markdown strings', () => {
    const chart = p('flowchart LR\n  A["a #quot;quoted#quot; #35;1"]\n  B["`**bold**`"]')
    const { svg } = render('flowchart LR\n  A["a #quot;quoted#quot; #35;1"]', opts)
    expect(svg).toContain('a &quot;quoted&quot; #1'.replace(/&quot;/g, '"'))
    expect(chart.nodes.get('B')!.markdown).toBe(true)
  })

  it('reports positions', () => {
    try {
      p('flowchart LR\n  A --> B\n  A -> ')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(DiagramError)
      expect((e as DiagramError).line).toBe(3)
      expect((e as DiagramError).column).toBeGreaterThan(1)
    }
    expect(() => p('flowchart LR\n  subgraph a\n  x')).toThrow(/not closed/)
    expect(() => p('flowchart LR\n  end')).toThrow(/without a subgraph/)
    expect(() => p('flowchart XY')).toThrow(/direction/)
  })

  it('renders links only for allowed schemes', () => {
    const { svg } = render('flowchart LR\n  A --> B\n  click A href "https://example.com" "Go" _blank', opts)
    expect(svg).toContain('href="https://example.com"')
    expect(svg).toContain('rel="noopener noreferrer"')
  })

  it('does not draw invisible edges but lays them out', () => {
    const { svg } = render('flowchart LR\n  A ~~~ B', opts)
    expect(svg).not.toContain('class="dg-edge"')
  })

  it('draws subgraph titles above the edges, so an edge entering a frame passes under its title', () => {
    const { svg } = render('flowchart TB\n  a --> b\n  subgraph S [Services]\n    b\n  end', opts)
    const edges = svg.indexOf('class="dg-edges"')
    const titles = svg.indexOf('class="dg-cluster-titles"')
    expect(edges).toBeGreaterThan(-1)
    expect(titles).toBeGreaterThan(edges)
    expect(svg.slice(titles)).toContain('Services')
    expect(svg).toMatch(/\.dg-cluster-title \.dg-cluster-label\{[^}]*paint-order:stroke/)
  })
})
