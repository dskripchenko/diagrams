/**
 * PlantUML activity diagrams (the current syntax), read into the flowchart
 * model: actions are rounded boxes, conditions diamonds, forks bars, and the
 * flow is wired as it is read — every statement connects to the loose ends
 * the previous ones left.
 *
 *     @startuml
 *     start
 *     :Receive order;
 *     if (In stock?) then (yes)
 *       :Ship;
 *     else (no)
 *       :Back-order;
 *     endif
 *     stop
 *     @enduml
 *
 * Supported: start, stop, end, kill, detach; actions over one or more lines
 * (`:text;`, any SDL ending), with a colour (`#pink:text;`); if / elseif /
 * else / endif; while / endwhile; repeat / repeat while; fork / fork again /
 * end fork / end merge; split / split again / end split; partition and group;
 * arrow labels and styles (`-> text;`, `-[#red,dashed]->`); notes;
 * swimlanes (`|Lane|`, `|#color|Lane|`), drawn as labelled frames around
 * their actions rather than full-height columns.
 */
import { DiagramError } from '../core/errors'
import type { Statement } from '../core/scanner'
import type { ShapeKind } from '../core/shapes'
import { parseStyle, type UserStyle } from '../core/style'
import type { FlowEdge, Flowchart, Stroke } from '../diagrams/flowchart/parser'
import { labelText, type PlantUmlSource } from './source'

/** A loose end: the node the next statement connects from, and the label that edge carries. */
interface Tail {
  id: string
  label?: string
}

/** The SDL endings of an action: `;` and the shapes PlantUML draws for `|`, `<`, `>`, `/`, `]`, `}`. */
const ACTION_END = /[;|<>/\]}]$/

/** Joins actions and notes written over several lines into one statement each. */
function joinLines(list: readonly Statement[]): Statement[] {
  const out: Statement[] = []
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!
    const action = /^(#\S+\s*)?:/.test(s.text) && !ACTION_END.test(s.text)
    const note = /^(floating\s+)?note\s+(left|right)\s*(#\S+)?$/i.test(s.text)
    if (!action && !note) {
      out.push(s)
      continue
    }
    const parts = [s.text]
    let k = i + 1
    for (; k < list.length; k++) {
      const t = list[k]!.text
      if (action) {
        parts.push(t)
        if (ACTION_END.test(t)) break
      } else {
        if (/^end\s*note$/i.test(t)) break
        parts.push(t)
      }
    }
    if (k >= list.length) {
      throw new DiagramError(action ? 'This action is never closed' : 'This note is never closed', s.line, s.column, action ? 'End it with ";".' : 'Close it with "end note".')
    }
    out.push({ ...s, text: action ? parts.join('\n') : `${parts[0]} : ${parts.slice(1).join('\n')}` })
    i = k
  }
  return out
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

  private count = 0
  private i = 0
  private readonly partitions: string[] = []
  /** The current swimlane: a subgraph every action outside a partition joins. */
  private lane: string | undefined
  private readonly lanes = new Map<string, string>()
  /** `-> label;` and `-[style]->` before the next connection. */
  private pending: { label?: string; stroke?: Stroke; style?: UserStyle } = {}
  private readonly list: Statement[]

  constructor(list: readonly Statement[]) {
    this.list = joinLines(list)
  }

  run(): Flowchart {
    const { stop } = this.block([], [])
    if (stop) {
      const s = this.list[this.i]!
      throw new DiagramError(`"${s.text}" has no block to close`, s.line, s.column)
    }
    if (this.partitions.length > 0) throw new DiagramError('A partition is never closed', 0, 0, 'Close it with "}".')
    return this.chart
  }

  private node(shape: ShapeKind, text: string, style?: UserStyle): string {
    const id = `a${++this.count}`
    this.chart.nodes.set(id, { id, text, markdown: false, shape, classes: [], style, subgraph: this.partitions[this.partitions.length - 1] ?? this.lane })
    return id
  }

  private connect(tails: readonly Tail[], to: string): void {
    for (const t of tails) {
      const edge: FlowEdge = {
        from: t.id,
        to,
        stroke: this.pending.stroke ?? 'normal',
        start: 'none',
        end: 'arrow',
        length: 1,
        text: t.label ?? this.pending.label,
        markdown: false,
        style: this.pending.style,
      }
      this.chart.edges.push(edge)
    }
    this.pending = {}
  }

  /** Adds a node after the loose ends; it becomes the only loose end. */
  private step(tails: readonly Tail[], shape: ShapeKind, text: string, style?: UserStyle): { id: string; tails: Tail[] } {
    const id = this.node(shape, text, style)
    this.connect(tails, id)
    return { id, tails: [{ id }] }
  }

  /**
   * Reads statements until one matching `until` (left for the caller) or the
   * end; returns the loose ends and the statement that stopped the block.
   */
  private block(tails: Tail[], until: RegExp[]): { tails: Tail[]; stop: Statement | null } {
    for (; this.i < this.list.length; this.i++) {
      const s = this.list[this.i]!
      if (until.some((r) => r.test(s.text))) return { tails, stop: s }
      tails = this.statement(s, tails)
    }
    return { tails, stop: null }
  }

  private statement(s: Statement, tails: Tail[]): Tail[] {
    const t = s.text
    let m: RegExpExecArray | null

    if (/^start$/i.test(t)) return this.step(tails, 'start', '').tails
    if (/^(stop|end)$/i.test(t)) {
      this.step(tails, 'end', '')
      return []
    }
    if (/^(kill|detach)$/i.test(t)) return []
    if ((m = /^(#\S+?)?\s*:([\s\S]*?)[;|<>/\]}]$/.exec(t)) && t.trimStart().match(/^(#\S+\s*)?:/)) {
      const style = m[1] ? parseStyle(`fill:${colour(m[1])}`, s.line, s.column) : undefined
      return this.step(tails, 'round', labelText(m[2]!.trim()).replace(/\n/g, '<br>'), style).tails
    }
    if ((m = /^-+(?:\[([^\]]*)\])?-*>\s*(.*?);?$/.exec(t))) {
      const words = (m[1] ?? '').split(/[,;]/).map((w) => w.trim().toLowerCase()).filter(Boolean)
      if (m[2]) this.pending.label = labelText(m[2].trim())
      if (words.includes('hidden')) this.pending.stroke = 'invisible'
      else if (words.includes('dashed') || words.includes('dotted')) this.pending.stroke = 'dotted'
      else if (words.includes('bold')) this.pending.stroke = 'thick'
      const color = words.find((w) => w.startsWith('#'))
      if (color) this.pending.style = parseStyle(`stroke:${colour(color)}`, s.line, s.column)
      return tails
    }
    if ((m = /^if\s*\((.*?)\)\s*(?:is\s*\((.*?)\)\s*)?then(?:\s*\((.*)\))?$/i.exec(t))) return this.ifBlock(s, tails, m[1]!, m[3] ?? m[2])
    if ((m = /^while\s*\((.*?)\)(?:\s*is\s*\((.*)\))?$/i.exec(t))) return this.whileBlock(s, tails, m[1]!, m[2])
    if (/^repeat$/i.test(t)) return this.repeatBlock(s, tails)
    if (/^(fork|split)$/i.test(t)) return this.forkBlock(s, tails, t.toLowerCase() as 'fork' | 'split')
    if ((m = /^(partition|group)\s+(.*?)\s*(\{)?$/i.exec(t))) return this.partition(s, tails, m[1]!.toLowerCase(), m[2]!, !!m[3])
    if ((m = /^(?:floating\s+)?note\s+(left|right)\s*(?:#\S+)?\s*:\s?([\s\S]*)$/i.exec(t))) {
      const id = this.node('note', labelText(m[2]!.trim()).replace(/\n/g, '<br>'))
      const target = tails[tails.length - 1]
      if (target) this.chart.edges.push({ from: target.id, to: id, stroke: 'dotted', start: 'none', end: 'none', length: 1, markdown: false })
      return tails
    }
    if ((m = /^\|(?:(#[^|]+)\|)?([^|]+)\|$/.exec(t))) {
      const name = m[2]!.trim()
      let id = this.lanes.get(name)
      if (!id) {
        id = `lane${this.lanes.size + 1}`
        this.lanes.set(name, id)
        const style = m[1] ? parseStyle(`fill:${colour(m[1])}`, s.line, s.column) : undefined
        this.chart.subgraphs.set(id, { id, title: labelText(name), markdown: false, classes: [], style, kind: 'rect' })
      }
      this.lane = id
      return tails
    }
    if (/^\(\*\)/.test(t)) {
      throw new DiagramError('The old activity syntax ((*) --> …) is not supported', s.line, s.column, 'Write start, :action;, stop.')
    }
    throw new DiagramError(`"${t.split('\n')[0]}" is not an activity statement`, s.line, s.column)
  }

  private ifBlock(s: Statement, tails: Tail[], cond: string, yes: string | undefined): Tail[] {
    let diamond = this.step(tails, 'rhombus', labelText(cond)).id
    let branchLabel = yes ? labelText(yes) : undefined
    const ends: Tail[] = []
    for (;;) {
      this.i++
      const r = this.block([{ id: diamond, label: branchLabel }], [/^elseif\b/i, /^else\b/i, /^end\s*if$/i])
      ends.push(...r.tails)
      if (!r.stop) throw new DiagramError('This "if" is never closed', s.line, s.column, 'Close it with "endif".')
      const m = /^elseif\s*\((.*?)\)\s*(?:is\s*\((.*?)\)\s*)?then(?:\s*\((.*)\))?$/i.exec(r.stop.text)
      if (m) {
        // The previous condition's "no" leads to the next one.
        const next = this.node('rhombus', labelText(m[1]!))
        this.chart.edges.push({ from: diamond, to: next, stroke: 'normal', start: 'none', end: 'arrow', length: 1, markdown: false })
        diamond = next
        branchLabel = m[3] ?? m[2] ? labelText((m[3] ?? m[2])!) : undefined
        continue
      }
      const e = /^else\b\s*(?:\((.*)\))?$/i.exec(r.stop.text)
      if (e) {
        this.i++
        const rest = this.block([{ id: diamond, label: e[1] ? labelText(e[1]) : undefined }], [/^end\s*if$/i])
        if (!rest.stop) throw new DiagramError('This "if" is never closed', s.line, s.column, 'Close it with "endif".')
        ends.push(...rest.tails)
        return ends
      }
      // endif without else: the last condition's "no" goes on.
      ends.push({ id: diamond })
      return ends
    }
  }

  private whileBlock(s: Statement, tails: Tail[], cond: string, yes: string | undefined): Tail[] {
    const diamond = this.step(tails, 'rhombus', labelText(cond)).id
    this.i++
    const body = this.block([{ id: diamond, label: yes ? labelText(yes) : undefined }], [/^end\s*while\b/i])
    if (!body.stop) throw new DiagramError('This "while" is never closed', s.line, s.column, 'Close it with "endwhile".')
    this.connect(body.tails, diamond)
    const m = /^end\s*while\s*(?:\((.*)\))?$/i.exec(body.stop.text)
    return [{ id: diamond, label: m?.[1] ? labelText(m[1]) : undefined }]
  }

  private repeatBlock(s: Statement, tails: Tail[]): Tail[] {
    const entry = this.step(tails, 'choice', '').id
    this.i++
    const body = this.block([{ id: entry }], [/^repeat\s+while\b/i])
    if (!body.stop) throw new DiagramError('This "repeat" is never closed', s.line, s.column, 'Close it with "repeat while (condition)".')
    const m = /^repeat\s+while\s*\((.*?)\)(?:\s*is\s*\((.*?)\))?(?:\s*not\s*\((.*?)\))?\s*$/i.exec(body.stop.text)
    if (!m) throw new DiagramError(`"${body.stop.text}" is not a repeat condition`, body.stop.line, body.stop.column, 'repeat while (more?) is (yes) not (no)')
    const diamond = this.step(body.tails, 'rhombus', labelText(m[1]!)).id
    this.chart.edges.push({ from: diamond, to: entry, stroke: 'normal', start: 'none', end: 'arrow', length: 1, text: m[2] ? labelText(m[2]) : undefined, markdown: false })
    return [{ id: diamond, label: m[3] ? labelText(m[3]) : undefined }]
  }

  private forkBlock(s: Statement, tails: Tail[], kind: 'fork' | 'split'): Tail[] {
    const start = kind === 'fork' ? [{ id: this.step(tails, 'fork', '').id }] : tails
    const ends: Tail[] = []
    const again = kind === 'fork' ? /^fork\s+again$/i : /^split\s+again$/i
    const close = kind === 'fork' ? /^end\s*(fork|merge)\b/i : /^end\s*split$/i
    for (;;) {
      this.i++
      const r = this.block([...start], [again, close])
      ends.push(...r.tails)
      if (!r.stop) throw new DiagramError(`This "${kind}" is never closed`, s.line, s.column, `Close it with "end ${kind}".`)
      if (again.test(r.stop.text)) continue
      if (kind === 'fork' && /^end\s*fork/i.test(r.stop.text)) return [{ id: this.step(ends, 'fork', '').id }]
      return ends
    }
  }

  private partition(s: Statement, tails: Tail[], word: string, title: string, brace: boolean): Tail[] {
    const id = `p${++this.count}`
    this.chart.subgraphs.set(id, { id, title: labelText(title.replace(/^"|"$/g, '')), markdown: false, parent: this.partitions[this.partitions.length - 1] ?? this.lane, classes: [], kind: word === 'group' ? 'rect' : 'frame' })
    this.partitions.push(id)
    this.i++
    const close = brace || word === 'partition' ? [/^\}$/, /^end\s*(partition|group)$/i] : [/^end\s*group$/i]
    const r = this.block(tails, close)
    if (!r.stop) throw new DiagramError(`This ${word} is never closed`, s.line, s.column, brace ? 'Close it with "}".' : `Close it with "end ${word}".`)
    this.partitions.pop()
    return r.tails
  }
}

function colour(token: string): string {
  const c = token.replace(/^#/, '')
  return /^[0-9a-fA-F]{3,8}$/.test(c) ? `#${c}` : c
}

export function parsePlantUmlActivity(src: PlantUmlSource): Flowchart {
  const chart = new Reader(src.statements).run()
  if (src.title) chart.accessibility.title = src.title
  return chart
}
