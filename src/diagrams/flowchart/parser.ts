/**
 * The flowchart grammar: `flowchart`/`graph`, nodes in every bracket shape,
 * edges of every stroke and head, subgraphs, classes and styles, links.
 */
import { DiagramError } from '../../core/errors'
import { Cursor, statements, type Statement } from '../../core/scanner'
import type { ShapeKind } from '../../core/shapes'
import { parseStyle, safeHref, type UserStyle } from '../../core/style'
import type { Direction } from '../../layout/layered/types'
import { accessibilityStatement, type Accessibility } from '../common'

export type Stroke = 'normal' | 'thick' | 'dotted' | 'invisible'
export type EdgeEnd = 'none' | 'arrow' | 'circle' | 'cross'

export interface FlowNode {
  id: string
  /** Label source; the id when the node never got text. */
  text: string
  markdown: boolean
  shape: ShapeKind
  classes: string[]
  style?: UserStyle
  link?: { href: string; tooltip?: string; target?: string }
  tooltip?: string
  /** The subgraph the node belongs to. */
  subgraph?: string
}

export interface FlowEdge {
  from: string
  to: string
  stroke: Stroke
  start: EdgeEnd
  end: EdgeEnd
  /** Ranks the edge spans at least: `-->` 1, `--->` 2. */
  length: number
  text?: string
  markdown: boolean
  style?: UserStyle
}

export interface FlowSubgraph {
  id: string
  title: string
  markdown: boolean
  parent?: string
  direction?: Direction
  classes: string[]
  style?: UserStyle
}

export interface Flowchart {
  type: 'flowchart'
  direction: Direction
  nodes: Map<string, FlowNode>
  edges: FlowEdge[]
  subgraphs: Map<string, FlowSubgraph>
  classDefs: Map<string, UserStyle>
  accessibility: Accessibility
}

const DIRECTIONS: Record<string, Direction> = { TB: 'TB', TD: 'TB', BT: 'BT', LR: 'LR', RL: 'RL' }

/** Shape openers, longest first, with the closer each expects. */
const SHAPES: { open: string; close: string | string[]; shape: ShapeKind | ((close: string) => ShapeKind) }[] = [
  { open: '(((', close: ')))', shape: 'doublecircle' },
  { open: '((', close: '))', shape: 'circle' },
  { open: '([', close: '])', shape: 'stadium' },
  { open: '[[', close: ']]', shape: 'subroutine' },
  { open: '[(', close: ')]', shape: 'cylinder' },
  { open: '{{', close: '}}', shape: 'hexagon' },
  { open: '[/', close: ['/]', '\\]'], shape: (c) => (c === '/]' ? 'parallelogram' : 'trapezoid') },
  { open: '[\\', close: ['\\]', '/]'], shape: (c) => (c === '\\]' ? 'parallelogram-alt' : 'trapezoid-alt') },
  { open: '>', close: ']', shape: 'asymmetric' },
  { open: '[', close: ']', shape: 'rect' },
  { open: '(', close: ')', shape: 'round' },
  { open: '{', close: '}', shape: 'rhombus' },
]

const ID = /[\p{L}\p{N}_](?:[\p{L}\p{N}_.$]|-(?=[\p{L}\p{N}_]))*/u

interface EdgeToken {
  stroke: Stroke
  start: EdgeEnd
  end: EdgeEnd
  length: number
  text?: string
  markdown: boolean
}

function endKind(ch: string | undefined): EdgeEnd {
  return ch === '>' || ch === '<' ? 'arrow' : ch === 'x' ? 'cross' : ch === 'o' ? 'circle' : 'none'
}

/** An end marker letter (x, o) only counts when what follows is not part of a name. */
function endsCleanly(cursor: Cursor): boolean {
  const next = cursor.peek()
  return next === '' || /[\s|&"]/.test(next) || /[[({>]/.test(next) === false && !/[\p{L}\p{N}_]/u.test(next)
}

function readText(cursor: Cursor, closing: string | string[]): { text: string; markdown: boolean; close: string } {
  const closers = Array.isArray(closing) ? closing : [closing]
  cursor.skipSpaces()
  if (cursor.peek() === '"') {
    const start = cursor.pos
    const end = cursor.text.indexOf('"', start + 1)
    if (end < 0) throw cursor.error('The quoted text is not closed', 'Add the closing "')
    let text = cursor.text.slice(start + 1, end)
    let markdown = false
    if (text.startsWith('`') && text.endsWith('`') && text.length >= 2) {
      text = text.slice(1, -1)
      markdown = true
    }
    cursor.pos = end + 1
    cursor.skipSpaces()
    for (const c of closers) {
      if (cursor.eat(c)) return { text, markdown, close: c }
    }
    throw cursor.error(`Expected ${closers.join(' or ')} after the text`)
  }
  let best = -1
  let bestClose = ''
  for (const c of closers) {
    const at = cursor.text.indexOf(c, cursor.pos)
    if (at >= 0 && (best < 0 || at < best)) {
      best = at
      bestClose = c
    }
  }
  if (best < 0) throw cursor.error(`The shape is not closed: expected ${closers.join(' or ')}`)
  const text = cursor.text.slice(cursor.pos, best).trim()
  cursor.pos = best + bestClose.length
  return { text, markdown: false, close: bestClose }
}

function readEdge(cursor: Cursor): EdgeToken | null {
  const save = cursor.pos
  cursor.skipSpaces()

  // Text in the middle: `-- text -->`, `== text ==>`, `-. text .->`.
  const textual: { re: RegExp; stroke: Stroke }[] = [
    { re: /([<xo])?--(?![->.])\s*("[^"]*"|[^-|]+?)\s*(-{2,})([>xo]?)/u, stroke: 'normal' },
    { re: /([<xo])?==(?![=>])\s*("[^"]*"|[^=|]+?)\s*(={2,})([>xo]?)/u, stroke: 'thick' },
    { re: /([<xo])?-\.(?![-.])\s*("[^"]*"|[^.|]+?)\s*(\.+)-([>xo]?)/u, stroke: 'dotted' },
  ]
  for (const { re, stroke } of textual) {
    const at = cursor.pos
    const m = cursor.match(re)
    if (!m) continue
    const closing = m[3]!
    const endChar = m[4] ?? ''
    // `-- text --` with neither a head nor a third dash is not an edge.
    if (stroke !== 'dotted' && endChar === '' && closing.length < 3) {
      cursor.pos = at
      continue
    }
    if (endChar && /[xo]/.test(endChar) && !endsCleanly(cursor)) {
      cursor.pos = at
      continue
    }
    let text = m[2]!.trim()
    let markdown = false
    if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1)
    if (text.startsWith('`') && text.endsWith('`') && text.length >= 2) {
      text = text.slice(1, -1)
      markdown = true
    }
    const length = stroke === 'dotted' ? closing.length : Math.max(1, closing.length - (endChar ? 1 : 2))
    return { stroke, start: endKind(m[1]), end: endKind(endChar), length, text, markdown }
  }

  const plain: { re: RegExp; stroke: Stroke }[] = [
    { re: /~{3,}/, stroke: 'invisible' },
    { re: /([<xo])?-(\.+)-([>xo])?/, stroke: 'dotted' },
    { re: /([<xo])?(={2,})([>xo])?/, stroke: 'thick' },
    { re: /([<xo])?(-{2,})([>xo])?/, stroke: 'normal' },
  ]
  for (const { re, stroke } of plain) {
    const at = cursor.pos
    const m = cursor.match(re)
    if (!m) continue
    if (stroke === 'invisible') {
      return { stroke, start: 'none', end: 'none', length: Math.max(1, m[0].length - 2), markdown: false }
    }
    const body = m[2]!
    let endChar = m[3]
    if (endChar && /[xo]/.test(endChar) && !endsCleanly(cursor)) {
      // `-->oNode`: the letter starts the next name.
      cursor.pos -= 1
      endChar = undefined
    }
    // An open link needs three strokes; `--` alone is not an edge.
    if (!endChar && stroke !== 'dotted' && body.length < 3) {
      cursor.pos = at
      continue
    }
    const length =
      stroke === 'dotted' ? body.length : Math.max(1, body.length - (endChar ? 1 : 2))
    const token: EdgeToken = { stroke, start: endKind(m[1]), end: endKind(endChar), length, markdown: false }
    // `-->|text|`
    const pipe = cursor.match(/\s*\|\s*("[^"]*"|[^|]*?)\s*\|/)
    if (pipe) {
      let text = pipe[1]!.trim()
      if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1)
      if (text.startsWith('`') && text.endsWith('`') && text.length >= 2) {
        text = text.slice(1, -1)
        token.markdown = true
      }
      token.text = text
    }
    return token
  }
  cursor.pos = save
  return null
}

interface NodeRef {
  id: string
  /** Set when the statement gave the node text or a shape. */
  text?: string
  markdown?: boolean
  shape?: ShapeKind
  classes: string[]
}

function readNode(cursor: Cursor): NodeRef | null {
  cursor.skipSpaces()
  const m = cursor.match(ID)
  if (!m) return null
  const ref: NodeRef = { id: m[0], classes: [] }
  if (cursor.startsWith('@{')) {
    throw cursor.error('The @{ shape: … } node syntax is not supported', 'Use the bracket shapes, e.g. A([text]).')
  }
  for (const s of SHAPES) {
    if (!cursor.startsWith(s.open)) continue
    // `A-->B` must not read `>` of an arrow as an asymmetric shape.
    if (s.open === '>' && cursor.peek(-1) === '-') break
    cursor.pos += s.open.length
    const { text, markdown, close } = readText(cursor, s.close)
    ref.text = text
    ref.markdown = markdown
    ref.shape = typeof s.shape === 'function' ? s.shape(close) : s.shape
    break
  }
  const cls = cursor.match(/:::([\w-]+)/)
  if (cls) ref.classes.push(cls[1]!)
  return ref
}

function splitIds(list: string): string[] {
  return list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parseFlowchart(source: string): Flowchart {
  const list = statements(source, { semicolons: true })
  const head = list[0]
  const hm = head ? /^(flowchart|graph|flowchart-elk)\b\s*(\S*)\s*$/.exec(head.text) : null
  if (!head || !hm) {
    throw new DiagramError('A flowchart starts with "flowchart" or "graph"', head?.line ?? 1, 1)
  }
  let direction: Direction = 'TB'
  if (hm[2]) {
    const d = DIRECTIONS[hm[2].toUpperCase()]
    if (!d) throw new DiagramError(`"${hm[2]}" is not a direction`, head.line, head.column + hm[1]!.length + 1, 'Use TB, TD, BT, LR or RL.')
    direction = d
  }

  const chart: Flowchart = {
    type: 'flowchart',
    direction,
    nodes: new Map(),
    edges: [],
    subgraphs: new Map(),
    classDefs: new Map(),
    accessibility: {},
  }
  const stack: FlowSubgraph[] = []
  const pendingClasses: { ids: string[]; cls: string; s: Statement }[] = []
  const pendingStyles: { id: string; style: UserStyle; s: Statement }[] = []
  const pendingLinkStyles: { which: number[] | 'default'; style: UserStyle; s: Statement }[] = []
  const pendingClicks: { id: string; href: string; tooltip?: string; target?: string; s: Statement }[] = []
  let anonymousSubgraphs = 0

  const touch = (ref: NodeRef): FlowNode => {
    let node = chart.nodes.get(ref.id)
    if (!node) {
      node = { id: ref.id, text: ref.id, markdown: false, shape: 'rect', classes: [] }
      chart.nodes.set(ref.id, node)
    }
    if (ref.text !== undefined) {
      node.text = ref.text
      node.markdown = ref.markdown ?? false
    }
    if (ref.shape) node.shape = ref.shape
    node.classes.push(...ref.classes)
    const current = stack[stack.length - 1]
    // A node belongs to the first subgraph it is mentioned in; mentions at
    // the top level do not move it out.
    if (current && node.subgraph === undefined && !chart.subgraphs.has(ref.id)) node.subgraph = current.id
    return node
  }

  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const text = s.text
    const consumed = accessibilityStatement(list, i, chart.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }

    let m = /^subgraph\b\s*(.*)$/.exec(text)
    if (m) {
      const rest = m[1]!.trim()
      let id: string
      let title: string
      let markdown = false
      const withTitle = /^([\p{L}\p{N}_.-]+)\s*\[\s*(.*?)\s*\]$/u.exec(rest)
      if (withTitle) {
        id = withTitle[1]!
        title = withTitle[2]!
      } else if (rest.startsWith('"')) {
        title = rest
        id = `subgraph${anonymousSubgraphs++}`
      } else if (rest === '') {
        id = `subgraph${anonymousSubgraphs++}`
        title = ''
      } else {
        id = rest.replace(/\s+/g, '_')
        title = rest
      }
      if (title.startsWith('"') && title.endsWith('"') && title.length >= 2) title = title.slice(1, -1)
      if (title.startsWith('`') && title.endsWith('`') && title.length >= 2) {
        title = title.slice(1, -1)
        markdown = true
      }
      if (chart.subgraphs.has(id)) {
        throw new DiagramError(`Subgraph "${id}" is defined twice`, s.line, s.column)
      }
      const sub: FlowSubgraph = { id, title, markdown, parent: stack[stack.length - 1]?.id, classes: [] }
      chart.subgraphs.set(id, sub)
      // A subgraph whose id was used as a node before becomes the subgraph.
      chart.nodes.delete(id)
      stack.push(sub)
      continue
    }
    if (text === 'end') {
      if (stack.length === 0) throw new DiagramError('"end" without a subgraph', s.line, s.column)
      stack.pop()
      continue
    }
    m = /^direction\s+(\w+)$/.exec(text)
    if (m) {
      const d = DIRECTIONS[m[1]!.toUpperCase()]
      if (!d) throw new DiagramError(`"${m[1]}" is not a direction`, s.line, s.column + 10)
      const current = stack[stack.length - 1]
      if (current) current.direction = d
      else chart.direction = d
      continue
    }
    m = /^classDef\s+([\w,-]+)\s+(.+)$/.exec(text)
    if (m) {
      const style = parseStyle(m[2]!, s.line, s.column)
      for (const name of splitIds(m[1]!)) chart.classDefs.set(name, style)
      continue
    }
    m = /^class\s+(.+?)\s+([\w-]+)$/.exec(text)
    if (m) {
      pendingClasses.push({ ids: splitIds(m[1]!), cls: m[2]!, s })
      continue
    }
    m = /^style\s+(\S+)\s+(.+)$/.exec(text)
    if (m) {
      pendingStyles.push({ id: m[1]!, style: parseStyle(m[2]!, s.line, s.column), s })
      continue
    }
    m = /^linkStyle\s+(default|[\d\s,]+?)\s+(?:interpolate\s+\w+\s*)?(.*)$/.exec(text)
    if (m) {
      const which = m[1] === 'default' ? 'default' : splitIds(m[1]!).map(Number)
      pendingLinkStyles.push({ which, style: parseStyle(m[2] ?? '', s.line, s.column), s })
      continue
    }
    m = /^click\s+(\S+)\s+(.*)$/.exec(text)
    if (m) {
      const args = m[2]!
      const href = /^(?:href\s+)?"([^"]*)"(?:\s+"([^"]*)")?(?:\s+(_blank|_self|_parent|_top))?\s*$/.exec(args)
      if (href) {
        pendingClicks.push({ id: m[1]!, href: href[1]!, tooltip: href[2], target: href[3], s })
      }
      // `click id callback`: scripts from the diagram text are never run.
      continue
    }

    // A chain of node groups joined by edges.
    const cursor = new Cursor(s)
    let groups: NodeRef[][] = []
    const readGroup = (): NodeRef[] => {
      const group: NodeRef[] = []
      for (;;) {
        const node = readNode(cursor)
        if (!node) {
          throw cursor.error(group.length === 0 ? 'Expected a node' : 'Expected a node after "&"')
        }
        group.push(node)
        cursor.skipSpaces()
        if (!cursor.eat('&')) break
      }
      return group
    }
    groups.push(readGroup())
    const tokens: EdgeToken[] = []
    for (;;) {
      cursor.skipSpaces()
      if (cursor.done) break
      const edge = readEdge(cursor)
      if (!edge) throw cursor.error(`Unexpected "${cursor.rest()}"`, 'Expected an edge such as --> or the end of the line.')
      tokens.push(edge)
      groups.push(readGroup())
    }
    const resolved = groups.map((g) => g.map((ref) => (chart.subgraphs.has(ref.id) && !ref.shape ? ref.id : touch(ref).id)))
    tokens.forEach((t, k) => {
      for (const from of resolved[k]!) {
        for (const to of resolved[k + 1]!) {
          chart.edges.push({
            from,
            to,
            stroke: t.stroke,
            start: t.start,
            end: t.end,
            length: t.length,
            text: t.text,
            markdown: t.markdown,
          })
        }
      }
    })
    groups = []
  }
  if (stack.length > 0) {
    throw new DiagramError(`Subgraph "${stack[stack.length - 1]!.id}" is not closed`, 0, 0, 'Add "end".')
  }

  for (const c of pendingClasses) {
    for (const id of c.ids) {
      const target = chart.nodes.get(id) ?? chart.subgraphs.get(id)
      if (!target) throw new DiagramError(`class refers to an unknown node "${id}"`, c.s.line, c.s.column)
      target.classes.push(c.cls)
    }
  }
  for (const st of pendingStyles) {
    const target = chart.nodes.get(st.id) ?? chart.subgraphs.get(st.id)
    if (!target) throw new DiagramError(`style refers to an unknown node "${st.id}"`, st.s.line, st.s.column)
    target.style = st.style
  }
  for (const ls of pendingLinkStyles) {
    if (ls.which === 'default') {
      for (const e of chart.edges) e.style = { shape: { ...e.style?.shape, ...ls.style.shape }, text: { ...e.style?.text, ...ls.style.text } }
      continue
    }
    for (const index of ls.which) {
      const e = chart.edges[index]
      if (!e) throw new DiagramError(`linkStyle refers to edge ${index}, but there are ${chart.edges.length}`, ls.s.line, ls.s.column)
      e.style = ls.style
    }
  }
  for (const c of pendingClicks) {
    const node = chart.nodes.get(c.id)
    if (!node) throw new DiagramError(`click refers to an unknown node "${c.id}"`, c.s.line, c.s.column)
    const href = safeHref(c.href)
    if (href === null) {
      throw new DiagramError(`The link "${c.href}" is not allowed`, c.s.line, c.s.column, 'Use http(s), mailto or a relative address.')
    }
    node.link = { href, tooltip: c.tooltip, target: c.target }
  }
  for (const c of chart.classDefs.keys()) void c
  return chart
}
