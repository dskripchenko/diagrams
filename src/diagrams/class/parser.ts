/**
 * The class diagram grammar (`classDiagram`): classes with members, generics
 * and annotations, every UML relationship with cardinalities and labels,
 * namespaces, notes, direction, classes, styles and links.
 */
import { DiagramError } from '../../core/errors'
import { statements, type Statement } from '../../core/scanner'
import { parseStyle, safeHref, type UserStyle } from '../../core/style'
import type { Direction } from '../../layout/layered/types'
import { accessibilityStatement, type Accessibility } from '../common'

export type Visibility = '+' | '-' | '#' | '~'
/** `$` after a member: static (underlined); `*`: abstract (italic). */
export type Classifier = 'static' | 'abstract'

export interface ClassMember {
  kind: 'attribute' | 'method'
  /** What the box shows: generics as `<…>`, a method's return type after a colon. */
  text: string
  visibility?: Visibility
  classifier?: Classifier
}

export interface ClassNode {
  id: string
  /** The name the box shows: a `["label"]`, or the id with its generic parameter. */
  label: string
  /** `T` of `class Square~T~`. */
  generic?: string
  /** `interface`, `abstract`, … as written between `<<` and `>>`. */
  annotations: string[]
  attributes: ClassMember[]
  methods: ClassMember[]
  namespace?: string
  classes: string[]
  style?: UserStyle
  link?: { href: string; tooltip?: string; target?: string }
}

/** The symbol at one end of a relationship. */
export type RelationEnd = 'none' | 'inheritance' | 'composition' | 'aggregation' | 'arrow'

export interface ClassRelation {
  from: string
  to: string
  fromEnd: RelationEnd
  toEnd: RelationEnd
  /** `..` rather than `--`: dependency, realization, dashed link. */
  dashed: boolean
  fromCardinality?: string
  toCardinality?: string
  label?: string
}

export interface ClassNote {
  /** The class the note is attached to; none for a free-standing note. */
  target?: string
  text: string
}

export interface ClassNamespace {
  id: string
}

export interface ClassDiagram {
  type: 'class'
  direction: Direction
  classes: Map<string, ClassNode>
  relations: ClassRelation[]
  notes: ClassNote[]
  namespaces: Map<string, ClassNamespace>
  classDefs: Map<string, UserStyle>
  accessibility: Accessibility
}

const DIRECTIONS: Record<string, Direction> = { TB: 'TB', TD: 'TB', BT: 'BT', LR: 'LR', RL: 'RL' }

/** A class name: letters, digits, `_`, and `-` between them. */
const CLS = '[\\p{L}\\p{N}_](?:[\\p{L}\\p{N}_]|-(?=[\\p{L}\\p{N}_]))*'
const GENERIC = '~([^~\\s{]+(?:~[^~\\s{]*~)?[^~\\s{]*)~'

const LEFT_END: Record<string, RelationEnd> = { '<|': 'inheritance', '*': 'composition', o: 'aggregation', '<': 'arrow' }
const RIGHT_END: Record<string, RelationEnd> = { '|>': 'inheritance', '*': 'composition', o: 'aggregation', '>': 'arrow' }

const RELATION = new RegExp(
  `^(${CLS})\\s*(?:"([^"]*)"\\s*)?(<\\||\\*|o|<)?(--|\\.\\.)(\\|>|\\*|o|>)?\\s*(?:"([^"]*)"\\s*)?(${CLS})\\s*(?::\\s*(.*))?$`,
  'u',
)
const DECLARATION = new RegExp(
  `^class\\s+(${CLS})(?:${GENERIC})?(?:\\s*\\[\\s*"([^"]*)"\\s*\\])?(?::::([\\w-]+))?(?:\\s*<<\\s*([^>]+?)\\s*>>)?\\s*(\\{\\s*\\}?)?$`,
  'u',
)
const ANNOTATION = new RegExp(`^<<\\s*([^>]+?)\\s*>>\\s*(${CLS})$`, 'u')
const MEMBER = new RegExp(`^(${CLS})\\s*:\\s*(.+)$`, 'u')
const TARGETS = '(_blank|_self|_parent|_top)'

/**
 * Mermaid writes generics with tildes, `List~int~`, nesting as
 * `Map~K, List~V~~`. A tilde that follows a name and precedes one opens a
 * parameter list; any other tilde closes the innermost one.
 */
export function generics(text: string): string {
  let out = ''
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch !== '~') {
      out += ch
      continue
    }
    const before = text[i - 1] ?? ''
    const after = text[i + 1] ?? ''
    const opens = /[\p{L}\p{N}_\]]/u.test(before) && /[\p{L}\p{N}_[(]/u.test(after)
    if (opens || depth === 0) {
      out += '<'
      depth++
    } else {
      out += '>'
      depth--
    }
  }
  return out + '>'.repeat(Math.max(0, depth))
}

/** One member line, as Mermaid reads it: a method if it has parentheses. */
export function parseMember(source: string): ClassMember {
  let t = source.trim()
  let visibility: Visibility | undefined
  if (/^[+\-#~]/.test(t)) {
    visibility = t[0] as Visibility
    t = t.slice(1).trim()
  }
  const vis = visibility ?? ''
  const classify = (mark: string): Classifier => (mark === '$' ? 'static' : 'abstract')
  const open = t.indexOf('(')
  const close = t.lastIndexOf(')')
  if (open >= 0 && close > open) {
    const name = t.slice(0, open).trim()
    const params = t.slice(open + 1, close).trim()
    let after = t.slice(close + 1).trim()
    let classifier: Classifier | undefined
    if (/^[$*]/.test(after)) {
      classifier = classify(after[0]!)
      after = after.slice(1).trim()
    } else if (/[$*]$/.test(after)) {
      classifier = classify(after[after.length - 1]!)
      after = after.slice(0, -1).trim()
    }
    const returns = after.replace(/^:\s*/, '')
    const text = `${vis}${generics(name)}(${generics(params)})${returns ? ` : ${generics(returns)}` : ''}`
    return { kind: 'method', text, visibility, classifier }
  }
  let classifier: Classifier | undefined
  if (/[$*]$/.test(t)) {
    classifier = classify(t[t.length - 1]!)
    t = t.slice(0, -1).trim()
  }
  return { kind: 'attribute', text: `${vis}${generics(t)}`, visibility, classifier }
}

export function parseClass(source: string): ClassDiagram {
  const list = statements(source)
  const head = list[0]
  if (!head || !/^classDiagram(-v2)?$/.test(head.text)) {
    throw new DiagramError('A class diagram starts with "classDiagram"', head?.line ?? 1, head?.column ?? 1)
  }
  const d: ClassDiagram = {
    type: 'class',
    direction: 'TB',
    classes: new Map(),
    relations: [],
    notes: [],
    namespaces: new Map(),
    classDefs: new Map(),
    accessibility: {},
  }
  const pendingClasses: { ids: string[]; cls: string; s: Statement }[] = []
  const pendingStyles: { id: string; style: UserStyle; s: Statement }[] = []
  const pendingLinks: { id: string; href: string; tooltip?: string; target?: string; s: Statement }[] = []
  const pendingNotes: { target: string; s: Statement }[] = []
  let namespace: { id: string; s: Statement } | null = null

  const touch = (id: string): ClassNode => {
    let node = d.classes.get(id)
    if (!node) {
      node = { id, label: id, annotations: [], attributes: [], methods: [], classes: [] }
      d.classes.set(id, node)
    }
    // A class declared in a namespace belongs to it, wherever it was first mentioned.
    if (namespace && !node.namespace) node.namespace = namespace.id
    return node
  }
  const addMember = (node: ClassNode, raw: string, s: Statement) => {
    const ann = /^<<\s*([^>]+?)\s*>>$/.exec(raw)
    if (ann) {
      node.annotations.push(ann[1]!)
      return
    }
    if (raw.startsWith('<<')) {
      throw new DiagramError(`"${raw}" is not an annotation`, s.line, s.column, 'Write <<interface>> on its own line.')
    }
    const member = parseMember(raw)
    if (member.kind === 'method') node.methods.push(member)
    else node.attributes.push(member)
  }

  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const text = s.text
    const consumed = accessibilityStatement(list, i, d.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }

    if (text === '}') {
      if (!namespace) throw new DiagramError('"}" without an open class or namespace', s.line, s.column)
      namespace = null
      continue
    }

    let m = /^namespace\s+(\S+?)\s*\{$/u.exec(text)
    if (m) {
      if (namespace) {
        throw new DiagramError('Namespaces do not nest', s.line, s.column, 'Close the namespace before opening another, or use a dotted name: namespace A.B {')
      }
      if (!/^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u.test(m[1]!)) {
        throw new DiagramError(`"${m[1]}" is not a namespace name`, s.line, s.column + 10)
      }
      namespace = { id: m[1]!, s }
      if (!d.namespaces.has(m[1]!)) d.namespaces.set(m[1]!, { id: m[1]! })
      continue
    }

    m = /^direction\s+(\w+)$/.exec(text)
    if (m) {
      const dir = DIRECTIONS[m[1]!.toUpperCase()]
      if (!dir) throw new DiagramError(`"${m[1]}" is not a direction`, s.line, s.column + 10, 'Use TB, BT, LR or RL.')
      d.direction = dir
      continue
    }

    if (/^class\s+`/.test(text)) {
      throw new DiagramError(
        'Class names in backquotes are not supported',
        s.line,
        s.column + 6,
        'Give the class an id and a label: class Animal["Animal Class!"].',
      )
    }
    m = DECLARATION.exec(text)
    if (m) {
      const node = touch(m[1]!)
      if (m[2] !== undefined) {
        node.generic = m[2]
        node.label = `${node.id}<${generics(m[2])}>`
      }
      if (m[3] !== undefined) node.label = m[3]
      if (m[4]) node.classes.push(m[4])
      if (m[5]) node.annotations.push(m[5])
      if (m[6] !== undefined && !m[6].endsWith('}')) {
        let j = i + 1
        for (; j < list.length && list[j]!.text !== '}'; j++) addMember(node, list[j]!.text, list[j]!)
        if (j >= list.length) {
          throw new DiagramError(`The body of class "${node.id}" is not closed`, s.line, s.column, 'Add "}" on its own line.')
        }
        i = j
      }
      continue
    }
    if (/^class\s/.test(text)) {
      throw new DiagramError(`"${text}" is not a class declaration`, s.line, s.column, 'Write class Name, class Name~T~, class Name["Label"] or class Name {.')
    }

    m = ANNOTATION.exec(text)
    if (m) {
      touch(m[2]!).annotations.push(m[1]!)
      continue
    }

    if (namespace) {
      throw new DiagramError(
        'Only class declarations go inside a namespace',
        s.line,
        s.column,
        'Write relationships, notes and members ("Class : member") after the namespace block.',
      )
    }

    m = /^classDef\s+([\w,-]+)\s+(.+)$/.exec(text)
    if (m) {
      const style = parseStyle(m[2]!, s.line, s.column)
      for (const cls of m[1]!.split(',')) d.classDefs.set(cls.trim(), style)
      continue
    }
    m = /^cssClass\s+("[^"]*"|\S+)\s+([\w-]+)$/.exec(text)
    if (m) {
      const ids = m[1]!.replace(/^"|"$/g, '').split(',').map((x) => x.trim()).filter(Boolean)
      pendingClasses.push({ ids, cls: m[2]!, s })
      continue
    }
    m = new RegExp(`^style\\s+(${CLS})\\s+(.+)$`, 'u').exec(text)
    if (m) {
      pendingStyles.push({ id: m[1]!, style: parseStyle(m[2]!, s.line, s.column), s })
      continue
    }
    m = new RegExp(`^(?:click\\s+(${CLS})\\s+href|link\\s+(${CLS}))\\s+"([^"]*)"(?:\\s+"([^"]*)")?(?:\\s+${TARGETS})?$`, 'u').exec(text)
    if (m) {
      pendingLinks.push({ id: (m[1] ?? m[2])!, href: m[3]!, tooltip: m[4], target: m[5], s })
      continue
    }
    // `callback` and `click … call`: scripts from the diagram text are never run.
    if (/^callback\s/.test(text) || new RegExp(`^click\\s+${CLS}\\s+call\\s`, 'u').test(text)) continue
    if (/^(click|link)\s/.test(text)) {
      throw new DiagramError(`"${text}" is not a link`, s.line, s.column, 'Write click Name href "url" or link Name "url".')
    }

    m = /^note\s+for\s+(\S+)\s+"(.*)"$/u.exec(text)
    if (m) {
      d.notes.push({ target: m[1]!, text: m[2]!.replace(/\\n/g, '\n') })
      pendingNotes.push({ target: m[1]!, s })
      continue
    }
    m = /^note\s+"(.*)"$/u.exec(text)
    if (m) {
      d.notes.push({ text: m[1]!.replace(/\\n/g, '\n') })
      continue
    }
    if (/^note\b/.test(text)) {
      throw new DiagramError(`"${text}" is not a note`, s.line, s.column, 'Write note "text" or note for Class "text".')
    }

    m = RELATION.exec(text)
    if (m) {
      const from = touch(m[1]!).id
      const to = touch(m[7]!).id
      const label = m[8]?.trim()
      d.relations.push({
        from,
        to,
        fromEnd: m[3] ? LEFT_END[m[3]]! : 'none',
        toEnd: m[5] ? RIGHT_END[m[5]]! : 'none',
        dashed: m[4] === '..',
        fromCardinality: m[2],
        toCardinality: m[6],
        label: label ? label.replace(/^"(.*)"$/, '$1') : undefined,
      })
      continue
    }
    if (/\(\)\s*(--|\.\.)|(--|\.\.)\s*\(\)/.test(text)) {
      throw new DiagramError(
        'Lollipop interfaces are not supported',
        s.line,
        s.column + Math.max(0, text.search(/\(\)|--\(|\.\.\(/)),
        'Draw the interface as a class: class IShape { <<interface>> } and Shape ..|> IShape.',
      )
    }

    m = MEMBER.exec(text)
    if (m) {
      addMember(touch(m[1]!), m[2]!.trim(), s)
      continue
    }

    const generic = new RegExp(`^(${CLS})~`, 'u').exec(text)
    if (generic) {
      throw new DiagramError(
        'A generic parameter goes on the class declaration',
        s.line,
        s.column + generic[1]!.length,
        `Declare it with class ${generic[1]}~T~ and refer to the class as ${generic[1]}.`,
      )
    }
    const rel = new RegExp(`^(${CLS})\\s*(?:"[^"]*"\\s*)?([^\\p{L}\\p{N}_\\s":]{2,})`, 'u').exec(text)
    if (rel) {
      throw new DiagramError(
        `"${rel[2]}" is not a relationship`,
        s.line,
        s.column + text.indexOf(rel[2]!, rel[1]!.length),
        'Use <|--, *--, o--, -->, --, ..>, ..|> or .. (heads at either end).',
      )
    }
    if (new RegExp(`^${CLS}$`, 'u').test(text)) {
      throw new DiagramError(`"${text}" alone is not a statement`, s.line, s.column, `Declare a class with "class ${text}".`)
    }
    throw new DiagramError(`"${text}" is not a class diagram statement`, s.line, s.column)
  }
  if (namespace) {
    throw new DiagramError(`Namespace "${namespace.id}" is not closed`, namespace.s.line, namespace.s.column, 'Add "}".')
  }

  for (const c of pendingClasses) {
    for (const id of c.ids) {
      const target = d.classes.get(id)
      if (!target) throw new DiagramError(`cssClass refers to an unknown class "${id}"`, c.s.line, c.s.column)
      target.classes.push(c.cls)
    }
  }
  for (const st of pendingStyles) {
    const target = d.classes.get(st.id)
    if (!target) throw new DiagramError(`style refers to an unknown class "${st.id}"`, st.s.line, st.s.column)
    target.style = st.style
  }
  for (const l of pendingLinks) {
    const target = d.classes.get(l.id)
    if (!target) throw new DiagramError(`A link refers to an unknown class "${l.id}"`, l.s.line, l.s.column)
    const href = safeHref(l.href)
    if (href === null) {
      throw new DiagramError(`The link "${l.href}" is not allowed`, l.s.line, l.s.column, 'Use http(s), mailto or a relative address.')
    }
    target.link = { href, tooltip: l.tooltip, target: l.target }
  }
  for (const n of pendingNotes) {
    if (!d.classes.has(n.target)) throw new DiagramError(`A note refers to an unknown class "${n.target}"`, n.s.line, n.s.column)
  }
  return d
}
