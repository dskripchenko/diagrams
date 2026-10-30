/**
 * Graphviz DOT, read into the flowchart model.
 *
 *     digraph deploy {
 *       rankdir=LR
 *       node [shape=box, style=rounded]
 *       subgraph cluster_ci { label="CI"; build; test }
 *       build -> test -> deploy [label="green", color=green]
 *       db [shape=cylinder]
 *       deploy -> db [style=dashed]
 *     }
 *
 * Supported: `graph` / `digraph` (`strict` accepted); statements separated
 * by newlines or `;`; node statements; edge chains (`a -> b -> c`, `a -> {b
 * c}`); `graph` / `node` / `edge` default attributes; `key=value` at graph
 * level; subgraphs (`cluster_…` are framed, others group nodes for their
 * defaults); ports (`a:p`), accepted. Attributes: `label` (records `{a|b}`
 * become lines; HTML labels lose their tags), `shape`, `style` (dashed,
 * dotted, bold, invis, filled, rounded), `color`, `fillcolor`, `fontcolor`,
 * `penwidth`, `dir`, `arrowhead`, `arrowtail`, `rankdir`, graph `label`.
 */
import { DiagramError, tooLarge } from '../core/errors'
import type { ShapeKind } from '../core/shapes'
import { parseStyle, type UserStyle } from '../core/style'
import type { EdgeEnd, FlowEdge, Flowchart, Stroke } from '../diagrams/flowchart/parser'
import type { Direction } from '../layout/layered/types'

/** True when the source is DOT: `digraph`, or `graph` with a body in braces (Mermaid's `graph TD` has none). */
export function isDot(source: string): boolean {
  const text = source.replace(/^\s*(\/\/[^\n]*\n|#[^\n]*\n|\/\*[\s\S]*?\*\/)*/g, '').trimStart()
  return /^(strict\s+)?digraph\b/i.test(text) || /^(strict\s+)?graph\s*("[^"]*"|[\w.]+)?\s*\{/i.test(text)
}

interface Token {
  kind: 'id' | 'punct'
  value: string
  /** Quoted or HTML: an id that may contain anything. */
  quoted: boolean
  line: number
  column: number
}

function tokenize(source: string): Token[] {
  const out: Token[] = []
  let i = 0
  let line = 1
  let col = 1
  const advance = (n: number) => {
    for (let k = 0; k < n; k++) {
      if (source[i] === '\n') {
        line++
        col = 1
      } else col++
      i++
    }
  }
  while (i < source.length) {
    const ch = source[i]!
    if (/\s/.test(ch)) {
      advance(1)
      continue
    }
    if (source.startsWith('//', i) || (ch === '#' && col === 1)) {
      while (i < source.length && source[i] !== '\n') advance(1)
      continue
    }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2)
      advance((end < 0 ? source.length : end + 2) - i)
      continue
    }
    const at = { line, column: col }
    if (ch === '"') {
      let j = i + 1
      let value = ''
      while (j < source.length && source[j] !== '"') {
        if (source[j] === '\\' && source[j + 1] === '"') {
          value += '"'
          j += 2
          continue
        }
        // A backslash-newline continues the string.
        if (source[j] === '\\' && source[j + 1] === '\n') {
          j += 2
          continue
        }
        value += source[j]
        j++
      }
      if (j >= source.length) throw new DiagramError('A quoted string is never closed', at.line, at.column)
      out.push({ kind: 'id', value, quoted: true, ...at })
      advance(j + 1 - i)
      continue
    }
    if (ch === '<') {
      // An HTML label: its text, without the tags.
      let depth = 0
      let j = i
      for (; j < source.length; j++) {
        if (source[j] === '<') depth++
        else if (source[j] === '>') depth--
        if (depth === 0) break
      }
      if (j >= source.length) throw new DiagramError('An HTML label is never closed', at.line, at.column)
      const html = source.slice(i + 1, j)
      const text = html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      out.push({ kind: 'id', value: text.trim(), quoted: true, ...at })
      advance(j + 1 - i)
      continue
    }
    if (source.startsWith('->', i) || source.startsWith('--', i)) {
      out.push({ kind: 'punct', value: source.slice(i, i + 2), quoted: false, ...at })
      advance(2)
      continue
    }
    if ('{}[]=;,:'.includes(ch)) {
      out.push({ kind: 'punct', value: ch, quoted: false, ...at })
      advance(1)
      continue
    }
    const m = /^(-?(?:\.\d+|\d+(?:\.\d*)?)|[\p{L}_\u0080-￿][\p{L}\p{N}_\u0080-￿]*)/u.exec(source.slice(i))
    if (!m) throw new DiagramError(`Unexpected "${ch}"`, at.line, at.column)
    out.push({ kind: 'id', value: m[0], quoted: false, ...at })
    advance(m[0].length)
  }
  return out
}

const SHAPES: Record<string, ShapeKind> = {
  box: 'rect',
  rect: 'rect',
  rectangle: 'rect',
  square: 'rect',
  ellipse: 'usecase',
  oval: 'usecase',
  circle: 'circle',
  point: 'start',
  doublecircle: 'doublecircle',
  diamond: 'rhombus',
  hexagon: 'hexagon',
  parallelogram: 'parallelogram',
  trapezium: 'trapezoid',
  invtrapezium: 'trapezoid-alt',
  cylinder: 'cylinder',
  note: 'note',
  folder: 'folder',
  tab: 'folder',
  component: 'component',
  box3d: 'node',
  plaintext: 'text',
  plain: 'text',
  none: 'text',
  record: 'rect',
  mrecord: 'round',
  underline: 'text',
  cds: 'asymmetric',
}

const ARROWS: Record<string, EdgeEnd> = {
  normal: 'arrow',
  vee: 'open-arrow',
  open: 'open-arrow',
  empty: 'triangle',
  onormal: 'triangle',
  diamond: 'diamond',
  odiamond: 'diamond-open',
  ediamond: 'diamond-open',
  dot: 'circle',
  odot: 'circle',
  none: 'none',
  tee: 'cross',
  box: 'arrow',
  inv: 'arrow',
  crow: 'open-arrow',
}

type Attrs = Map<string, string>

const MAX_NODES = 500

class Reader {
  private i = 0
  readonly chart: Flowchart = { type: 'flowchart', direction: 'TB', nodes: new Map(), edges: [], subgraphs: new Map(), classDefs: new Map(), accessibility: {} }
  private directed = true

  constructor(private readonly tokens: Token[]) {}

  private peek(k = 0): Token | undefined {
    return this.tokens[this.i + k]
  }

  private error(message: string, hint?: string): DiagramError {
    const t = this.peek() ?? this.tokens[this.tokens.length - 1]
    return new DiagramError(message, t?.line ?? 0, t?.column ?? 0, hint)
  }

  private is(value: string, k = 0): boolean {
    const t = this.peek(k)
    return !!t && t.kind === 'punct' && t.value === value
  }

  private keyword(word: string, k = 0): boolean {
    const t = this.peek(k)
    return !!t && t.kind === 'id' && !t.quoted && t.value.toLowerCase() === word
  }

  private expect(value: string): void {
    if (!this.is(value)) throw this.error(`"${value}" expected here`)
    this.i++
  }

  run(): Flowchart {
    if (this.keyword('strict')) this.i++
    if (this.keyword('digraph')) this.directed = true
    else if (this.keyword('graph')) this.directed = false
    else throw this.error('A DOT graph starts with "graph" or "digraph"')
    this.i++
    if (this.peek()?.kind === 'id') this.i++
    this.expect('{')
    this.statements({ node: new Map(), edge: new Map() }, undefined)
    this.expect('}')
    if (this.i < this.tokens.length) throw this.error('Text after the closing "}"')
    return this.chart
  }

  /** Statements up to the closing `}` of the current scope. */
  private statements(defaults: { node: Attrs; edge: Attrs }, cluster: string | undefined, scope?: Set<string>): void {
    while (this.peek() && !this.is('}')) {
      if (this.is(';')) {
        this.i++
        continue
      }
      // Graph-level `key = value`.
      if (this.peek()?.kind === 'id' && this.is('=', 1)) {
        const key = this.peek()!.value.toLowerCase()
        const value = this.peek(2)?.value ?? ''
        this.i += 3
        this.graphAttr(key, value, cluster)
        continue
      }
      if (this.keyword('graph') || this.keyword('node') || this.keyword('edge')) {
        const which = this.peek()!.value.toLowerCase()
        this.i++
        const attrs = this.attrs()
        if (which === 'node') for (const [k, v] of attrs) defaults.node.set(k, v)
        else if (which === 'edge') for (const [k, v] of attrs) defaults.edge.set(k, v)
        else for (const [k, v] of attrs) this.graphAttr(k, v, cluster)
        continue
      }
      const left = this.operand(defaults, cluster, scope)
      if (this.is('->') || this.is('--')) {
        const chain = [left]
        while (this.is('->') || this.is('--')) {
          if (this.is('->') !== this.directed) throw this.error(this.directed ? 'A digraph links with "->"' : 'A graph links with "--"')
          this.i++
          chain.push(this.operand(defaults, cluster, scope))
        }
        const attrs = new Map([...defaults.edge, ...this.attrs()])
        for (let k = 0; k + 1 < chain.length; k++) {
          for (const from of chain[k]!) for (const to of chain[k + 1]!) this.edge(from, to, attrs)
        }
        continue
      }
      // A node statement: its attributes go on the node.
      const attrs = this.attrs()
      for (const id of left) this.nodeAttrs(id, attrs)
    }
  }

  /** A node id or a subgraph; returns the node ids it stands for. */
  private operand(defaults: { node: Attrs; edge: Attrs }, cluster: string | undefined, scope?: Set<string>): string[] {
    if (this.keyword('subgraph') || this.is('{')) {
      let name: string | undefined
      if (this.keyword('subgraph')) {
        this.i++
        if (this.peek()?.kind === 'id') name = this.peek()!.value
        if (name !== undefined) this.i++
      }
      this.expect('{')
      const isCluster = !!name && /^cluster/i.test(name)
      const id = isCluster ? name! : cluster
      if (isCluster && !this.chart.subgraphs.has(name!)) {
        this.chart.subgraphs.set(name!, { id: name!, title: '', markdown: false, parent: cluster, classes: [] })
      }
      const members = new Set<string>()
      // A subgraph has its own copy of the defaults.
      this.statements({ node: new Map(defaults.node), edge: new Map(defaults.edge) }, id, members)
      this.expect('}')
      for (const m of members) scope?.add(m)
      return [...members]
    }
    const t = this.peek()
    if (!t || t.kind !== 'id') throw this.error('A node name expected here')
    this.i++
    // A port (`a:p` or `a:p:n`) is accepted and not drawn.
    while (this.is(':') && this.peek(1)?.kind === 'id') this.i += 2
    this.node(t.value, defaults.node, cluster)
    scope?.add(t.value)
    return [t.value]
  }

  /** `[a=1, b=2; c=3]`, any number of lists. */
  private attrs(): Attrs {
    const out: Attrs = new Map()
    while (this.is('[')) {
      this.i++
      while (!this.is(']')) {
        const key = this.peek()
        if (!key || key.kind !== 'id') throw this.error('An attribute name expected here')
        this.i++
        let value = 'true'
        if (this.is('=')) {
          this.i++
          const v = this.peek()
          if (!v || v.kind !== 'id') throw this.error('An attribute value expected here')
          value = v.value
          this.i++
        }
        out.set(key.value.toLowerCase(), value)
        if (this.is(',') || this.is(';')) this.i++
      }
      this.i++
    }
    return out
  }

  private node(id: string, defaults: Attrs, cluster: string | undefined): void {
    if (this.chart.nodes.has(id)) return
    if (this.chart.nodes.size >= MAX_NODES) throw tooLarge('nodes', this.chart.nodes.size + 1, MAX_NODES)
    this.chart.nodes.set(id, { id, text: id, markdown: false, shape: 'usecase', classes: [], subgraph: cluster })
    this.nodeAttrs(id, defaults)
  }

  private nodeAttrs(id: string, attrs: Attrs): void {
    const n = this.chart.nodes.get(id)!
    const label = attrs.get('label')
    if (label !== undefined && label !== '\\N') n.text = recordLabel(label)
    const shape = attrs.get('shape')?.toLowerCase()
    if (shape) n.shape = SHAPES[shape] ?? 'rect'
    const styles = (attrs.get('style') ?? '').toLowerCase().split(',').map((s) => s.trim())
    if (styles.includes('rounded') && n.shape === 'rect') n.shape = 'round'
    if (styles.includes('invis')) n.shape = 'text'
    const parts: string[] = []
    const color = attrs.get('color')
    const fill = attrs.get('fillcolor') ?? (styles.includes('filled') ? color : undefined)
    const add = (prop: string, value: string | undefined) => {
      const c = value === undefined ? undefined : colour(value)
      if (c) parts.push(`${prop}:${c}`)
    }
    add('fill', fill)
    add('stroke', color)
    add('color', attrs.get('fontcolor'))
    if (styles.includes('dashed')) parts.push('stroke-dasharray:5 4')
    if (styles.includes('dotted')) parts.push('stroke-dasharray:2 3')
    if (parts.length > 0) n.style = parseStyle(parts.join(','), 0, 0)
  }

  private edge(from: string, to: string, attrs: Attrs): void {
    const styles = (attrs.get('style') ?? '').toLowerCase().split(',').map((s) => s.trim())
    let stroke: Stroke = 'normal'
    if (styles.includes('invis')) stroke = 'invisible'
    else if (styles.includes('dashed') || styles.includes('dotted')) stroke = 'dotted'
    else if (styles.includes('bold') || Number(attrs.get('penwidth') ?? 1) >= 2) stroke = 'thick'
    const dir = (attrs.get('dir') ?? (this.directed ? 'forward' : 'none')).toLowerCase()
    const head = ARROWS[(attrs.get('arrowhead') ?? 'normal').toLowerCase()] ?? 'arrow'
    const tail = ARROWS[(attrs.get('arrowtail') ?? 'normal').toLowerCase()] ?? 'arrow'
    const edge: FlowEdge = {
      from,
      to,
      stroke,
      start: dir === 'back' || dir === 'both' ? tail : 'none',
      end: dir === 'forward' || dir === 'both' ? head : 'none',
      length: Math.max(1, Math.round(Number(attrs.get('minlen') ?? 1)) || 1),
      text: attrs.get('label') ?? attrs.get('xlabel'),
      markdown: false,
    }
    const color = attrs.get('color') ? colour(attrs.get('color')!.split(':')[0]!) : undefined
    if (color) edge.style = parseStyle(`stroke:${color}`, 0, 0)
    this.chart.edges.push(edge)
  }

  private graphAttr(key: string, value: string, cluster: string | undefined): void {
    if (cluster) {
      const sub = this.chart.subgraphs.get(cluster)
      if (!sub) return
      const c = colour(value)
      if (key === 'label') sub.title = recordLabel(value)
      else if ((key === 'bgcolor' || key === 'fillcolor') && c) sub.style = parseStyle(`fill:${c}`, 0, 0)
      else if ((key === 'color' || key === 'pencolor') && c) sub.style = { ...(sub.style ?? { shape: {}, text: {} }), shape: { ...(sub.style?.shape ?? {}), stroke: c } } as UserStyle
      return
    }
    if (key === 'rankdir') {
      const dir = value.toUpperCase() as Direction
      if (['TB', 'LR', 'BT', 'RL'].includes(dir)) this.chart.direction = dir
    } else if (key === 'label') this.chart.title = recordLabel(value)
  }
}

/** A record label `{a|b}` becomes lines; `\n` and `\l` break lines too. */
function recordLabel(label: string): string {
  let t = label
  if (/[{|}]/.test(t) && /\|/.test(t)) t = t.replace(/[{}]/g, '').split('|').map((p) => p.replace(/<[^>]*>/g, '').trim()).join('<br>')
  return t.replace(/\\[nlr]/g, '<br>').replace(/(<br>)+$/, '')
}

/** A Graphviz colour: a name or `#rrggbb`; anything else (HSV triples, lists) is dropped. */
function colour(value: string): string | undefined {
  const v = value.trim()
  return /^#[0-9a-fA-F]{3,8}$/.test(v) || /^[a-zA-Z]+$/.test(v) ? v : undefined
}

export function parseDot(source: string): Flowchart {
  return new Reader(tokenize(source)).run()
}
