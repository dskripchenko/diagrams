/**
 * PlantUML class and object diagrams, read into the class model through
 * Mermaid's class parser: declarations, members and relationships are
 * rewritten into Mermaid's; packages, stereotypes and notes are set on the
 * model afterwards.
 *
 *     @startuml
 *     package shop {
 *       abstract class Shape {
 *         {abstract} +area() : double
 *         -name : String
 *       }
 *       class Circle extends Shape
 *       interface Drawable
 *     }
 *     Circle ..|> Drawable
 *     Shape "1" *-- "many" Point : vertices
 *     @enduml
 *
 * Supported: class, abstract class, interface, enum, annotation, entity,
 * struct, record, exception, protocol, metaclass, object, map; quoted names,
 * aliases, generics (`<T>`), stereotypes, colours, `extends` / `implements`;
 * bodies with fields, methods, `{static}`, `{abstract}`, separators, enum
 * values, map entries; `Class : member`; relationships with every head
 * (`<|`, `*`, `o`, `<`, `>`, `|>`), dotted lines, direction words,
 * multiplicities and labels; packages and namespaces (nested ones are named
 * by their path); notes on a class, floating or tied with `..`.
 */
import { DiagramError } from '../core/errors'
import type { Statement } from '../core/scanner'
import { parseClass, type ClassDiagram } from '../diagrams/class/parser'
import { labelText, unquoted, type PlantUmlSource } from './source'
import { plainArrow, Translation, withoutColour } from './translate'

const KINDS =
  'abstract\\s+class|abstract|class|interface|enum|annotation|entity|struct|record|exception|protocol|metaclass|stereotype|object|map|circle|diamond'
const DECLARATION = new RegExp(`^(${KINDS})\\s+(.+)$`, 'i')
/** The annotation a kind of declaration carries. */
const ANNOTATIONS: Record<string, string | undefined> = {
  abstract: 'abstract',
  'abstract class': 'abstract',
  interface: 'interface',
  enum: 'enumeration',
  annotation: 'annotation',
  entity: 'entity',
  struct: 'struct',
  record: 'record',
  exception: 'exception',
  protocol: 'protocol',
  metaclass: 'metaclass',
  stereotype: 'stereotype',
}

const NAME = String.raw`"[^"]+"|[\p{L}\p{N}_$][\p{L}\p{N}_.$]*(?:<[^>]*>)?`
const LEFT = String.raw`<\||\*|o|<|#|x|\}|\+|\^`
const RIGHT = String.raw`\|>|\*|o|>|#|x|\{|\+|\^`
const RELATION = new RegExp(
  `^(${NAME})\\s*(?:"([^"]*)")?\\s*(${LEFT})?([-.]+(?:\\[[^\\]]*\\])?(?:(?:up|down|left|right|le|ri|do|u|d|l|r)(?=[-.]))?[-.]*(?:\\[[^\\]]*\\])?[-.]*)(${RIGHT})?\\s*(?:"([^"]*)")?\\s*(${NAME})\\s*(?::\\s*(.*))?$`,
  'u',
)

/** A Mermaid class id for a PlantUML name: generics and odd characters go to the label. */
function idOf(name: string): string {
  return unquoted(name).replace(/<.*$/, '').replace(/[^\p{L}\p{N}_]/gu, '_').replace(/^_+|_+$/g, '') || 'Class'
}

/** A note's text on one Mermaid line: line breaks as `\n`, quotes as entities. */
function noteText(text: string): string {
  return text.replace(/"/g, '#quot;')
}

/** A member line rewritten for Mermaid: `{static}` → `$`, `{abstract}` → `*`. */
function member(text: string): string | null {
  let t = text.trim()
  if (/^(--|\.\.|==|__)(.*(--|\.\.|==|__))?$/.test(t)) return null
  let mark = ''
  t = t.replace(/\{(static|classifier)\}\s*/i, () => ((mark = '$'), ''))
  t = t.replace(/\{abstract\}\s*/i, () => ((mark = '*'), ''))
  t = t.replace(/\{(field|method)\}\s*/i, '')
  // Generics in members: Mermaid writes them with tildes.
  t = t.replace(/<([^<>]*)>/g, '~$1~')
  return t + mark
}

class Reader {
  readonly t = new Translation('classDiagram')
  /** Shown names and aliases → class ids. */
  private readonly ids = new Map<string, string>()
  private readonly annotations = new Map<string, string[]>()
  private readonly packages = new Map<string, string>()
  /** Open braces: a class body or a package. */
  private readonly open: ({ kind: 'class'; id: string; after: string[] } | { kind: 'package'; name: string } | { kind: 'group' })[] = []
  /** Floating notes by alias, attached when a `..` link names them. */
  private readonly floating = new Map<string, { text: string; s: Statement; used: boolean }>()

  constructor(private readonly list: Statement[]) {}

  private ref(name: string): string {
    const raw = unquoted(name)
    return this.ids.get(raw) ?? this.ids.get(raw.replace(/<.*$/, '')) ?? this.declare(raw, undefined)
  }

  /** A class known by id; `shown` is its label when it differs. */
  private declare(name: string, shown: string | undefined): string {
    const id = idOf(name)
    this.ids.set(name, id)
    this.ids.set(id, id)
    if (shown) this.ids.set(shown, id)
    return id
  }

  private package(): string | undefined {
    const names = this.open.filter((o) => o.kind === 'package').map((o) => (o as { name: string }).name)
    return names.length > 0 ? names.join('.') : undefined
  }

  run(): ClassDiagram {
    for (let i = 0; i < this.list.length; i++) i = this.statement(i)
    if (this.open.length > 0) throw new DiagramError('A "{" is never closed', 0, 0, 'Close it with "}".')
    const d = this.t.parse(parseClass)
    for (const [id, list] of this.annotations) {
      const c = d.classes.get(id)
      if (c) for (const a of list) if (!c.annotations.includes(a)) c.annotations.push(a)
    }
    for (const [id, pkg] of this.packages) {
      const c = d.classes.get(id)
      if (!c) continue
      c.namespace = pkg
      if (!d.namespaces.has(pkg)) d.namespaces.set(pkg, { id: pkg })
    }
    for (const n of this.floating.values()) if (!n.used) d.notes.push({ text: n.text.replace(/\\n/g, '\n').replace(/#quot;/g, '"') })
    return d
  }

  private statement(i: number): number {
    const s = this.list[i]!
    const text = s.text
    const top = this.open[this.open.length - 1]
    let m: RegExpExecArray | null

    if (text === '}') {
      const closed = this.open.pop()
      if (!closed) throw new DiagramError('"}" without a "{" to close', s.line, s.column)
      if (closed.kind === 'class') {
        this.t.add('}', s)
        // `extends` / `implements` of a class with a body: after the body.
        for (const line of closed.after) this.t.add(line, s)
      }
      return i
    }
    if (top?.kind === 'class') {
      const line = member(text)
      if (line !== null) this.t.add(line, s)
      return i
    }
    if ((m = /^(package|namespace|together|rectangle|folder|frame|node|cloud|database)\b\s*(.*?)\s*\{$/i.exec(text))) {
      const word = m[1]!.toLowerCase()
      if (word === 'together') this.open.push({ kind: 'group' })
      else this.open.push({ kind: 'package', name: unquoted(withoutColour(m[2]!).replace(/\s+as\s+\S+$/i, '').replace(/<<.*>>/, '').trim()) || word })
      return i
    }
    if (/^(package|namespace)\b/i.test(text)) {
      throw new DiagramError('A package needs a body', s.line, s.column, 'package Name { … }')
    }
    if ((m = /^[hr]?note\s+(left|right|top|bottom)\s+of\s+(.+?)\s*(?:#\S+)?\s*(?::\s*(.*))?$/i.exec(text))) {
      const target = this.ref(m[2]!)
      let body = m[3]
      let end = i
      if (body === undefined) ({ body, end } = this.multiline(i))
      this.t.add(`note for ${target} "${noteText(body)}"`, s)
      return end
    }
    if ((m = /^[hr]?note\s+"([^"]*)"\s+as\s+(\S+)$/i.exec(text)) || (m = /^[hr]?note\s+as\s+(\S+)$/i.exec(text))) {
      const alias = m[2] ?? m[1]!
      let body = m[2] ? m[1]! : undefined
      let end = i
      if (body === undefined) ({ body, end } = this.multiline(i))
      this.floating.set(alias, { text: noteText(body), s, used: false })
      return end
    }
    if ((m = /^[hr]?note\s+"([^"]*)"$/i.exec(text))) {
      this.t.add(`note "${noteText(m[1]!)}"`, s)
      return i
    }
    if (/^note\s+on\s+link\b/i.test(text)) {
      // A note on a link has no place in the class model; its lines are skipped.
      return /:/.test(text) ? i : this.multiline(i).end
    }
    if ((m = DECLARATION.exec(text)) && !RELATION.test(text)) {
      this.declaration(m[1]!.toLowerCase().replace(/\s+/g, ' '), m[2]!, s)
      return i
    }
    if ((m = RELATION.exec(text))) {
      this.relation(m, s)
      return i
    }
    if ((m = /^("[^"]+"|[\p{L}\p{N}_$][\p{L}\p{N}_.$]*)\s*:\s*(.*)$/u.exec(text))) {
      const line = member(m[2]!)
      if (line !== null) this.t.add(`${this.ref(m[1]!)} : ${line}`, s)
      return i
    }
    throw new DiagramError(`"${text}" is not a class diagram statement`, s.line, s.column)
  }

  private declaration(kind: string, rest: string, s: Statement): void {
    let text = withoutColour(rest.trim())
    const body = text.endsWith('{')
    if (body) text = text.slice(0, -1).trim()
    if (text.endsWith('{}')) text = text.slice(0, -2).trim()
    const stereotypes: string[] = []
    text = text.replace(/\s*<<\s*([^>]*?)\s*>>/g, (_, st: string) => (stereotypes.push(st), '')).trim()
    const parents: { name: string; dotted: boolean }[] = []
    // `extends A, B implements I, J`, in either order.
    const clause = /\s+(extends|implements)\s+(.+?)(?=\s+(?:extends|implements)\s+|$)/gi
    const tail = /\s+(extends|implements)\s+.*$/i.exec(text)
    if (tail) {
      for (const c of tail[0].matchAll(clause)) {
        for (const p of c[2]!.split(',')) parents.push({ name: p.trim(), dotted: c[1]!.toLowerCase() === 'implements' })
      }
      text = text.slice(0, tail.index)
    }
    let name = text
    let shown: string | undefined
    let m = /^"([^"]+)"\s+as\s+(\S+)$/.exec(text)
    if (m) {
      shown = m[1]
      name = m[2]!
    } else if ((m = /^(\S+)\s+as\s+"([^"]+)"$/.exec(text))) {
      name = m[1]!
      shown = m[2]
    } else if (/^"[^"]+"$/.test(text)) {
      shown = unquoted(text)
      name = shown
    }
    const generic = /<([^>]*)>$/.exec(name)?.[1]
    const id = this.declare(name.replace(/<.*$/, ''), shown)
    if (shown === undefined && id !== name.replace(/<.*$/, '')) shown = name.replace(/<.*$/, '')
    const label = shown !== undefined ? `["${labelText(shown).replace(/"/g, '#quot;')}"]` : ''
    this.t.add(`class ${id}${generic ? `~${generic.replace(/\s/g, '')}~` : ''}${label}${body ? ' {' : ''}`, s)
    const annotation = ANNOTATIONS[kind]
    const list = this.annotations.get(id) ?? []
    if (annotation) list.push(annotation)
    list.push(...stereotypes)
    this.annotations.set(id, list)
    const pkg = this.package()
    if (pkg && !this.packages.has(id)) this.packages.set(id, pkg)
    const inherits = parents.map((p) => `${this.ref(p.name)} <|${p.dotted ? '..' : '--'} ${id}`)
    if (body) this.open.push({ kind: 'class', id, after: inherits })
    else for (const line of inherits) this.t.add(line, s)
  }

  private relation(m: RegExpExecArray, s: Statement): void {
    const [, a, ma, lh, rawBody, rh, mb, b, label] = m
    // A floating note tied to a class.
    for (const [note, other] of [[a!, b!], [b!, a!]] as const) {
      const n = this.floating.get(note)
      if (n) {
        n.used = true
        this.t.add(`note for ${this.ref(other)} "${n.text}"`, s)
        return
      }
    }
    const body = plainArrow(rawBody!)
    const line = body.includes('.') ? '..' : '--'
    const keep = (h: string | undefined, allowed: string[]) => (h && allowed.includes(h) ? h : '')
    const left = keep(lh, ['<|', '*', 'o', '<'])
    const right = keep(rh, ['|>', '*', 'o', '>'])
    const from = this.ref(a!)
    const to = this.ref(b!)
    const pkg = this.package()
    for (const id of [from, to]) if (pkg && !this.packages.has(id)) this.packages.set(id, pkg)
    const text = label?.replace(/\s*[<>]\s*$/, '').replace(/^\s*[<>]\s*/, '').trim()
    this.t.add(`${from} ${ma !== undefined ? `"${ma}" ` : ''}${left}${line}${right} ${mb !== undefined ? `"${mb}" ` : ''}${to}${text ? ` : ${labelText(text)}` : ''}`, s)
  }

  private multiline(i: number): { body: string; end: number } {
    const lines: string[] = []
    let j = i + 1
    for (; j < this.list.length && !/^end\s*[hr]?note$/i.test(this.list[j]!.text); j++) lines.push(this.list[j]!.text)
    if (j >= this.list.length) {
      const s = this.list[i]!
      throw new DiagramError('This note is never closed', s.line, s.column, 'Close it with "end note".')
    }
    return { body: lines.join('\\n'), end: j }
  }
}

export function parsePlantUmlClass(src: PlantUmlSource): ClassDiagram {
  const d = new Reader(src.statements).run()
  if (src.direction === 'LR') d.direction = 'LR'
  if (src.title) d.accessibility.title = src.title
  return d
}
