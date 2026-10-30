/**
 * PlantUML use case, component and deployment diagrams — PlantUML calls them
 * "description" diagrams — read into the flowchart model: elements are
 * nodes with UML shapes, containers (`package P { … }`) are subgraphs with
 * a framed shape, links are edges.
 *
 *     @startuml
 *     actor Customer
 *     package Shop {
 *       (Place order) as PO
 *       [Orders] <<service>>
 *     }
 *     database DB
 *     Customer --> PO
 *     PO ..> [Orders] : uses
 *     [Orders] --> DB
 *     @enduml
 *
 * Supported: the element keywords (actor, usecase, component, interface,
 * node, cloud, database, queue, storage, artifact, card, file, folder, frame,
 * package, rectangle, agent, stack, hexagon, person, label, circle,
 * collections, boundary, control, entity) and the shorthands `:actor:`,
 * `(use case)`, `[component]`, `() interface`; aliases, stereotypes, colours;
 * containers nested to any depth; links with every line (`--`, `..`, `==`,
 * `~~`), head (`>`, `|>`, `*`, `o`, `+`, `>>`) and style (`[#red]`,
 * `[hidden]`, `[dashed]`, `[bold]`), direction words (`-up->`, …) and labels;
 * notes (on an element, floating, multi-line). A link of one dash is laid
 * out like one of two: elements are not yet put side by side.
 */
import { DiagramError } from '../core/errors'
import type { Statement } from '../core/scanner'
import type { ShapeKind } from '../core/shapes'
import { parseStyle, type UserStyle } from '../core/style'
import type { EdgeEnd, FlowEdge, FlowNode, Flowchart, FlowSubgraph, Stroke } from '../diagrams/flowchart/parser'
import { labelText, unquoted, type PlantUmlSource } from './source'

const ELEMENTS: Record<string, ShapeKind> = {
  actor: 'actor',
  usecase: 'usecase',
  component: 'component',
  interface: 'interface',
  node: 'node',
  cloud: 'cloud',
  database: 'cylinder',
  queue: 'queue',
  storage: 'storage',
  artifact: 'artifact',
  card: 'rect',
  file: 'file',
  folder: 'folder',
  frame: 'frame',
  package: 'folder',
  rectangle: 'rect',
  agent: 'rect',
  stack: 'stack',
  hexagon: 'hexagon',
  person: 'person',
  label: 'text',
  circle: 'circle',
  collections: 'collections',
  boundary: 'boundary',
  control: 'control',
  entity: 'entity',
}

/** A declaration by shorthand alone: `[Comp]`, `(Use)`, `:Actor:`, `() Iface`, with `as`, stereotype, colour, `{`. */
const SHORTHAND = /^(\[[^\]]+\]|\([^)]+\)|:[^:]+:|\(\)\s*("[^"]+"|\S+))(\s+as\s+("[^"]+"|\S+))?(\s*<<[^>]*>>)?(\s*#\S+)?\s*\{?$/

const KEYWORD = new RegExp(`^(${Object.keys(ELEMENTS).join('|')})/?\\s+(.*)$`, 'i')

/** A link endpoint: a shorthand element or a name. */
const ENDPOINT = String.raw`\[[^\]]+\]|\(\)\s*"[^"]+"|\(\)\s*[\p{L}\p{N}_.$]+|\([^)]+\)|:[^:]+:|"[^"]+"|[\p{L}\p{N}_.$@]+`
const LEFT_HEAD = String.raw`<\||<<|<|\*|o|\+|#|\^`
const RIGHT_HEAD = String.raw`\|>|>>|>|\*|o|\+|#|\^`
const BODY = String.raw`[-.=~]+(?:\[[^\]]*\])?(?:(?:up|down|left|right|le|ri|do|u|d|l|r)(?=[-.=~]))?[-.=~]*(?:\[[^\]]*\])?[-.=~]*`
const LINK = new RegExp(
  `^(?<a>${ENDPOINT})\\s*(?:"(?<ma>[^"]*)")?\\s*(?<lh>${LEFT_HEAD})?(?<body>${BODY})(?<rh>${RIGHT_HEAD})?\\s*(?:"(?<mb>[^"]*)")?\\s*(?<b>${ENDPOINT})\\s*(?::\\s*(?<text>.*))?$`,
  'u',
)

function headEnd(head: string | undefined): EdgeEnd {
  switch (head) {
    case undefined:
    case '':
    case '#':
      return 'none'
    case '>':
    case '<':
      return 'arrow'
    case '>>':
    case '<<':
    case '^':
      return 'open-arrow'
    case '|>':
    case '<|':
      return 'triangle'
    case '*':
      return 'diamond'
    case 'o':
      return 'diamond-open'
    case '+':
      return 'circle'
    default:
      return 'arrow'
  }
}

/** A colour written as `#red` or `#FFAA00`. */
function colour(token: string): string {
  const c = token.replace(/^#/, '')
  return /^[0-9a-fA-F]{3,8}$/.test(c) ? `#${c}` : c
}

interface Declared {
  name: string
  alias?: string
  stereotype?: string
  color?: string
  opens: boolean
  /** `node N [` — a description over the next lines, up to `]`. */
  description: boolean
}

/** Reads `NAME [as ALIAS] [<<stereo>>] [#color] [{|[]` after a keyword. */
function declaration(rest: string): Declared {
  let text = rest.trim()
  const out: Declared = { name: '', opens: false, description: false }
  if (text.endsWith('{')) {
    out.opens = true
    text = text.slice(0, -1).trim()
  } else if (text.endsWith('[') && !/\[[^\]]*$/.test(text.slice(0, -1))) {
    out.description = true
    text = text.slice(0, -1).trim()
  }
  let m = /\s*(#[\w]+)\s*$/.exec(text)
  if (m) {
    out.color = colour(m[1]!)
    text = text.slice(0, m.index).trim()
  }
  m = /\s*<<\s*(.*?)\s*>>\s*$/.exec(text)
  if (m) {
    out.stereotype = m[1]
    text = text.slice(0, m.index).trim()
  }
  // A one-line description: `node N [text]` is the shown text.
  m = /^(.+?)\s+\[([^\]]*)\]$/.exec(text)
  if (m) {
    out.alias = unquoted(m[1]!)
    out.name = m[2]!.trim()
    return out
  }
  m = /^(.+?)\s+as\s+(.+)$/i.exec(text)
  if (m) {
    const left = m[1]!.trim()
    const right = m[2]!.trim()
    // `"Long name" as L` or `L as "Long name"`.
    if (/^["[(:]/.test(left)) {
      out.name = strip(left)
      out.alias = unquoted(right)
    } else {
      out.alias = left
      out.name = strip(right)
    }
    return out
  }
  out.name = strip(text)
  return out
}

/** The text inside a shorthand or quotes. */
function strip(token: string): string {
  const t = token.trim()
  if (/^\[.*\]$/.test(t) || /^\(.*\)$/.test(t) || /^:.*:$/.test(t)) return t.slice(1, -1).trim()
  return unquoted(t)
}

class Reader {
  readonly chart: Flowchart = {
    type: 'flowchart',
    direction: 'TB',
    nodes: new Map(),
    edges: [],
    subgraphs: new Map(),
    classDefs: new Map(),
    accessibility: {},
  }

  /** Elements by alias and by shown name, as PlantUML resolves `[Name]`. */
  private readonly byName = new Map<string, string>()
  private readonly containers: string[] = []
  private notes = 0
  private hasUseCases = false

  constructor(private readonly list: Statement[]) {
    this.hasUseCases = list.some((s) => /^usecase\b|\([^)]+\)/i.test(s.text))
  }

  run(): Flowchart {
    for (let i = 0; i < this.list.length; i++) i = this.statement(i)
    if (this.containers.length > 0) {
      const id = this.containers[this.containers.length - 1]!
      throw new DiagramError(`"${this.chart.subgraphs.get(id)!.title || id}" is never closed`, 0, 0, 'Close it with "}".')
    }
    return this.chart
  }

  private statement(i: number): number {
    const s = this.list[i]!
    const t = s.text
    let m: RegExpExecArray | null

    if (t === '}') {
      if (this.containers.length === 0) throw new DiagramError('"}" without a container to close', s.line, s.column)
      this.containers.pop()
      return i
    }
    if (/^together\s*\{$/i.test(t)) {
      // Grouping for the layout only: its elements belong to the enclosing container.
      this.containers.push(this.containers[this.containers.length - 1] ?? '')
      return i
    }
    if (/^(note|hnote|rnote)\b/i.test(t)) return this.note(i)
    if ((m = KEYWORD.exec(t)) && !LINK.test(t)) {
      return this.element(i, ELEMENTS[m[1]!.toLowerCase()]!, m[2]!)
    }
    if ((m = LINK.exec(t))) {
      this.link(m.groups!, s)
      return i
    }
    // A shorthand on its own: `[Comp]`, `(Use)`, `:Actor:`, `() Iface`, with `as`, stereotype, colour.
    if (SHORTHAND.test(t)) {
      const shape: ShapeKind = t.startsWith('[') ? 'component' : t.startsWith('()') ? 'interface' : t.startsWith('(') ? 'usecase' : 'actor'
      return this.element(i, shape, t.startsWith('()') ? t.slice(2) : t)
    }
    throw new DiagramError(`"${t}" is not an element, a link or a note`, s.line, s.column)
  }

  private element(i: number, shape: ShapeKind, rest: string): number {
    const s = this.list[i]!
    const d = declaration(rest)
    let end = i
    if (d.description) {
      const lines: string[] = []
      for (end = i + 1; end < this.list.length && this.list[end]!.text !== ']'; end++) lines.push(this.list[end]!.text)
      if (end >= this.list.length) throw new DiagramError('This description is never closed', s.line, s.column, 'Close it with "]".')
      d.alias = d.alias ?? d.name
      d.name = lines.join('<br>')
    }
    if (d.name === '' && !d.alias) throw new DiagramError('An element needs a name', s.line, s.column)
    const id = d.alias ?? d.name
    const shown = labelText(d.name || id) + (d.stereotype ? `<br>«${d.stereotype}»` : '')
    const style: UserStyle | undefined = d.color ? parseStyle(`fill:${d.color}`, s.line, s.column) : undefined
    const parent = this.containers[this.containers.length - 1] || undefined
    if (d.opens) {
      const sub: FlowSubgraph = { id, title: shown, markdown: false, parent, classes: [], style, kind: shape === 'cylinder' ? 'rect' : shape }
      this.chart.subgraphs.set(id, sub)
      this.byName.set(id, id)
      if (d.name) this.byName.set(d.name, id)
      this.containers.push(id)
      return end
    }
    const node: FlowNode = { id, text: shown, markdown: false, shape, classes: [], style, subgraph: parent }
    const existing = this.chart.nodes.get(id)
    if (existing) Object.assign(existing, { text: shown, shape, style: style ?? existing.style })
    else this.chart.nodes.set(id, node)
    this.byName.set(id, id)
    if (d.name) this.byName.set(d.name, id)
    return end
  }

  /** The element a link endpoint names, declared on the spot when new. */
  private endpoint(token: string): string {
    const t = token.trim()
    let shape: ShapeKind = this.hasUseCases ? 'actor' : 'rect'
    let name: string
    if (t.startsWith('[')) {
      shape = 'component'
      name = t.slice(1, -1).trim()
    } else if (t.startsWith('()')) {
      shape = 'interface'
      name = unquoted(t.slice(2))
    } else if (t.startsWith('(')) {
      shape = 'usecase'
      name = t.slice(1, -1).trim()
    } else if (t.startsWith(':') && t.endsWith(':') && t.length > 1) {
      shape = 'actor'
      name = t.slice(1, -1).trim()
    } else {
      name = unquoted(t)
    }
    const known = this.byName.get(name)
    if (known !== undefined) return known
    if (this.chart.subgraphs.has(name)) return name
    this.chart.nodes.set(name, { id: name, text: labelText(name), markdown: false, shape, classes: [], subgraph: this.containers[this.containers.length - 1] || undefined })
    this.byName.set(name, name)
    return name
  }

  private link(g: Record<string, string | undefined>, s: Statement): void {
    let from = this.endpoint(g.a!)
    let to = this.endpoint(g.b!)
    const body = g.body!
    const styleText = /\[([^\]]*)\]/.exec(body)?.[1] ?? ''
    const words = styleText.split(/[,;]/).map((w) => w.trim().toLowerCase()).filter(Boolean)
    let stroke: Stroke = /^[.~]/.test(body) || /\.\.|~~/.test(body) ? 'dotted' : /=/.test(body) ? 'thick' : 'normal'
    if (words.includes('hidden')) stroke = 'invisible'
    else if (words.includes('dashed') || words.includes('dotted')) stroke = 'dotted'
    else if (words.includes('bold') || words.includes('thickness=2') || words.includes('thickness=3')) stroke = 'thick'
    let start = headEnd(g.lh)
    let end = headEnd(g.rh)
    // `-up->`: the target goes above, so the layout sees the edge reversed.
    const direction = /(?:^|[-.=~\]])(up|u)(?=[-.=~[])/i.test(body)
    if (direction) {
      ;[from, to] = [to, from]
      ;[start, end] = [end, start]
    }
    let style: UserStyle | undefined
    const color = words.find((w) => w.startsWith('#'))
    if (color) style = parseStyle(`stroke:${colour(color)}`, s.line, s.column)
    const parts = [g.ma, g.text?.trim(), g.mb].filter((p) => p !== undefined && p !== '')
    const text = g.text?.trim() ? labelText(g.text.trim()) : parts.length > 0 ? parts.join(' … ') : undefined
    const edge: FlowEdge = { from, to, stroke, start, end, length: 1, text, markdown: false, style }
    this.chart.edges.push(edge)
  }

  private note(i: number): number {
    const s = this.list[i]!
    const t = s.text
    let text: string | undefined
    let target: string | undefined
    let alias: string | undefined
    let m = /^[hr]?note\s+"([^"]*)"\s+as\s+(\S+)$/i.exec(t)
    if (m) {
      text = m[1]
      alias = m[2]
    } else if ((m = /^[hr]?note\s+as\s+(\S+)$/i.exec(t))) {
      alias = m[1]
    } else if ((m = /^[hr]?note\s+(left|right|top|bottom)(?:\s+of)?\s+(.+?)\s*(?:#\S+)?\s*(?::\s?(.*))?$/i.exec(t))) {
      target = this.endpoint(m[2]!)
      text = m[3]
    } else {
      throw new DiagramError(`"${t}" is not a note`, s.line, s.column, 'note right of X : text, note "text" as N')
    }
    let end = i
    if (text === undefined) {
      const lines: string[] = []
      for (end = i + 1; end < this.list.length && !/^end\s*[hr]?note$/i.test(this.list[end]!.text); end++) lines.push(this.list[end]!.text)
      if (end >= this.list.length) throw new DiagramError('This note is never closed', s.line, s.column, 'Close it with "end note".')
      text = lines.join('<br>')
    }
    const id = alias ?? `note-${++this.notes}`
    this.chart.nodes.set(id, { id, text: labelText(text), markdown: false, shape: 'note', classes: [], subgraph: this.containers[this.containers.length - 1] || undefined })
    this.byName.set(id, id)
    if (target) this.chart.edges.push({ from: target, to: id, stroke: 'dotted', start: 'none', end: 'none', length: 1, markdown: false })
    return end
  }
}

export function parsePlantUmlDescription(src: PlantUmlSource): Flowchart {
  const chart = new Reader(src.statements).run()
  if (src.direction === 'LR') chart.direction = 'LR'
  if (src.title) chart.accessibility.title = src.title
  return chart
}
