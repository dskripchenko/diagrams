/**
 * Sequence diagrams: the parser.
 *
 *     sequenceDiagram
 *         participant A as Alice
 *         A->>+John: Hello John
 *         John-->>-A: Hi Alice
 *
 * The result is the list of participants and a flat list of events in
 * source order. Blocks (`loop … end`) stay events too — a start, separators
 * and an end — because the layout walks the diagram top to bottom anyway,
 * and nesting is checked here so the layout never sees an unbalanced list.
 */
import { DiagramError } from '../../core/errors'
import { statements, unquote, type Statement } from '../../core/scanner'
import { parseStyle } from '../../core/style'
import { accessibilityStatement, type Accessibility } from '../common'

export type ParticipantKind = 'participant' | 'actor'

export interface Participant {
  id: string
  /** Label source; `<br>` breaks lines. */
  label: string
  kind: ParticipantKind
  /** Index into `boxes`, when declared inside a `box`. */
  box?: number
  /** Declared with `create`: drawn where it is first used rather than at the top. */
  created: boolean
}

export interface ParticipantBox {
  label?: string
  /** Validated CSS colour, or undefined for no fill. */
  color?: string
}

export type LineStyle = 'solid' | 'dotted'
export type ArrowHead = 'none' | 'arrow' | 'open' | 'cross'

export type BlockKind = 'loop' | 'alt' | 'opt' | 'par' | 'critical' | 'break' | 'rect'

export interface MessageEvent {
  kind: 'message'
  from: string
  to: string
  line: LineStyle
  head: ArrowHead
  /** `<<->>`: an arrowhead at both ends. */
  bidirectional: boolean
  text: string
  /** `+` before the target: the target is activated by this message. */
  activateTarget: boolean
  /** `-` before the target: the sender's activation ends with this message. */
  deactivateSource: boolean
  /** The autonumber shown next to the message, if numbering is on. */
  number?: number
  sourceLine: number
}

export interface NoteEvent {
  kind: 'note'
  placement: 'left' | 'right' | 'over'
  /** One participant, or two for `over A,B`. */
  actors: string[]
  text: string
  sourceLine: number
}

export interface ActivationEvent {
  kind: 'activate' | 'deactivate'
  actor: string
  sourceLine: number
}

export interface BlockStartEvent {
  kind: 'block-start'
  block: BlockKind
  /** Guard text; for `rect`, empty. */
  text: string
  /** `rect` only: the validated background colour. */
  color?: string
  sourceLine: number
}

export interface BlockSectionEvent {
  kind: 'block-section'
  /** `else`, `and` or `option`. */
  keyword: 'else' | 'and' | 'option'
  text: string
  sourceLine: number
}

export interface BlockEndEvent {
  kind: 'block-end'
  sourceLine: number
}

export interface DestroyEvent {
  kind: 'destroy'
  actor: string
  sourceLine: number
}

export type SequenceEvent =
  | MessageEvent
  | NoteEvent
  | ActivationEvent
  | BlockStartEvent
  | BlockSectionEvent
  | BlockEndEvent
  | DestroyEvent

export interface SequenceDiagram {
  type: 'sequence'
  title?: string
  participants: Participant[]
  boxes: ParticipantBox[]
  events: SequenceEvent[]
  accessibility: Accessibility
}

/*
 * Arrow tokens, longest first: at any position the longest one that matches
 * is the arrow (`-->>` rather than `-->` followed by `>`).
 */
const ARROWS: readonly { token: string; line: LineStyle; head: ArrowHead; both: boolean }[] = [
  { token: '<<-->>', line: 'dotted', head: 'arrow', both: true },
  { token: '<<->>', line: 'solid', head: 'arrow', both: true },
  { token: '-->>', line: 'dotted', head: 'arrow', both: false },
  { token: '->>', line: 'solid', head: 'arrow', both: false },
  { token: '--x', line: 'dotted', head: 'cross', both: false },
  { token: '--)', line: 'dotted', head: 'open', both: false },
  { token: '-->', line: 'dotted', head: 'none', both: false },
  { token: '-x', line: 'solid', head: 'cross', both: false },
  { token: '-)', line: 'solid', head: 'open', both: false },
  { token: '->', line: 'solid', head: 'none', both: false },
]

const ARROW_LIST = ARROWS.map((a) => a.token).join(', ')

/** Characters an id cannot contain: they belong to arrows and separators. */
const BAD_ID = /[<>:,;+]|^-|-$/

/*
 * CSS named colours, for telling `box Purple Team` (a colour and a label)
 * from `box Team Alpha` (a label alone).
 */
const NAMED_COLORS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet ' +
    'brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan ' +
    'darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta ' +
    'darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue ' +
    'darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey ' +
    'dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray ' +
    'green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush ' +
    'lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray ' +
    'lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon ' +
    'mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue ' +
    'mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin ' +
    'navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen ' +
    'paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna ' +
    'silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle ' +
    'tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent'
  ).split(' '),
)

/**
 * Validates a colour through the shared style rules, so a box or rect
 * colour can never be anything but a colour.
 */
function validColor(value: string, line: number, column: number): string {
  const style = parseStyle(`fill:${value}`, line, column)
  return style.shape.fill!
}

/**
 * Splits statements on `;` — Mermaid's other statement separator — except
 * where the `;` ends an entity such as `#59;`.
 */
function splitStatements(list: readonly Statement[]): Statement[] {
  const out: Statement[] = []
  for (const s of list) {
    let start = 0
    for (let i = 0; i < s.text.length; i++) {
      if (s.text[i] !== ';') continue
      const before = s.text.slice(start, i)
      if (/#[a-zA-Z0-9]+$/.test(before)) continue
      push(out, s, start, i)
      start = i + 1
    }
    push(out, s, start, s.text.length)
  }
  return out
}

function push(out: Statement[], s: Statement, start: number, end: number): void {
  const raw = s.text.slice(start, end)
  const text = raw.trim()
  if (text === '') return
  const leading = raw.length - raw.trimStart().length
  out.push({ text, line: s.line, column: s.column + start + leading })
}

interface OpenBlock {
  block: BlockKind | 'box'
  line: number
}

class Parser {
  readonly diagram: SequenceDiagram = {
    type: 'sequence',
    participants: [],
    boxes: [],
    events: [],
    accessibility: {},
  }

  private readonly byId = new Map<string, Participant>()
  private readonly stack: OpenBlock[] = []
  private readonly active = new Map<string, number>()
  private readonly destroyed = new Set<string>()
  private readonly pendingDestroy = new Set<string>()
  private numbering: { next: number; step: number } | null = null
  private currentBox: number | null = null

  constructor(private readonly list: Statement[]) {}

  run(): SequenceDiagram {
    const head = this.list[0]
    if (!head || !/^sequenceDiagram\s*$/.test(head.text)) {
      throw new DiagramError(
        'A sequence diagram starts with "sequenceDiagram"',
        head?.line ?? 1,
        head?.column ?? 1,
      )
    }
    for (let i = 1; i < this.list.length; i++) {
      const consumed = accessibilityStatement(this.list, i, this.diagram.accessibility)
      if (consumed > 0) {
        i += consumed - 1
        continue
      }
      this.statement(this.list[i]!)
    }
    const open = this.stack[this.stack.length - 1]
    if (open) {
      throw new DiagramError(
        `The "${open.block}" opened here is never closed`,
        open.line,
        0,
        'Add "end" after its last statement.',
      )
    }
    return this.diagram
  }

  private statement(s: Statement): void {
    const t = s.text
    let m: RegExpExecArray | null

    if (this.currentBox !== null && !/^(create\s+)?(participant|actor)\b|^end$/i.test(t)) {
      throw new DiagramError(
        'Only participant and actor declarations belong inside a box',
        s.line,
        s.column,
        'Close the box with "end" first.',
      )
    }

    if ((m = /^title(?:\s*:\s*|\s+)(.*)$/i.exec(t))) {
      this.diagram.title = m[1]!.trim()
      return
    }
    if ((m = /^autonumber(?:\s+(.*))?$/i.exec(t))) {
      this.autonumber(m[1]?.trim() ?? '', s)
      return
    }
    if ((m = /^(create\s+)?(participant|actor)\s+(.+)$/i.exec(t))) {
      this.declare(m[3]!, m[2]!.toLowerCase() as ParticipantKind, !!m[1], s, t.length - m[3]!.length)
      return
    }
    if ((m = /^destroy\s+(.+)$/i.exec(t))) {
      const id = this.id(m[1]!, s, t.length - m[1]!.length)
      if (!this.byId.has(id)) {
        throw new DiagramError(`"${id}" is not a participant`, s.line, s.column)
      }
      this.pendingDestroy.add(id)
      this.diagram.events.push({ kind: 'destroy', actor: id, sourceLine: s.line })
      return
    }
    if ((m = /^box(?:\s+(.*))?$/i.exec(t))) {
      this.box(m[1]?.trim() ?? '', s)
      return
    }
    if ((m = /^(activate|deactivate)\s+(.+)$/i.exec(t))) {
      const kind = m[1]!.toLowerCase() as 'activate' | 'deactivate'
      const id = this.use(m[2]!, s, t.length - m[2]!.length)
      if (kind === 'activate') this.activate(id)
      else this.deactivate(id, s)
      this.diagram.events.push({ kind, actor: id, sourceLine: s.line })
      return
    }
    if ((m = /^note\s+(left of|right of|over)\s+([^:]+?)\s*:\s?(.*)$/i.exec(t))) {
      const placement = m[1]!.toLowerCase().split(' ')[0] as 'left' | 'right' | 'over'
      const names = m[2]!.split(',').map((n) => n.trim())
      if (names.length > 2 || (names.length === 2 && placement !== 'over')) {
        throw new DiagramError('Only "over" spans two participants', s.line, s.column, 'Note over A,B: text')
      }
      const offset = t.indexOf(m[2]!)
      const actors = names.map((n) => this.use(n, s, offset))
      this.diagram.events.push({ kind: 'note', placement, actors, text: m[3]!.trim(), sourceLine: s.line })
      return
    }
    if (/^note\b/i.test(t)) {
      throw new DiagramError(
        `"${t}" is not a note`,
        s.line,
        s.column,
        'Note left of A: text, Note right of A: text, Note over A,B: text',
      )
    }
    if ((m = /^(loop|alt|opt|par|critical|break)(?:\s+(.*))?$/i.exec(t))) {
      const block = m[1]!.toLowerCase() as BlockKind
      this.stack.push({ block, line: s.line })
      this.diagram.events.push({ kind: 'block-start', block, text: m[2]?.trim() ?? '', sourceLine: s.line })
      return
    }
    if ((m = /^rect(?:\s+(.*))?$/i.exec(t))) {
      const colorText = m[1]?.trim() ?? ''
      if (colorText === '') {
        throw new DiagramError('"rect" needs a colour', s.line, s.column, 'rect rgb(200, 220, 255)')
      }
      const color = validColor(colorText, s.line, s.column + 5)
      this.stack.push({ block: 'rect', line: s.line })
      this.diagram.events.push({ kind: 'block-start', block: 'rect', text: '', color, sourceLine: s.line })
      return
    }
    if ((m = /^(else|and|option)(?:\s+(.*))?$/i.exec(t))) {
      const keyword = m[1]!.toLowerCase() as 'else' | 'and' | 'option'
      const expected = { else: 'alt', and: 'par', option: 'critical' }[keyword]
      const top = this.stack[this.stack.length - 1]
      if (!top || top.block !== expected) {
        throw new DiagramError(`"${keyword}" belongs inside "${expected}"`, s.line, s.column)
      }
      this.diagram.events.push({ kind: 'block-section', keyword, text: m[2]?.trim() ?? '', sourceLine: s.line })
      return
    }
    if (/^end$/i.test(t)) {
      const top = this.stack.pop()
      if (!top) {
        throw new DiagramError('"end" without a block to close', s.line, s.column)
      }
      if (top.block === 'box') {
        this.currentBox = null
      } else {
        this.diagram.events.push({ kind: 'block-end', sourceLine: s.line })
      }
      return
    }
    this.message(s)
  }

  private autonumber(rest: string, s: Statement): void {
    if (rest === '') {
      this.numbering = { next: 1, step: 1 }
    } else if (/^off$/i.test(rest)) {
      this.numbering = null
    } else {
      const m = /^([0-9]+)(?:\s+([0-9]+))?$/.exec(rest)
      if (!m) {
        throw new DiagramError(`"${rest}" is not a valid autonumber`, s.line, s.column, 'autonumber [start [step]] or autonumber off')
      }
      this.numbering = { next: Number(m[1]), step: m[2] ? Number(m[2]) : 1 }
    }
  }

  private box(rest: string, s: Statement): void {
    if (this.stack.length > 0) {
      throw new DiagramError('A box cannot be nested inside a block or another box', s.line, s.column)
    }
    let color: string | undefined
    let label = rest
    const fn = /^((?:rgb|rgba|hsl|hsla)\([^)]*\))\s*(.*)$/i.exec(rest)
    const word = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)(?:\s+(.*))?$/.exec(rest)
    if (fn) {
      color = validColor(fn[1]!, s.line, s.column + 4)
      label = fn[2]!.trim()
    } else if (word && (word[1]!.startsWith('#') || NAMED_COLORS.has(word[1]!.toLowerCase()))) {
      color = validColor(word[1]!, s.line, s.column + 4)
      label = word[2]?.trim() ?? ''
    }
    this.diagram.boxes.push({ label: label === '' ? undefined : label, color })
    this.currentBox = this.diagram.boxes.length - 1
    this.stack.push({ block: 'box', line: s.line })
  }

  private id(raw: string, s: Statement, offset: number): string {
    const id = raw.trim()
    if (id === '' || BAD_ID.test(id)) {
      throw new DiagramError(`"${id}" is not a valid participant name`, s.line, s.column + offset)
    }
    return id
  }

  private declare(rest: string, kind: ParticipantKind, created: boolean, s: Statement, offset: number): void {
    if (/@\{/.test(rest)) {
      throw new DiagramError(
        'Participant metadata (@{ … }) is not supported',
        s.line,
        s.column + offset + rest.indexOf('@'),
        'Use "participant A" or "actor A".',
      )
    }
    const m = /^(.+?)\s+as\s+(.+)$/.exec(rest)
    const id = this.id(m ? m[1]! : rest, s, offset)
    const label = m ? unquote(m[2]!) : id
    const existing = this.byId.get(id)
    if (created && existing) {
      throw new DiagramError(`"${id}" already exists and cannot be created again`, s.line, s.column + offset)
    }
    if (existing) {
      existing.label = label
      existing.kind = kind
      if (this.currentBox !== null) existing.box = this.currentBox
      return
    }
    const participant: Participant = { id, label, kind, created }
    if (this.currentBox !== null) participant.box = this.currentBox
    this.byId.set(id, participant)
    this.diagram.participants.push(participant)
  }

  /** A participant mentioned by an event: declared implicitly when new. */
  private use(raw: string, s: Statement, offset: number): string {
    const id = this.id(raw, s, offset)
    if (this.destroyed.has(id)) {
      throw new DiagramError(`"${id}" was destroyed earlier and cannot be used`, s.line, s.column + offset)
    }
    if (!this.byId.has(id)) {
      const participant: Participant = { id, label: id, kind: 'participant', created: false }
      this.byId.set(id, participant)
      this.diagram.participants.push(participant)
    }
    return id
  }

  private activate(id: string): void {
    this.active.set(id, (this.active.get(id) ?? 0) + 1)
  }

  private deactivate(id: string, s: Statement): void {
    const depth = this.active.get(id) ?? 0
    if (depth <= 0) {
      throw new DiagramError(`"${id}" is not active, so it cannot be deactivated`, s.line, s.column)
    }
    this.active.set(id, depth - 1)
  }

  private message(s: Statement): void {
    const t = s.text
    const colon = t.indexOf(':')
    const head = colon >= 0 ? t.slice(0, colon) : t
    const text = colon >= 0 ? t.slice(colon + 1).trim() : ''

    // Every place an arrow token starts, with the longest token there.
    const candidates: { at: number; arrow: (typeof ARROWS)[number] }[] = []
    for (let i = 0; i < head.length; i++) {
      const arrow = ARROWS.find((a) => head.startsWith(a.token, i))
      if (arrow) {
        candidates.push({ at: i, arrow })
        i += arrow.token.length - 1
      }
    }
    if (candidates.length === 0) {
      throw new DiagramError(`"${t}" is not a statement`, s.line, s.column, `Messages are written A->>B: text, with one of ${ARROW_LIST}.`)
    }
    // `-x` also appears inside names (`Web-xyz`): prefer the split whose
    // left side is a known participant, then one that is not a cross.
    const pick =
      candidates.find((c) => this.byId.has(head.slice(0, c.at).trim())) ??
      candidates.find((c) => c.arrow.head !== 'cross') ??
      candidates[0]!
    const left = head.slice(0, pick.at)
    let right = head.slice(pick.at + pick.arrow.token.length)
    const arrowColumn = pick.at
    const rightOffset = pick.at + pick.arrow.token.length

    let activateTarget = false
    let deactivateSource = false
    const sign = /^\s*([+-])/.exec(right)
    if (sign) {
      if (sign[1] === '+') activateTarget = true
      else deactivateSource = true
      right = right.slice(sign[0].length)
    }

    const unknownArrow = (segment: string, at: number) => {
      if (/^[<>=)-]|[<>=-]$/.test(segment.trim())) {
        throw new DiagramError(
          `"${t.slice(0, colon >= 0 ? colon : t.length).trim()}" does not use a known arrow`,
          s.line,
          s.column + at,
          `Arrows: ${ARROW_LIST}.`,
        )
      }
    }
    unknownArrow(right, rightOffset)
    unknownArrow(left, arrowColumn)

    const from = this.use(left, s, 0)
    const to = this.use(right, s, rightOffset)

    if (deactivateSource) this.deactivate(from, s)
    if (activateTarget) this.activate(to)

    for (const id of [from, to]) {
      if (this.pendingDestroy.has(id)) {
        this.pendingDestroy.delete(id)
        this.destroyed.add(id)
      }
    }

    const event: MessageEvent = {
      kind: 'message',
      from,
      to,
      line: pick.arrow.line,
      head: pick.arrow.head,
      bidirectional: pick.arrow.both,
      text,
      activateTarget,
      deactivateSource,
      sourceLine: s.line,
    }
    if (this.numbering) {
      event.number = this.numbering.next
      this.numbering.next += this.numbering.step
    }
    this.diagram.events.push(event)
  }
}

export function parseSequence(source: string): SequenceDiagram {
  const list = splitStatements(statements(source))
  const diagram = new Parser(list).run()
  if (diagram.participants.length === 0) {
    throw new DiagramError('The sequence diagram has no participants', 0, 0, 'Add a message such as A->>B: Hello')
  }
  return diagram
}
