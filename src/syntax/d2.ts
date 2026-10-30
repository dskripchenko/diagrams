/**
 * D2, read into the flowchart model.
 *
 *     direction: right
 *     users: Users { shape: person }
 *     cloud: AWS {
 *       api: API
 *       db: Database { shape: cylinder }
 *       api -> db: SQL
 *     }
 *     users -> cloud.api: HTTPS
 *     cloud.db.style.fill: "#fde68a"
 *
 * Supported: shapes declared by key (`x`, `x: Label`), nested containers
 * (`a: Title { … }`) and dotted paths (`a.b.c`), so a key with children is a
 * frame; edges `->`, `<-`, `<->`, `--` in chains, with labels and a block of
 * edge attributes; attributes as keys (`x.shape: circle`, `x.style.fill:
 * red`) or in a block (`{ shape: circle; style.fill: red }`): `label`,
 * `shape`, `style.fill`, `style.stroke`, `style.font-color`,
 * `style.stroke-dash`, `style.stroke-width`, `style.opacity` (accepted),
 * `source-arrowhead` / `target-arrowhead` with `shape`; `direction` (up,
 * down, left, right); `#` comments; `;` between statements; quoted keys and
 * labels; block strings (`|md … |`) as text. Imports, variables, globs and
 * classes are refused with an error.
 */
import { DiagramError, tooLarge } from '../core/errors'
import type { ShapeKind } from '../core/shapes'
import { parseStyle } from '../core/style'
import type { EdgeEnd, Flowchart, Stroke } from '../diagrams/flowchart/parser'
import type { Direction } from '../layout/layered/types'

const SHAPES: Record<string, ShapeKind> = {
  rectangle: 'rect',
  square: 'rect',
  page: 'file',
  parallelogram: 'parallelogram',
  document: 'file',
  cylinder: 'cylinder',
  queue: 'queue',
  package: 'folder',
  step: 'asymmetric',
  callout: 'note',
  stored_data: 'storage',
  person: 'actor',
  diamond: 'rhombus',
  oval: 'usecase',
  circle: 'circle',
  hexagon: 'hexagon',
  cloud: 'cloud',
  text: 'text',
  code: 'rect',
  class: 'rect',
  sql_table: 'rect',
  image: 'rect',
}
const DIRECTIONS: Record<string, Direction> = { down: 'TB', up: 'BT', right: 'LR', left: 'RL' }
const HEADS: Record<string, EdgeEnd> = { triangle: 'triangle', arrow: 'arrow', diamond: 'diamond-open', 'filled-diamond': 'diamond', circle: 'circle', 'filled-circle': 'circle', box: 'arrow', 'filled-box': 'arrow', 'cf-one': 'arrow', 'cf-many': 'open-arrow', 'cf-one-required': 'arrow', 'cf-many-required': 'open-arrow', cross: 'cross' }

const MAX_NODES = 500
/** Joins the parts of a full path; one that never appears in a D2 name and is valid in XML. */
const SEP = '›'

interface Statement {
  text: string
  /** The statements in a trailing `{ … }`. */
  block?: Statement[]
  line: number
  column: number
}

/** Splits D2 into statements: newlines and `;` at depth 0; a `{ … }` belongs to the statement before it. */
function statementsOf(source: string): Statement[] {
  let i = 0
  let line = 1
  let col = 1
  const step = () => {
    if (source[i] === '\n') {
      line++
      col = 1
    } else col++
    i++
  }
  const parse = (closing: boolean): Statement[] => {
    const out: Statement[] = []
    let cur = ''
    let start = { line, column: col }
    const flush = (block?: Statement[]) => {
      const text = cur.trim()
      if (text || block) out.push({ text, block, ...start })
      cur = ''
    }
    while (i < source.length) {
      const ch = source[i]!
      // A comment starts a line or follows a space: `#` inside a word is text (`#fff`).
      if (ch === '#' && (cur.trim() === '' || /\s$/.test(cur))) {
        while (i < source.length && source[i] !== '\n') step()
        continue
      }
      if (ch === '"' || ch === "'") {
        const q = ch
        cur += ch
        step()
        while (i < source.length && source[i] !== q) {
          if (source[i] === '\\') {
            cur += source[i]
            step()
          }
          cur += source[i]
          step()
        }
        cur += q
        step()
        continue
      }
      if (ch === '|' && /:\s*$/.test(cur)) {
        // A block string: `|md … |`, `|| … ||`; its text is the label.
        const m = /^(\|+)(\w*)/.exec(source.slice(i))!
        const fence = m[1]!
        const j = i + m[0].length
        const end = source.indexOf(fence, j)
        if (end < 0) throw new DiagramError('A block string is never closed', line, col, `Close it with "${fence}".`)
        // Line by line: markdown marks out, blank lines dropped.
        const text = source
          .slice(j, end)
          .split('\n')
          .map((l) => l.replace(/^\s*#+\s*/, '').replace(/[*_`]/g, '').trim())
          .filter(Boolean)
          .join('<br>')
        cur += JSON.stringify(text)
        while (i < end + fence.length) step()
        continue
      }
      if (ch === '{') {
        step()
        const block = parse(true)
        flush(block)
        start = { line, column: col }
        continue
      }
      if (ch === '}') {
        if (!closing) throw new DiagramError('"}" without a "{"', line, col)
        flush()
        step()
        return out
      }
      if (ch === '\n' || ch === ';') {
        flush()
        step()
        start = { line, column: col }
        continue
      }
      if (cur === '') start = { line, column: col }
      cur += ch
      step()
    }
    if (closing) throw new DiagramError('A "{" is never closed', line, col, 'Close it with "}".')
    flush()
    return out
  }
  return parse(false)
}

/** Splits a key path on dots outside quotes: `a."b.c".d` → a, b.c, d. */
function path(text: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  for (const ch of text.trim()) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '.') {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

function value(text: string): string {
  const t = text.trim()
  if (/^".*"$/.test(t)) {
    try {
      return JSON.parse(t) as string
    } catch {
      return t.slice(1, -1)
    }
  }
  return /^'.*'$/.test(t) ? t.slice(1, -1) : t
}

/** Splits `a -> b <- c: label` into endpoints and arrows, outside quotes. */
function edgeParts(text: string): { ends: string[]; arrows: string[]; label?: string } | null {
  const parts: string[] = []
  const arrows: string[] = []
  let cur = ''
  let quote: string | null = null
  let label: string | undefined
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quote) {
      if (ch === quote) quote = null
      cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
      continue
    }
    const arrow = /^(<->|<-|->|--)/.exec(text.slice(i))
    if (arrow) {
      parts.push(cur)
      arrows.push(arrow[1]!)
      cur = ''
      i += arrow[1]!.length - 1
      continue
    }
    if (ch === ':' && arrows.length > 0) {
      label = text.slice(i + 1)
      break
    }
    cur += ch
  }
  parts.push(cur)
  if (arrows.length === 0) return null
  return { ends: parts.map((p) => p.trim()), arrows, label: label === undefined ? undefined : value(label) }
}

class Reader {
  readonly chart: Flowchart = { type: 'flowchart', direction: 'TB', nodes: new Map(), edges: [], subgraphs: new Map(), classDefs: new Map(), accessibility: {} }
  /** Every shape by its full path, with what was said about it. */
  private readonly shapes = new Map<string, { label?: string; shape?: ShapeKind; style: string[]; direction?: Direction; line: number; column: number }>()
  private readonly edges: { from: string; to: string; arrow: string; label?: string; attrs: Map<string, string> }[] = []

  run(list: Statement[]): Flowchart {
    this.block(list, [])
    // A shape with children is a frame; the others are nodes.
    const ids = [...this.shapes.keys()]
    const parentOf = (id: string) => (id.includes(SEP) ? id.slice(0, id.lastIndexOf(SEP)) : undefined)
    const hasChildren = new Set(ids.map(parentOf).filter((p): p is string => p !== undefined))
    if (ids.length > MAX_NODES) throw tooLarge('shapes', ids.length, MAX_NODES)
    for (const id of ids) {
      const s = this.shapes.get(id)!
      const name = id.split(SEP).pop()!
      const style = s.style.length > 0 ? parseStyle(s.style.join(','), s.line, s.column) : undefined
      if (hasChildren.has(id)) {
        this.chart.subgraphs.set(id, { id, title: s.label ?? name, markdown: false, parent: parentOf(id), direction: s.direction, classes: [], style, kind: s.shape === 'cloud' || s.shape === 'folder' ? s.shape : 'rect' })
      } else {
        this.chart.nodes.set(id, { id, text: s.label ?? name, markdown: false, shape: s.shape ?? 'rect', classes: [], subgraph: parentOf(id), style })
      }
    }
    for (const e of this.edges) {
      const [from, to] = e.arrow === '<-' ? [e.to, e.from] : [e.from, e.to]
      const dash = e.attrs.get('style.stroke-dash')
      const stroke: Stroke = Number(e.attrs.get('style.opacity') ?? 1) === 0 ? 'invisible' : dash && Number(dash) > 0 ? 'dotted' : Number(e.attrs.get('style.stroke-width') ?? 2) >= 4 ? 'thick' : 'normal'
      const head = (key: string, fallback: EdgeEnd) => HEADS[e.attrs.get(`${key}.shape`) ?? ''] ?? fallback
      const both = e.arrow === '<->'
      const color = e.attrs.get('style.stroke')
      this.chart.edges.push({
        from,
        to,
        stroke,
        start: both ? head('source-arrowhead', 'arrow') : 'none',
        end: e.arrow === '--' ? 'none' : head('target-arrowhead', 'arrow'),
        length: 1,
        text: e.label ?? e.attrs.get('label'),
        markdown: false,
        style: color ? parseStyle(`stroke:${color}`, 0, 0) : undefined,
      })
    }
    return this.chart
  }

  /** The full id of a path written inside `scope`. */
  private id(scope: string[], keys: string[], s: Statement): string {
    const full = [...scope, ...keys]
    for (const k of full) if (k === '') throw new DiagramError('An empty name', s.line, s.column)
    // Every prefix is a shape too: `a.b` makes `a` a container.
    for (let n = 1; n <= full.length; n++) {
      const id = full.slice(0, n).join(SEP)
      if (!this.shapes.has(id)) this.shapes.set(id, { style: [], line: s.line, column: s.column })
    }
    return full.join(SEP)
  }

  private block(list: Statement[], scope: string[]): void {
    for (const s of list) {
      if (/^(\.\.\.@|@)|:\s*(\.\.\.)?@|^vars\s*:|^classes\s*:|^imports?\s*:|\*|^\(/.test(s.text)) {
        throw new DiagramError(`"${s.text}" is not supported (imports, variables, classes, globs, edge references)`, s.line, s.column)
      }
      const edge = edgeParts(s.text)
      if (edge) {
        const ids = edge.ends.map((e) => {
          if (/^\(.*\)/.test(e)) throw new DiagramError('Edge references ("(a -> b)[0]") are not supported', s.line, s.column)
          return this.id(scope, path(e), s)
        })
        const attrs = new Map<string, string>()
        for (const b of s.block ?? []) {
          const kv = /^([^:]+):\s*(.*)$/.exec(b.text)
          if (kv) attrs.set(kv[1]!.trim(), value(kv[2]!))
        }
        for (let k = 0; k < edge.arrows.length; k++) this.edges.push({ from: ids[k]!, to: ids[k + 1]!, arrow: edge.arrows[k]!, label: k === edge.arrows.length - 1 ? edge.label : undefined, attrs })
        continue
      }
      const kv = /^((?:"[^"]*"|'[^']*'|[^:])+?)\s*(?::\s*(.*))?$/.exec(s.text)
      if (!kv) throw new DiagramError(`"${s.text}" is not a D2 statement`, s.line, s.column)
      const keys = path(kv[1]!)
      const raw = kv[2]
      if (keys.length === 1 && keys[0] === 'direction' && raw !== undefined) {
        const dir = DIRECTIONS[value(raw).toLowerCase()]
        if (!dir) throw new DiagramError(`"${raw}" is not a direction`, s.line, s.column, 'up, down, left, right')
        if (scope.length === 0) this.chart.direction = dir
        else this.shapes.get(scope.join(SEP))!.direction = dir
        continue
      }
      // An attribute path: `x.shape`, `x.style.fill`, `x.label`, or one inside a block.
      const attrAt = keys.findIndex((k) => ['shape', 'label', 'style', 'icon', 'tooltip', 'link', 'near', 'width', 'height', 'constraint', 'source-arrowhead', 'target-arrowhead', 'tooltip'].includes(k))
      if (attrAt >= 0) {
        if (attrAt === 0 && scope.length === 0) throw new DiagramError(`"${keys.join('.')}" needs a shape to belong to`, s.line, s.column)
        const owner = attrAt === 0 ? scope.join(SEP) : this.id(scope, keys.slice(0, attrAt), s)
        this.attribute(owner, keys.slice(attrAt).join('.'), raw === undefined ? '' : value(raw), s)
        for (const b of s.block ?? []) this.blockAttr(owner, keys.slice(attrAt).join('.'), b)
        continue
      }
      const id = this.id(scope, keys, s)
      if (raw !== undefined && raw.trim() !== '') this.shapes.get(id)!.label = value(raw)
      if (s.block) this.block(s.block, id.split(SEP))
    }
  }

  /** `style { fill: red }` and the like: attributes of an attribute group. */
  private blockAttr(owner: string, prefix: string, b: Statement): void {
    const kv = /^([^:]+):\s*(.*)$/.exec(b.text)
    if (kv) this.attribute(owner, `${prefix}.${kv[1]!.trim()}`, value(kv[2]!), b)
  }

  private attribute(owner: string, key: string, raw: string, s: Statement): void {
    const shape = this.shapes.get(owner)!
    const color = (v: string) => (/^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$/.test(v) ? v : undefined)
    switch (key) {
      case 'shape': {
        const k = raw.toLowerCase()
        if (!SHAPES[k]) throw new DiagramError(`"${raw}" is not a D2 shape`, s.line, s.column, Object.keys(SHAPES).join(', '))
        shape.shape = SHAPES[k]
        return
      }
      case 'label':
        shape.label = raw
        return
      case 'style.fill':
        if (color(raw)) shape.style.push(`fill:${raw}`)
        return
      case 'style.stroke':
        if (color(raw)) shape.style.push(`stroke:${raw}`)
        return
      case 'style.font-color':
        if (color(raw)) shape.style.push(`color:${raw}`)
        return
      case 'style.stroke-dash':
        if (Number(raw) > 0) shape.style.push('stroke-dasharray:5 4')
        return
      case 'style.stroke-width':
        if (Number(raw) > 0) shape.style.push(`stroke-width:${Math.min(10, Number(raw))}px`)
        return
      default:
        // icon, tooltip, link, near, width, height, opacity, shadow… : accepted, not drawn.
        return
    }
  }
}

/** True when the source looks like D2: key–value or edge statements and no other syntax's header. */
export function looksLikeD2(source: string): boolean {
  const first = source.split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '' && !l.startsWith('#'))
  if (!first) return false
  return /^(direction\s*:|[\w".-]+\s*(->|<-|<->|--)\s*[\w".-]|[\w".-]+\s*:\s*[^{]*\{?\s*$|[\w".-]+\s*\{\s*$)/.test(first)
}

export function parseD2(source: string): Flowchart {
  const list = statementsOf(source)
  if (list.length === 0) throw new DiagramError('The diagram is empty', 0, 0)
  return new Reader().run(list)
}
