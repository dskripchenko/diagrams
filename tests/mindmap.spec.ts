import { describe, expect, it } from 'vitest'
import { approximateMeasurer, detect, DiagramError, render } from '../src'
import { parseMindmap, type MindmapNode } from '../src/diagrams/mindmap'

const opts = { measureText: approximateMeasurer }

function error(source: string): DiagramError {
  try {
    parseMindmap(source)
  } catch (e) {
    expect(e).toBeInstanceOf(DiagramError)
    return e as DiagramError
  }
  throw new Error('expected a DiagramError')
}

/** The tree as nested [label, children] pairs, for compact assertions. */
function outline(node: MindmapNode): unknown {
  return node.children.length > 0 ? [node.label, node.children.map(outline)] : node.label
}

describe('mindmap parsing', () => {
  it('is detected', () => {
    expect(detect('mindmap\n  root')).toBe('mindmap')
  })

  it('builds the tree from indentation, uneven indentation included', () => {
    const d = parseMindmap(`mindmap
  root
    A
      A1
         A1a
      A2
    B
     B1`)
    expect(outline(d.root)).toEqual(['root', [['A', [['A1', ['A1a']], 'A2']], ['B', ['B1']]]])
  })

  it('reads every shape, with and without ids', () => {
    const d = parseMindmap(`mindmap
  r((Root))
    a[Square]
    b(Rounded)
    c((Circle))
    d))Bang((
    e)Cloud(
    f{{Hexagon}}
    Default shape
    [No id]`)
    expect(d.root).toMatchObject({ id: 'r', label: 'Root', shape: 'circle' })
    expect(d.root.children.map((c) => [c.id, c.label, c.shape])).toEqual([
      ['a', 'Square', 'square'],
      ['b', 'Rounded', 'rounded'],
      ['c', 'Circle', 'circle'],
      ['d', 'Bang', 'bang'],
      ['e', 'Cloud', 'cloud'],
      ['f', 'Hexagon', 'hexagon'],
      ['Default shape', 'Default shape', 'default'],
      ['node-8', 'No id', 'square'],
    ])
  })

  it('keeps icons and classes without drawing them', () => {
    const d = parseMindmap(`mindmap
  root
    A
    ::icon(fa fa-book)
    B :::urgent large
    C
    :::done
    D[Inline] ::icon(fa fa-x) :::late`)
    const [a, b, c, e] = d.root.children
    expect(a).toMatchObject({ label: 'A', icon: 'fa fa-book' })
    expect(b).toMatchObject({ label: 'B', classes: ['urgent', 'large'] })
    expect(c).toMatchObject({ label: 'C', classes: ['done'] })
    expect(e).toMatchObject({ id: 'D', label: 'Inline', shape: 'square', icon: 'fa fa-x', classes: ['late'] })
    expect(render('mindmap\n  root\n    A\n    ::icon(fa fa-book)', opts).svg).not.toContain('fa-book')
  })

  it('reads quoted and markdown labels, across lines too', () => {
    const d = parseMindmap(`mindmap
  root["Text (with brackets)"]
    a["\`**Bold** and *italic*\`"]
    b["\`First line
second line\`"]
    "Quoted :) default"`)
    expect(d.root).toMatchObject({ label: 'Text (with brackets)', markdown: false })
    expect(d.root.children.map((c) => [c.label, c.markdown])).toEqual([
      ['**Bold** and *italic*', true],
      ['First line\nsecond line', true],
      ['Quoted :) default', false],
    ])
    const { svg } = render('mindmap\n  root["`**Bold** and *italic*`"]', opts)
    expect(svg).toContain('font-weight="bold"')
    expect(svg).toContain('font-style="italic"')
    expect(svg).not.toContain('**')
  })

  it('reports a second root', () => {
    const e = error('mindmap\n  root\n    a\n  other')
    expect(e).toMatchObject({ line: 4, column: 3 })
    expect(e.hint).toMatch(/Indent it under "root"/)
  })

  it('reports shapes that are not closed or not known', () => {
    expect(error('mindmap\n  root\n    id[text')).toMatchObject({ line: 3, column: 7 })
    expect(error('mindmap\n  root\n    Pen (and) paper').hint).toMatch(/quotes/)
    expect(error('mindmap\n  root\n    id{text}').message).toMatch(/does not start a node shape/)
    expect(error('mindmap\n  root\n    id[]').message).toMatch(/no text/)
    expect(error('mindmap\n  root["`never closed').message).toMatch(/markdown string/)
  })

  it('reports decorations before any node and empty maps', () => {
    expect(error('mindmap\n  ::icon(fa fa-x)')).toMatchObject({ line: 2 })
    expect(error('mindmap').message).toMatch(/empty/)
    expect(error('mindmap root').line).toBe(1)
  })
})

describe('mindmap rendering', () => {
  const source = `mindmap
  root((Plan))
    Goals
      Ship
      Grow
    Risks
      Budget
    Team
    Docs`

  it('draws a node per item and an edge per parent link', () => {
    const { svg } = render(source, opts)
    expect(svg.match(/class="dg-node dg-mm-node/g)).toHaveLength(8)
    expect(svg.match(/class="dg-mm-edge /g)).toHaveLength(7)
    expect(svg).toContain('dg-mm-root')
  })

  it('splits the branches between the right and the left of the root', () => {
    const { svg } = render(source, opts)
    const xs = [...svg.matchAll(/<g class="dg-node dg-mm-node dg-mm-depth-1"[^>]*>.*?<tspan x="([-\d.]+)"/g)].map((m) => Number(m[1]))
    const root = Number(/<g class="dg-node dg-mm-node dg-mm-root"[^>]*>.*?<tspan x="([-\d.]+)"/.exec(svg)![1])
    expect(xs.filter((x) => x > root).length).toBeGreaterThan(0)
    expect(xs.filter((x) => x < root).length).toBeGreaterThan(0)
  })

  it('colours each branch from the palette', () => {
    const { svg } = render(source, opts)
    for (let i = 1; i <= 4; i++) expect(svg).toContain(`var(--dg-pie-${i}`)
    expect(svg).not.toContain('var(--dg-pie-5')
  })

  it('draws each shape', () => {
    const { svg } = render('mindmap\n  r((Root))\n    a[A]\n    b(B)\n    c))C((\n    d)D(\n    e{{E}}\n    F', opts)
    expect(svg).toContain('<circle class="dg-mm-shape"')
    expect(svg).toContain('<polygon class="dg-mm-shape"')
    expect(svg).toContain('dg-mm-default')
    expect(svg).toContain('class="dg-mm-bar"')
    expect(svg.match(/<path class="dg-mm-shape"/g)).toHaveLength(2)
  })

  it('renders a root on its own', () => {
    const { svg, width, height } = render('mindmap\n  Alone', opts)
    expect(svg).toContain('Alone')
    expect(width).toBeGreaterThan(40)
    expect(height).toBeGreaterThan(20)
  })

  it('escapes labels', () => {
    const { svg } = render('mindmap\n  root["<script>x</script>"]\n    <img src=x onerror=alert 1>', opts)
    expect(svg).not.toMatch(/<script|<img/)
    expect(svg).toContain('&lt;script&gt;')
  })

  it('is deterministic', () => {
    expect(render(source, opts).svg).toBe(render(source, opts).svg)
  })
})
