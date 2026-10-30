/**
 * PlantUML sequence diagrams, read into the sequence model.
 *
 *     @startuml
 *     actor User
 *     participant "Web app" as Web
 *     database DB
 *     User -> Web ++ : open
 *     Web -> DB : query
 *     return rows
 *     @enduml
 *
 * Supported: the participant kinds (participant, actor, boundary, control,
 * entity, database, collections, queue) with quoted names, aliases and
 * stereotypes; creation on first use; the arrows (`->`, `-->`, `->>`, `-\`,
 * `->x`, `<-`, `<->`, `-[#red]>`, …) with `++ -- ** !!`; activate,
 * deactivate, create, destroy, return; notes (left, right, over, across,
 * multi-line); ref; alt/else, opt, loop, par, break, critical, group; box;
 * `== divider ==`, `...` delays, `|||` space; autonumber; hide footbox.
 */
import { DiagramError } from '../core/errors'
import type { Statement } from '../core/scanner'
import type {
  ArrowHead,
  BlockKind,
  Participant,
  ParticipantKind,
  SequenceDiagram,
} from '../diagrams/sequence/parser'
import { labelText, unquoted, type PlantUmlSource } from './source'

const KINDS = 'participant|actor|boundary|control|entity|database|collections|queue'
const DECLARE = new RegExp(`^(create\\s+)?(${KINDS})\\s+(.+)$`, 'i')
const NAME = String.raw`"[^"]+"|[\p{L}\p{N}_.@$]+`
const ARROW = String.raw`[ox]?(?:<<|<|\\\\|/)?-+(?:\[[^\]]*\])?-*(?:>>|>|\\\\|/)?[ox]?`
const MESSAGE = new RegExp(
  `^(?<from>${NAME}|\\[)?\\s*(?<arrow>${ARROW})\\s*(?<to>${NAME}|\\])\\s*(?<mods>(?:\\+\\+|--|\\*\\*|!!|\\s)*)\\s*(?::\\s?(?<text>.*))?$`,
  'u',
)

/** A message's arrow, read: who sends, the line, the heads. */
function readArrow(arrow: string): { dotted: boolean; head: ArrowHead; left: boolean; right: boolean } {
  const body = arrow.replace(/\[[^\]]*\]/, '')
  const left = /^[ox]?(<<|<|\\|\/)/.test(body)
  const right = /(>>|>|\\|\/)[ox]?$/.test(body)
  const dotted = /--/.test(body)
  let head: ArrowHead = 'arrow'
  if (/>>|<</.test(body)) head = 'open'
  if (/x$|^x/.test(body)) head = 'cross'
  return { dotted, head, left, right }
}

interface OpenBlock {
  block: BlockKind | 'box'
  line: number
}

class Reader {
  readonly diagram: SequenceDiagram = { type: 'sequence', participants: [], boxes: [], events: [], accessibility: {} }
  private readonly byId = new Map<string, Participant>()
  private readonly stack: OpenBlock[] = []
  /** Calls awaiting a `return`: the caller and the participant it activated. */
  private readonly calls: { caller: string; callee: string }[] = []
  private numbering: { next: number; step: number } | null = null
  private paused: { next: number; step: number } | null = null
  private currentBox: number | null = null
  private last: { from: string; to: string } | null = null

  constructor(private readonly list: Statement[]) {}

  run(): SequenceDiagram {
    for (let i = 0; i < this.list.length; i++) i = this.statement(i)
    const open = this.stack[this.stack.length - 1]
    if (open) {
      throw new DiagramError(`The "${open.block}" opened here is never closed`, open.line, 0, open.block === 'box' ? 'Close it with "end box".' : 'Close it with "end".')
    }
    return this.diagram
  }

  /** Reads the statement at `i`; returns the index of the last statement it consumed. */
  private statement(i: number): number {
    const s = this.list[i]!
    const t = s.text
    let m: RegExpExecArray | null

    if ((m = DECLARE.exec(t))) {
      this.declare(m[3]!, m[2]!.toLowerCase() as ParticipantKind, !!m[1], s)
      return i
    }
    if ((m = /^create\s+(.+)$/i.exec(t))) {
      this.declare(m[1]!, 'participant', true, s)
      return i
    }
    if ((m = /^autonumber\b\s*(.*)$/i.exec(t))) {
      this.autonumber(m[1]!.trim(), s)
      return i
    }
    if ((m = /^(activate|deactivate)\s+(.+?)(?:\s+#\S+)?$/i.exec(t))) {
      const id = this.use(m[2]!, s)
      if (m[1]!.toLowerCase() === 'activate') {
        if (this.last && this.last.to === id) this.calls.push({ caller: this.last.from, callee: id })
        this.diagram.events.push({ kind: 'activate', actor: id, sourceLine: s.line })
      } else {
        this.dropCall(id)
        this.diagram.events.push({ kind: 'deactivate', actor: id, sourceLine: s.line })
      }
      return i
    }
    if ((m = /^destroy\s+(.+)$/i.exec(t))) {
      this.diagram.events.push({ kind: 'destroy', actor: this.use(m[1]!, s), sourceLine: s.line })
      return i
    }
    if ((m = /^return\b\s*(.*)$/i.exec(t))) {
      const call = this.calls.pop()
      if (!call) throw new DiagramError('"return" without a call to return from', s.line, s.column, 'Activate the callee first: A -> B ++ : call')
      this.message(call.callee, call.caller, labelText(m[1]!.trim()), { dotted: true, head: 'arrow', both: false }, { deactivateSource: true }, s)
      return i
    }
    if ((m = /^box\b\s*(.*)$/i.exec(t))) {
      if (this.stack.length > 0) throw new DiagramError('A box cannot be nested inside a block or another box', s.line, s.column)
      let rest = m[1]!.trim()
      let color: string | undefined
      const c = /\s*(#[0-9a-fA-F]{3,8}|#[a-zA-Z]+)\s*$/.exec(rest)
      if (c) {
        color = c[1]!.startsWith('#') && /^#[0-9a-fA-F]+$/.test(c[1]!) ? c[1]! : c[1]!.slice(1)
        rest = rest.slice(0, c.index).trim()
      }
      const label = unquoted(rest)
      this.diagram.boxes.push({ label: label === '' ? undefined : labelText(label), color })
      this.currentBox = this.diagram.boxes.length - 1
      this.stack.push({ block: 'box', line: s.line })
      return i
    }
    if (/^end\s*box$/i.test(t)) {
      const top = this.stack.pop()
      if (!top || top.block !== 'box') throw new DiagramError('"end box" without a box to close', s.line, s.column)
      this.currentBox = null
      return i
    }
    if ((m = /^(alt|opt|loop|par|break|critical|group)\b\s*(.*)$/i.exec(t))) {
      const block = m[1]!.toLowerCase() as BlockKind
      this.stack.push({ block, line: s.line })
      this.diagram.events.push({ kind: 'block-start', block, text: labelText(m[2]!.replace(/^#\S+\s*/, '').trim()), sourceLine: s.line })
      this.last = null
      return i
    }
    if ((m = /^else\b\s*(.*)$/i.exec(t))) {
      const top = this.stack[this.stack.length - 1]
      if (!top || top.block === 'box') throw new DiagramError('"else" belongs inside a block (alt, par, …)', s.line, s.column)
      const keyword = top.block === 'par' ? 'and' : top.block === 'critical' ? 'option' : 'else'
      this.diagram.events.push({ kind: 'block-section', keyword, text: labelText(m[1]!.replace(/^#\S+\s*/, '').trim()), sourceLine: s.line })
      return i
    }
    if (/^end$/i.test(t)) {
      const top = this.stack.pop()
      if (!top) throw new DiagramError('"end" without a block to close', s.line, s.column)
      if (top.block === 'box') {
        this.currentBox = null
      } else {
        this.diagram.events.push({ kind: 'block-end', sourceLine: s.line })
      }
      return i
    }
    if ((m = /^==\s*(.*?)\s*==$/.exec(t))) {
      this.diagram.events.push({ kind: 'divider', text: labelText(m[1]!), sourceLine: s.line })
      return i
    }
    if ((m = /^\.\.\.\s*(.*?)\s*(?:\.\.\.)?$/.exec(t))) {
      this.diagram.events.push({ kind: 'delay', text: labelText(m[1]!), sourceLine: s.line })
      return i
    }
    if ((m = /^\|\|(\d*)\|\|?$/.exec(t))) {
      this.diagram.events.push({ kind: 'space', height: m[1] ? Number(m[1]) : 20, sourceLine: s.line })
      return i
    }
    if (/^(note|hnote|rnote|ref)\b/i.test(t)) return this.note(i)
    if ((m = MESSAGE.exec(t))) {
      const g = m.groups!
      if (!g.from || g.from === '[' || g.to === ']') {
        throw new DiagramError(
          'Messages from or to outside the diagram ([-> and ->]) are not supported',
          s.line,
          s.column,
          'Add a participant for the outside party.',
        )
      }
      const a = readArrow(g.arrow!)
      if (!a.left && !a.right) throw new DiagramError(`"${g.arrow}" is not an arrow`, s.line, s.column + t.indexOf(g.arrow!), 'A -> B, A --> B, A ->> B, A <- B')
      let from = this.use(g.from, s)
      let to = this.use(g.to!, s)
      if (a.left && !a.right) [from, to] = [to, from]
      const mods = g.mods ?? ''
      this.message(from, to, labelText((g.text ?? '').trim()), { dotted: a.dotted, head: a.head, both: a.left && a.right }, {
        activateTarget: mods.includes('++'),
        deactivateSource: mods.includes('--'),
        create: mods.includes('**'),
        destroy: mods.includes('!!'),
      }, s)
      return i
    }
    throw new DiagramError(`"${t}" is not a sequence diagram statement`, s.line, s.column)
  }

  private message(
    from: string,
    to: string,
    text: string,
    arrow: { dotted: boolean; head: ArrowHead; both: boolean },
    mods: { activateTarget?: boolean; deactivateSource?: boolean; create?: boolean; destroy?: boolean },
    s: Statement,
  ): void {
    if (mods.create) {
      const p = this.byId.get(to)!
      if (!this.diagram.events.some((e) => e.kind === 'message' && (e.from === to || e.to === to))) p.created = true
    }
    let number: number | undefined
    if (this.numbering) {
      number = this.numbering.next
      this.numbering.next += this.numbering.step
    }
    this.diagram.events.push({
      kind: 'message',
      from,
      to,
      line: arrow.dotted ? 'dotted' : 'solid',
      head: arrow.head,
      bidirectional: arrow.both,
      text,
      activateTarget: !!mods.activateTarget,
      deactivateSource: !!mods.deactivateSource,
      number,
      sourceLine: s.line,
    })
    if (mods.activateTarget) this.calls.push({ caller: from, callee: to })
    if (mods.deactivateSource) this.dropCall(from)
    if (mods.destroy) this.diagram.events.push({ kind: 'destroy', actor: to, sourceLine: s.line })
    this.last = { from, to }
  }

  /** The newest call into `callee` is over (deactivated). */
  private dropCall(callee: string): void {
    for (let k = this.calls.length - 1; k >= 0; k--) {
      if (this.calls[k]!.callee === callee) {
        this.calls.splice(k, 1)
        return
      }
    }
  }

  private note(i: number): number {
    const s = this.list[i]!
    const t = s.text
    // ref over A, B : text — drawn as a note over them.
    let m = /^ref\s+over\s+(.+?)(?:\s*:\s*(.*))?$/i.exec(t)
    if (m) {
      const actors = m[1]!.split(',').map((n) => this.use(n, s))
      let text = m[2]
      let end = i
      if (text === undefined) ({ text, end } = this.multiline(i, /^end\s*ref$/i, 'end ref'))
      this.diagram.events.push({ kind: 'note', placement: 'over', actors: [actors[0]!, actors[actors.length - 1]!].filter((a, k, all) => all.indexOf(a) === k), text: `ref: ${labelText(text)}`, sourceLine: s.line })
      return end
    }
    m = /^[hr]?note\s+(left|right|over|across)(?:\s+of)?\s*([^:#]*?)\s*(?:#\S+)?\s*(?::\s?(.*))?$/i.exec(t)
    if (!m) throw new DiagramError(`"${t}" is not a note`, s.line, s.column, 'note left of A : text, note over A, B : text')
    const where = m[1]!.toLowerCase()
    let actors: string[]
    if (where === 'across') {
      const all = this.diagram.participants.map((p) => p.id)
      if (all.length === 0) throw new DiagramError('"note across" needs participants before it', s.line, s.column)
      actors = all.length > 1 ? [all[0]!, all[all.length - 1]!] : [all[0]!]
    } else if (m[2]!.trim() !== '') {
      actors = m[2]!.split(',').map((n) => this.use(n, s))
    } else {
      // A note beside the last message: on its sender's side for left, the receiver's for right.
      if (!this.last) throw new DiagramError('A note without "of" belongs after a message', s.line, s.column, 'note left of A : text')
      actors = [where === 'right' ? this.last.to : this.last.from]
    }
    const placement = where === 'across' ? 'over' : (where as 'left' | 'right' | 'over')
    if (placement !== 'over' && actors.length > 1) throw new DiagramError('Only "over" spans two participants', s.line, s.column)
    let text = m[3]
    let end = i
    if (text === undefined) ({ text, end } = this.multiline(i, /^end\s*[hr]?note$/i, 'end note'))
    this.diagram.events.push({ kind: 'note', placement, actors: actors.slice(0, 2), text: labelText(text), sourceLine: s.line })
    return end
  }

  /** The lines after statement `i` up to the closing one, joined with line breaks. */
  private multiline(i: number, close: RegExp, word: string): { text: string; end: number } {
    const lines: string[] = []
    for (let k = i + 1; k < this.list.length; k++) {
      if (close.test(this.list[k]!.text)) return { text: lines.join('<br>'), end: k }
      lines.push(this.list[k]!.text)
    }
    const s = this.list[i]!
    throw new DiagramError('This block is never closed', s.line, s.column, `Close it with "${word}".`)
  }

  private autonumber(rest: string, s: Statement): void {
    if (/^stop$/i.test(rest)) {
      this.paused = this.numbering
      this.numbering = null
      return
    }
    if (/^resume\b/i.test(rest)) {
      this.numbering = this.paused ?? { next: 1, step: 1 }
      return
    }
    // A format ("<b>[000]") is accepted and not drawn: the number is.
    const m = /^(\d+)?\s*(\d+)?\s*(?:"[^"]*")?$/.exec(rest)
    if (!m) throw new DiagramError(`"${rest}" is not a valid autonumber`, s.line, s.column, 'autonumber [start [step]]')
    this.numbering = { next: m[1] ? Number(m[1]) : 1, step: m[2] ? Number(m[2]) : 1 }
  }

  private declare(rest: string, kind: ParticipantKind, created: boolean, s: Statement): void {
    let text = rest.trim()
    // Modifiers after the name: order, colour, stereotype.
    text = text.replace(/\s+order\s+-?\d+\s*$/i, '')
    text = text.replace(/\s+#[\w]+\s*$/, '')
    let stereotype: string | undefined
    const st = /\s*<<\s*(.*?)\s*>>\s*$/.exec(text)
    if (st) {
      stereotype = st[1]
      text = text.slice(0, st.index)
    }
    let id: string
    let label: string
    let m = /^"([^"]+)"\s+as\s+(\S+)$/i.exec(text)
    if (m) {
      label = m[1]!
      id = m[2]!
    } else if ((m = /^(\S+)\s+as\s+"?([^"]+)"?$/i.exec(text))) {
      id = m[1]!
      label = m[2]!
    } else {
      id = unquoted(text)
      label = id
    }
    if (id === '') throw new DiagramError('A participant needs a name', s.line, s.column)
    label = labelText(label) + (stereotype ? `<br>«${stereotype}»` : '')
    const existing = this.byId.get(id)
    if (existing) {
      existing.label = label
      existing.kind = kind
      if (created) existing.created = true
      if (this.currentBox !== null) existing.box = this.currentBox
      return
    }
    const p: Participant = { id, label, kind, created }
    if (this.currentBox !== null) p.box = this.currentBox
    this.byId.set(id, p)
    this.diagram.participants.push(p)
  }

  /** A participant by name (quoted or not), created on first use. */
  private use(name: string, s: Statement): string {
    const id = unquoted(name.trim())
    if (id === '') throw new DiagramError('A participant needs a name', s.line, s.column)
    if (!this.byId.has(id)) {
      const p: Participant = { id, label: labelText(id), kind: 'participant', created: false }
      if (this.currentBox !== null) p.box = this.currentBox
      this.byId.set(id, p)
      this.diagram.participants.push(p)
    }
    return id
  }
}

export function parsePlantUmlSequence(src: PlantUmlSource): SequenceDiagram {
  const diagram = new Reader(src.statements).run()
  if (src.title) diagram.title = labelText(src.title.replace(/\n/g, '\\n'))
  if (src.hideFootbox) diagram.hideFootbox = true
  return diagram
}
