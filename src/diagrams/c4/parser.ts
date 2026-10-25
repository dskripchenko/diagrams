/**
 * The C4 grammar (`C4Context`, `C4Container`, `C4Component`, `C4Dynamic`,
 * `C4Deployment`): Mermaid's port of C4-PlantUML.
 *
 *     C4Context
 *         title System context
 *         Person(user, "Customer", "Uses the shop")
 *         System_Boundary(shop, "Shop") {
 *             System(web, "Web shop", "Sells things")
 *         }
 *         Rel(user, web, "Buys in", "HTTPS")
 *
 * Every statement is a macro call with positional and `$named=` arguments.
 * Parameters that only matter to PlantUML (sprites, tags, links) are
 * accepted and dropped; a parameter or macro that is not known at all is an
 * error, so a typo never turns into a quietly different picture.
 */
import { DiagramError } from '../../core/errors'
import { statements, type Statement } from '../../core/scanner'
import { parseStyle } from '../../core/style'
import { accessibilityStatement, type Accessibility } from '../common'

export type C4Kind = 'C4Context' | 'C4Container' | 'C4Component' | 'C4Dynamic' | 'C4Deployment'

export type ElementLevel = 'person' | 'system' | 'container' | 'component'
export type ElementShape = 'box' | 'person' | 'db' | 'queue'

/** Validated colours from `UpdateElementStyle` / `UpdateBoundaryStyle`. */
export interface ElementStyle {
  fill?: string
  stroke?: string
  text?: string
}

export interface C4Element {
  id: string
  level: ElementLevel
  shape: ElementShape
  external: boolean
  label: string
  /** `$techn` of containers and components. */
  techn?: string
  /** `$type` of persons and systems: replaces the default type line. */
  type?: string
  description?: string
  /** The boundary or deployment node it is declared in. */
  parent?: string
  style?: ElementStyle
}

export type BoundaryKind = 'boundary' | 'enterprise' | 'system' | 'container' | 'node'

export interface C4Boundary {
  id: string
  kind: BoundaryKind
  label: string
  /** The type line: `$type` of `Boundary` and deployment nodes. */
  type?: string
  description?: string
  parent?: string
  style?: ElementStyle
}

/** A layout hint: where `to` should be relative to `from`. */
export type RelDirection = 'up' | 'down' | 'left' | 'right'

export interface C4Relation {
  from: string
  to: string
  label: string
  techn?: string
  description?: string
  direction?: RelDirection
  /** Which ends carry an arrowhead. */
  arrows: 'end' | 'start' | 'both'
  /** `Lay_*`: a layout hint only, not drawn. */
  hidden: boolean
  /** The number shown in front of the label (C4Dynamic and `RelIndex`). */
  index?: string
  style?: { line?: string; text?: string }
  line: number
  column: number
}

export interface C4Diagram {
  type: 'c4'
  kind: C4Kind
  title?: string
  direction: 'TB' | 'LR'
  /** Elements in declaration order. */
  elements: Map<string, C4Element>
  /** Boundaries and deployment nodes in declaration order. */
  boundaries: Map<string, C4Boundary>
  /** Everything a scope contains, in declaration order (scope id `''` is the root). */
  children: Map<string, string[]>
  relations: C4Relation[]
  /** `UpdateLayoutConfig`. */
  shapeInRow: number
  boundaryInRow: number
  accessibility: Accessibility
}

export const C4_KEYWORDS: readonly C4Kind[] = ['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment']

// ---------------------------------------------------------------------------
// Macro calls
// ---------------------------------------------------------------------------

interface Arg {
  /** Lower-cased name without `$` for named arguments. */
  name?: string
  value: string
  column: number
}

interface Call {
  name: string
  args: Arg[]
  /** The statement ends with `{`: a boundary body follows. */
  opens: boolean
  /** … and with `{}`: an empty one. */
  closes: boolean
}

/**
 * Reads `Name(a, "b", $c="d") {`. Quoted values keep commas and parentheses;
 * unquoted ones may nest parentheses (`Index()`).
 */
function readCall(s: Statement): Call | null {
  const text = s.text
  const head = /^([A-Za-z_][\w]*)\s*\(/.exec(text)
  if (!head) return null
  const name = head[1]!
  const args: Arg[] = []
  let i = head[0].length
  const col = (at: number) => s.column + at
  const fail = (message: string, at: number, hint?: string) => new DiagramError(message, s.line, col(at), hint)
  const skip = () => {
    while (i < text.length && /\s/.test(text[i]!)) i++
  }
  skip()
  if (text[i] === ')') {
    i++
  } else {
    for (;;) {
      skip()
      const start = i
      let argName: string | undefined
      const named = /^\$([A-Za-z_]\w*)\s*=\s*/.exec(text.slice(i))
      if (named) {
        argName = named[1]!.toLowerCase()
        i += named[0].length
      }
      let value: string
      if (text[i] === '"') {
        const close = text.indexOf('"', i + 1)
        if (close < 0) throw fail('The string is not closed', i, 'Add the closing ".')
        value = text.slice(i + 1, close)
        i = close + 1
        skip()
      } else {
        let depth = 0
        const from = i
        while (i < text.length) {
          const ch = text[i]!
          if (ch === '"') throw fail('A quote inside an unquoted argument', i, 'Quote the whole argument.')
          if (ch === '(') depth++
          else if (ch === ')') {
            if (depth === 0) break
            depth--
          } else if (ch === ',' && depth === 0) break
          i++
        }
        value = text.slice(from, i).trim()
      }
      args.push({ name: argName, value, column: col(start) })
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === ')') {
        i++
        break
      }
      if (i >= text.length) throw fail(`"${name}(" is not closed`, text.length, 'Add ")".')
      throw fail(`Unexpected "${text[i]}" in the arguments of ${name}`, i, 'Separate arguments with commas.')
    }
  }
  skip()
  let opens = false
  let closes = false
  if (text[i] === '{') {
    opens = true
    i++
    skip()
    if (text[i] === '}') {
      closes = true
      i++
      skip()
    }
  }
  if (i < text.length) throw fail(`Unexpected "${text.slice(i)}" after ${name}(…)`, i)
  return { name, args, opens, closes }
}

/** Binds positional and named arguments to a macro's parameter list. */
function bind(call: Call, s: Statement, params: readonly string[], extra: readonly string[] = []): Map<string, Arg> {
  const out = new Map<string, Arg>()
  let next = 0
  for (const arg of call.args) {
    if (arg.name === undefined) {
      if (next >= params.length) {
        throw new DiagramError(
          `${call.name} takes at most ${params.length} positional arguments`,
          s.line,
          arg.column,
          `Parameters: ${params.join(', ')}.`,
        )
      }
      out.set(params[next++]!, arg)
      continue
    }
    const known = params.find((p) => p.toLowerCase() === arg.name) ?? extra.find((p) => p.toLowerCase() === arg.name)
    if (!known) {
      throw new DiagramError(
        `${call.name} has no parameter "$${arg.name}"`,
        s.line,
        arg.column,
        `Parameters: ${[...params, ...extra].map((p) => `$${p}`).join(', ')}.`,
      )
    }
    out.set(known, arg)
  }
  return out
}

function value(args: Map<string, Arg>, name: string): string | undefined {
  const a = args.get(name)
  if (!a) return undefined
  // C4-PlantUML writes line breaks as `\n`; Mermaid as `<br>`. Both break.
  const v = a.value.replace(/\\n/g, '<br>')
  return v.trim() === '' ? undefined : v
}

// ---------------------------------------------------------------------------
// Macro tables
// ---------------------------------------------------------------------------

interface ElementMacro {
  level: ElementLevel
  shape: ElementShape
  external: boolean
}

const ELEMENTS: Record<string, ElementMacro> = {}
for (const [prefix, level] of [
  ['System', 'system'],
  ['Container', 'container'],
  ['Component', 'component'],
] as const) {
  for (const [suffix, shape] of [
    ['', 'box'],
    ['Db', 'db'],
    ['Queue', 'queue'],
  ] as const) {
    ELEMENTS[`${prefix}${suffix}`] = { level, shape, external: false }
    ELEMENTS[`${prefix}${suffix}_Ext`] = { level, shape, external: true }
  }
}
ELEMENTS.Person = { level: 'person', shape: 'person', external: false }
ELEMENTS.Person_Ext = { level: 'person', shape: 'person', external: true }

const BOUNDARIES: Record<string, BoundaryKind> = {
  Boundary: 'boundary',
  Enterprise_Boundary: 'enterprise',
  System_Boundary: 'system',
  Container_Boundary: 'container',
  Deployment_Node: 'node',
  Deployment_Node_L: 'node',
  Deployment_Node_R: 'node',
  Node: 'node',
  Node_L: 'node',
  Node_R: 'node',
}

const DIRECTION_SUFFIX: Record<string, RelDirection> = {
  U: 'up',
  Up: 'up',
  D: 'down',
  Down: 'down',
  L: 'left',
  Left: 'left',
  R: 'right',
  Right: 'right',
}

interface RelMacro {
  arrows: C4Relation['arrows']
  direction?: RelDirection
  hidden?: boolean
  indexed?: boolean
}

const RELATIONS: Record<string, RelMacro> = {
  Rel: { arrows: 'end' },
  BiRel: { arrows: 'both' },
  Rel_Back: { arrows: 'start' },
  RelIndex: { arrows: 'end', indexed: true },
}
for (const [suffix, direction] of Object.entries(DIRECTION_SUFFIX)) {
  RELATIONS[`Rel_${suffix}`] = { arrows: 'end', direction }
  RELATIONS[`BiRel_${suffix}`] = { arrows: 'both', direction }
  RELATIONS[`Lay_${suffix}`] = { arrows: 'end', direction, hidden: true }
  RELATIONS[`RelIndex_${suffix}`] = { arrows: 'end', direction, indexed: true }
}

/** C4-PlantUML macros that are recognised, so the error can say they are not supported. */
const UNSUPPORTED = new Set([
  'SHOW_LEGEND',
  'SHOW_FLOATING_LEGEND',
  'LAYOUT_WITH_LEGEND',
  'LAYOUT_AS_SKETCH',
  'HIDE_STEREOTYPE',
  'HIDE_PERSON_SPRITE',
  'SHOW_PERSON_SPRITE',
  'SHOW_PERSON_PORTRAIT',
  'SHOW_PERSON_OUTLINE',
  'AddElementTag',
  'AddRelTag',
  'AddBoundaryTag',
  'AddPersonTag',
  'AddSystemTag',
  'AddContainerTag',
  'AddComponentTag',
  'AddNodeTag',
  'UpdateElementTag',
  'UpdateRelTag',
  'UpdateBoundaryTag',
  'UpdateContainerBoundaryStyle',
  'UpdateSystemBoundaryStyle',
  'UpdateEnterpriseBoundaryStyle',
  'SetPropertyHeader',
  'WithoutPropertyHeader',
  'AddProperty',
  'Lay_Distance',
  'Rel_Neighbor',
  'Rel_Back_Neighbor',
  'BiRel_Neighbor',
  'Index',
  'SetIndex',
  'LastIndex',
  'increment',
  'setIndex',
])

const ELEMENT_PARAMS = ['alias', 'label', 'descr', 'sprite', 'tags', 'link'] as const
const TECH_PARAMS = ['alias', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'] as const
const REL_PARAMS = ['from', 'to', 'label', 'techn', 'descr', 'sprite', 'tags', 'link'] as const
const STYLE_EXTRA = [
  'shadowing',
  'shape',
  'sprite',
  'techn',
  'legendText',
  'legendSprite',
  'borderStyle',
  'borderThickness',
  'type',
] as const

const ID = /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u

function alias(args: Map<string, Arg>, name: string, call: Call, s: Statement): string {
  const a = args.get(name)
  if (!a || a.value.trim() === '') {
    throw new DiagramError(`${call.name} needs ${name === 'alias' ? 'an alias' : `"${name}"`}`, s.line, s.column)
  }
  const id = a.value.trim()
  if (!ID.test(id)) {
    throw new DiagramError(`"${id}" is not a valid alias`, s.line, a.column, 'Use letters, digits, "_", "-" and ".".')
  }
  return id
}

function colour(arg: Arg | undefined, as: 'fill' | 'stroke' | 'color', s: Statement): string | undefined {
  if (!arg || arg.value.trim() === '') return undefined
  try {
    const style = parseStyle(`${as}:${arg.value.trim()}`, s.line, arg.column)
    return as === 'color' ? style.text.fill : style.shape[as]
  } catch {
    throw new DiagramError(`"${arg.value}" is not a colour`, s.line, arg.column, 'Write #rgb, #rrggbb, rgb(…) or a colour name.')
  }
}

function positiveInt(arg: Arg | undefined, s: Statement): number | undefined {
  if (!arg) return undefined
  const v = arg.value.trim()
  if (!/^[0-9]+$/.test(v) || Number(v) < 1 || Number(v) > 50) {
    throw new DiagramError(`"${arg.value}" is not a number from 1 to 50`, s.line, arg.column)
  }
  return Number(v)
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

export function parseC4(source: string): C4Diagram {
  const list = statements(source)
  const head = list[0]
  const kind = head ? (C4_KEYWORDS.find((k) => k === head.text) ?? null) : null
  if (!head || !kind) {
    throw new DiagramError(
      'A C4 diagram starts with C4Context, C4Container, C4Component, C4Dynamic or C4Deployment',
      head?.line ?? 1,
      head?.column ?? 1,
    )
  }
  const d: C4Diagram = {
    type: 'c4',
    kind,
    direction: 'TB',
    elements: new Map(),
    boundaries: new Map(),
    children: new Map([['', []]]),
    relations: [],
    shapeInRow: 4,
    boundaryInRow: 2,
    accessibility: {},
  }
  const stack: string[] = []
  /** A boundary whose `{` is expected on the next line. */
  let pending: { id: string; s: Statement } | null = null
  const scope = () => stack[stack.length - 1]
  const declared = (id: string, s: Statement, column: number) => {
    if (d.elements.has(id) || d.boundaries.has(id)) {
      throw new DiagramError(`"${id}" is defined twice`, s.line, column, 'Every alias must be unique.')
    }
    d.children.get(scope() ?? '')!.push(id)
  }
  let counter = 1
  const elementStyles: { id: string; style: ElementStyle; s: Statement; boundary: boolean }[] = []
  const relStyles: { from: string; to: string; style: { line?: string; text?: string }; s: Statement }[] = []

  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const text = s.text

    if (pending) {
      const { id, s: at } = pending
      pending = null
      if (text === '{' || text === '{}') {
        if (text === '{') stack.push(id)
        continue
      }
      throw new DiagramError(`"${id}" needs a body`, at.line, at.column, 'Add "{" … "}" after it.')
    }

    const consumed = accessibilityStatement(list, i, d.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    const title = /^title(?:\s+(.*))?$/.exec(text)
    if (title) {
      d.title = title[1]?.trim() || undefined
      continue
    }
    if (text === '}') {
      if (stack.length === 0) throw new DiagramError('"}" without an open boundary', s.line, s.column)
      stack.pop()
      continue
    }

    const call = readCall(s)
    if (!call) {
      if (/^!(include|define|theme)/.test(text)) {
        throw new DiagramError('PlantUML preprocessor lines are not part of Mermaid C4', s.line, s.column, 'Remove the line.')
      }
      throw new DiagramError(`"${text}" is not a C4 statement`, s.line, s.column, 'Write a macro call such as Person(alias, "Label").')
    }
    if (call.opens && !(call.name in BOUNDARIES)) {
      throw new DiagramError(`${call.name} cannot have a body`, s.line, s.column, 'Only boundaries and deployment nodes take "{ … }".')
    }

    const element = ELEMENTS[call.name]
    if (element) {
      const params = element.level === 'container' || element.level === 'component' ? TECH_PARAMS : ELEMENT_PARAMS
      const extra = element.level === 'person' || element.level === 'system' ? ['type', 'baseShape'] : ['baseShape']
      const args = bind(call, s, params, extra)
      const id = alias(args, 'alias', call, s)
      const label = value(args, 'label')
      if (label === undefined) throw new DiagramError(`${call.name}(${id}, …) needs a label`, s.line, s.column)
      declared(id, s, args.get('alias')!.column)
      d.elements.set(id, {
        id,
        level: element.level,
        shape: element.shape,
        external: element.external,
        label,
        techn: value(args, 'techn'),
        type: value(args, 'type'),
        description: value(args, 'descr'),
        parent: scope(),
      })
      continue
    }

    const boundary = BOUNDARIES[call.name]
    if (boundary) {
      const params =
        boundary === 'node'
          ? ['alias', 'label', 'type', 'descr', 'sprite', 'tags', 'link']
          : boundary === 'boundary'
            ? ['alias', 'label', 'type', 'tags', 'link']
            : ['alias', 'label', 'tags', 'link']
      const args = bind(call, s, params, ['descr', 'type', 'sprite'])
      const id = alias(args, 'alias', call, s)
      declared(id, s, args.get('alias')!.column)
      d.boundaries.set(id, {
        id,
        kind: boundary,
        label: value(args, 'label') ?? id,
        type: value(args, 'type'),
        description: value(args, 'descr'),
        parent: scope(),
      })
      d.children.set(id, [])
      if (call.opens && !call.closes) stack.push(id)
      else if (!call.opens) pending = { id, s }
      continue
    }

    const rel = RELATIONS[call.name]
    if (rel) {
      const params = rel.hidden ? ['from', 'to'] : rel.indexed ? ['index', ...REL_PARAMS] : [...REL_PARAMS]
      const args = bind(call, s, params, rel.hidden ? [] : ['index'])
      const from = alias(args, 'from', call, s)
      const to = alias(args, 'to', call, s)
      let index: string | undefined
      const given = args.get('index')?.value.trim()
      if (rel.indexed && !given) throw new DiagramError(`${call.name} needs an index`, s.line, s.column)
      if (given) {
        if (/^Index\(\s*\)$/.test(given)) index = String(counter++)
        else if (/^LastIndex\(\s*\)$/.test(given)) index = String(Math.max(1, counter - 1))
        else {
          index = given
          if (/^[0-9]+$/.test(given)) counter = Number(given) + 1
        }
      } else if (d.kind === 'C4Dynamic' && !rel.hidden) {
        index = String(counter++)
      }
      d.relations.push({
        from,
        to,
        label: value(args, 'label') ?? '',
        techn: value(args, 'techn'),
        description: value(args, 'descr'),
        direction: rel.direction,
        arrows: rel.arrows,
        hidden: rel.hidden ?? false,
        index,
        line: s.line,
        column: s.column,
      })
      continue
    }

    switch (call.name) {
      case 'UpdateElementStyle':
      case 'UpdateBoundaryStyle': {
        const args = bind(call, s, ['elementName', 'bgColor', 'fontColor', 'borderColor'], STYLE_EXTRA)
        const id = alias(args, 'elementName', call, s)
        elementStyles.push({
          id,
          s,
          boundary: call.name === 'UpdateBoundaryStyle',
          style: {
            fill: colour(args.get('bgColor'), 'fill', s),
            text: colour(args.get('fontColor'), 'color', s),
            stroke: colour(args.get('borderColor'), 'stroke', s),
          },
        })
        continue
      }
      case 'UpdateRelStyle': {
        // Offsets nudge labels in Mermaid's own placement; here labels have
        // room reserved in the layout, so the offsets are accepted and ignored.
        const args = bind(call, s, ['from', 'to', 'textColor', 'lineColor', 'offsetX', 'offsetY'])
        relStyles.push({
          from: alias(args, 'from', call, s),
          to: alias(args, 'to', call, s),
          s,
          style: { text: colour(args.get('textColor'), 'color', s), line: colour(args.get('lineColor'), 'stroke', s) },
        })
        continue
      }
      case 'UpdateLayoutConfig': {
        const args = bind(call, s, ['c4ShapeInRow', 'c4BoundaryInRow'])
        d.shapeInRow = positiveInt(args.get('c4ShapeInRow'), s) ?? d.shapeInRow
        d.boundaryInRow = positiveInt(args.get('c4BoundaryInRow'), s) ?? d.boundaryInRow
        continue
      }
      case 'LAYOUT_TOP_DOWN':
      case 'LAYOUT_LEFT_RIGHT':
      case 'LAYOUT_LANDSCAPE':
        if (call.args.length > 0) throw new DiagramError(`${call.name}() takes no arguments`, s.line, s.column)
        d.direction = call.name === 'LAYOUT_TOP_DOWN' ? 'TB' : 'LR'
        continue
    }

    if (UNSUPPORTED.has(call.name)) {
      throw new DiagramError(
        `${call.name} is a C4-PlantUML feature that is not supported`,
        s.line,
        s.column,
        'Remove the statement; see the C4 page of the documentation for what is supported.',
      )
    }
    throw new DiagramError(
      `"${call.name}" is not a C4 macro`,
      s.line,
      s.column,
      'Elements: Person, System, SystemDb, SystemQueue, Container…, Component… (with _Ext); boundaries: Boundary, Enterprise_Boundary, System_Boundary, Container_Boundary, Deployment_Node, Node; relations: Rel, BiRel, Rel_U/D/L/R, Rel_Back, RelIndex.',
    )
  }
  if (pending) {
    throw new DiagramError(`"${pending.id}" needs a body`, pending.s.line, pending.s.column, 'Add "{" … "}" after it.')
  }
  if (stack.length > 0) {
    const open = stack[stack.length - 1]!
    throw new DiagramError(`Boundary "${open}" is not closed`, 0, 0, 'Add "}".')
  }

  // References are checked at the end: a relation may come before the
  // elements it connects, as in Mermaid.
  const ancestors = (id: string): Set<string> => {
    const out = new Set<string>()
    let p = d.elements.get(id)?.parent ?? d.boundaries.get(id)?.parent
    while (p !== undefined) {
      out.add(p)
      p = d.boundaries.get(p)?.parent
    }
    return out
  }
  for (const r of d.relations) {
    for (const end of [r.from, r.to]) {
      if (!d.elements.has(end) && !d.boundaries.has(end)) {
        throw new DiagramError(`A relation refers to an unknown element "${end}"`, r.line, r.column)
      }
    }
    if (ancestors(r.from).has(r.to) || ancestors(r.to).has(r.from)) {
      throw new DiagramError(
        `A relation cannot connect "${r.from}" and "${r.to}": one is inside the other`,
        r.line,
        r.column,
      )
    }
  }
  for (const st of elementStyles) {
    const target = st.boundary ? d.boundaries.get(st.id) : (d.elements.get(st.id) ?? d.boundaries.get(st.id))
    if (!target) {
      throw new DiagramError(`A style refers to an unknown ${st.boundary ? 'boundary' : 'element'} "${st.id}"`, st.s.line, st.s.column)
    }
    target.style = { ...target.style, ...defined(st.style) }
  }
  for (const st of relStyles) {
    const matching = d.relations.filter((r) => !r.hidden && r.from === st.from && r.to === st.to)
    if (matching.length === 0) {
      throw new DiagramError(`UpdateRelStyle: there is no relation from "${st.from}" to "${st.to}"`, st.s.line, st.s.column)
    }
    for (const r of matching) r.style = { ...r.style, ...defined(st.style) }
  }
  return d
}

function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}
