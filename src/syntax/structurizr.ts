/**
 * Structurizr DSL: a C4 model and its views, read into the C4 model of the
 * first view (or, without views, the system landscape).
 *
 *     workspace {
 *       model {
 *         user = person "Customer"
 *         shop = softwareSystem "Shop" {
 *           web = container "Web app" "Storefront" "React"
 *           db = container "Orders" "" "PostgreSQL" "Database"
 *         }
 *         psp = softwareSystem "Payments" "" "External"
 *         user -> web "Uses" "HTTPS"
 *         web -> db "Reads and writes"
 *         web -> psp "Charges"
 *       }
 *       views {
 *         container shop { include * }
 *       }
 *     }
 *
 * Supported: `person`, `softwareSystem`, `container`, `component` with name,
 * description, technology (containers, components) and tags, nested in
 * braces, with or without `id =`; `group "…" { … }`; `tags "…"` and
 * `description "…"` inside an element; relationships `a -> b "desc" "tech"`
 * and `-> b` from inside an element. Views: `systemLandscape`,
 * `systemContext`, `container`, `component` (the first one is drawn;
 * relationships between hidden elements are shown between their visible
 * parents); `autolayout lr` turns the layout. Tags: `External` (or `location
 * External`) draws an external element; `Database` and `Queue`, or
 * `element "Tag" { shape Cylinder|Pipe }` in the styles, set the shape.
 * Deployment views, filtered views, `!docs`, `!adrs` and `!include` are not
 * read.
 */
import { DiagramError } from '../core/errors'
import type { Statement } from '../core/scanner'
import type { C4Boundary, C4Diagram, C4Element, C4Kind, ElementLevel, ElementShape } from '../diagrams/c4/parser'
import { lines } from './text'

/** True when the source starts with `workspace`. */
export function isStructurizr(source: string): boolean {
  return /^workspace\b/i.test(lines(source)[0]?.text ?? '')
}

type Kind = 'person' | 'softwaresystem' | 'container' | 'component'

interface ModelElement {
  id: string
  kind: Kind
  name: string
  description?: string
  technology?: string
  tags: string[]
  parent?: string
  /** A `group` it is in, by name. */
  group?: string
}

interface Relationship {
  from: string
  to: string
  description?: string
  technology?: string
  s: Statement
}

/** The quoted strings of a statement, in order. */
function strings(text: string): string[] {
  return [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]!.replace(/\\(.)/g, '$1'))
}

const LEVEL: Record<Kind, ElementLevel> = { person: 'person', softwaresystem: 'system', container: 'container', component: 'component' }

export function parseStructurizr(source: string): C4Diagram {
  const list = lines(source)
  const elements = new Map<string, ModelElement>()
  const relationships: Relationship[] = []
  const shapes = new Map<string, ElementShape>()
  let view: { kind: string; scope?: string; direction?: 'LR' | 'TB'; s: Statement } | null = null
  let anonymous = 0

  // A stack of open braces: what each one is.
  const stack: { what: string; element?: string; group?: string; tag?: string }[] = []
  const current = () => [...stack].reverse().find((f) => f.element)?.element
  const group = () => [...stack].reverse().find((f) => f.group !== undefined)?.group

  for (const s of list) {
    const t = s.text
    const opens = t.endsWith('{')
    const head = opens ? t.slice(0, -1).trim() : t
    const frame = stack[stack.length - 1]?.what
    let m: RegExpExecArray | null

    if (t === '}') {
      if (!stack.pop()) throw new DiagramError('"}" without a "{"', s.line, s.column)
      continue
    }
    if (/^!(docs|adrs|include|constant|var|const|script|plugin|extend|ref)\b/i.test(t)) {
      throw new DiagramError(`"${t.split(/\s/)[0]}" is not supported`, s.line, s.column, 'Write the model out in full.')
    }
    if (/^!(identifiers|impliedrelationships|elements)\b/i.test(t)) continue

    if (frame === 'styles' || frame === 'style' || frame === 'skip') {
      if ((m = /^element\s+"([^"]+)"$/i.exec(head)) && opens) stack.push({ what: 'style', tag: m[1] })
      else if (opens) stack.push({ what: 'skip' })
      else if (frame === 'style' && (m = /^shape\s+(\w+)$/i.exec(t))) {
        const shape = m[1]!.toLowerCase()
        const tag = stack[stack.length - 1]!.tag!
        if (shape === 'cylinder') shapes.set(tag, 'db')
        else if (shape === 'pipe') shapes.set(tag, 'queue')
        else if (/^person|robot$/.test(shape)) shapes.set(tag, 'person')
      }
      continue
    }
    if (frame === 'views' && opens) {
      m = /^(systemLandscape|systemContext|container|component|deployment|dynamic|filtered|custom|image)\b\s*(\S+)?/i.exec(head)
      const kind = m?.[1]?.toLowerCase()
      if (/^styles$/i.test(head)) {
        stack.push({ what: 'styles' })
        continue
      }
      if (!view && kind && ['systemlandscape', 'systemcontext', 'container', 'component'].includes(kind)) {
        const scope = m![2] && !m![2].startsWith('"') ? m![2] : undefined
        view = { kind, scope, s }
        stack.push({ what: 'view' })
      } else stack.push({ what: 'skip' })
      continue
    }
    // Settings of the views and the workspace without a block (`theme default`, `name "…"`): not drawn.
    if ((frame === 'views' || frame === 'workspace') && !opens) continue
    if (frame === 'view') {
      if ((m = /^autolayout\s+(lr|rl|tb|bt)\b/i.exec(t)) && view) view.direction = /lr|rl/i.test(m[1]!) ? 'LR' : 'TB'
      if (opens) stack.push({ what: 'skip' })
      continue
    }
    if (/^workspace\b/i.test(head) && opens) {
      stack.push({ what: 'workspace' })
      continue
    }
    if (/^model$/i.test(head) && opens) {
      stack.push({ what: 'model' })
      continue
    }
    if (/^views$/i.test(head) && opens) {
      stack.push({ what: 'views' })
      continue
    }
    if (/^(configuration|properties|perspectives|branding|terminology|users|deploymentEnvironment|deploymentNode|infrastructureNode|softwareSystemInstance|containerInstance|healthCheck|animation)\b/i.test(head)) {
      if (opens) stack.push({ what: 'skip' })
      continue
    }
    if (frame === 'skip') {
      if (opens) stack.push({ what: 'skip' })
      continue
    }

    // Inside the model.
    if ((m = /^group\s+"([^"]+)"$/i.exec(head)) && opens) {
      stack.push({ what: 'group', group: m[1] })
      continue
    }
    if ((m = /^(?:([\w.-]+)\s*=\s*)?(person|softwareSystem|container|component)\b(.*)$/i.exec(head))) {
      const kind = m[2]!.toLowerCase() as Kind
      const args = strings(m[3]!)
      if (args.length === 0) throw new DiagramError(`A ${m[2]} needs a name`, s.line, s.column, `${m[2]} "Name"`)
      const id = m[1] ?? `${kind}${++anonymous}`
      const e: ModelElement = { id, kind, name: args[0]!, description: args[1] || undefined, tags: [], parent: current(), group: group() }
      if (kind === 'container' || kind === 'component') {
        e.technology = args[2] || undefined
        if (args[3]) e.tags.push(...args[3].split(',').map((x) => x.trim()))
      } else if (args[2]) e.tags.push(...args[2].split(',').map((x) => x.trim()))
      elements.set(id, e)
      if (opens) stack.push({ what: 'element', element: id })
      continue
    }
    if ((m = /^(?:([\w.-]+)\s+)?->\s*([\w.-]+)(.*)$/.exec(head))) {
      const from = m[1] ?? current()
      if (!from) throw new DiagramError('A relationship without a source', s.line, s.column, 'a -> b "Uses"')
      const args = strings(m[3]!)
      relationships.push({ from, to: m[2]!, description: args[0] || undefined, technology: args[1] || undefined, s })
      if (opens) stack.push({ what: 'skip' })
      continue
    }
    if (frame === 'element') {
      const own = elements.get(current()!)!
      if ((m = /^tags\s+(.*)$/i.exec(t))) own.tags.push(...strings(m[1]!).flatMap((x) => x.split(',').map((y) => y.trim())))
      else if ((m = /^description\s+"(.*)"$/i.exec(t))) own.description = m[1]
      else if ((m = /^technology\s+"(.*)"$/i.exec(t))) own.technology = m[1]
      else if (/^location\s+external$/i.test(t)) own.tags.push('External')
      else if (opens) stack.push({ what: 'skip' })
      else if (!/^(url|properties|perspectives|location)\b/i.test(t)) throw new DiagramError(`"${t}" is not an element statement`, s.line, s.column)
      continue
    }
    if (opens) {
      stack.push({ what: 'skip' })
      continue
    }
    throw new DiagramError(`"${t}" is not a Structurizr statement`, s.line, s.column)
  }
  if (stack.length > 0) throw new DiagramError('A "{" is never closed', 0, 0, 'Close it with "}".')
  for (const r of relationships) {
    for (const id of [r.from, r.to]) if (!elements.has(id)) throw new DiagramError(`"${id}" is not an element`, r.s.line, r.s.column)
  }
  if (elements.size === 0) throw new DiagramError('The model has no elements', 0, 0, 'person "User"')
  return toC4(elements, relationships, shapes, view)
}

/** The C4 diagram of one view: the elements it shows and the relationships between them, lifted to what is shown. */
function toC4(
  elements: Map<string, ModelElement>,
  relationships: Relationship[],
  shapes: Map<string, ElementShape>,
  view: { kind: string; scope?: string; direction?: 'LR' | 'TB'; s: Statement } | null,
): C4Diagram {
  const kindOf: Record<string, C4Kind> = { systemlandscape: 'C4Context', systemcontext: 'C4Context', container: 'C4Container', component: 'C4Component' }
  const viewKind = view?.kind ?? 'systemlandscape'
  const scope = view?.scope ? elements.get(view.scope) : undefined
  if (view?.scope && !scope) throw new DiagramError(`"${view.scope}" is not an element`, view.s.line, view.s.column)
  const ancestors = (id: string): string[] => {
    const out: string[] = []
    let p = elements.get(id)?.parent
    while (p) {
      out.push(p)
      p = elements.get(p)?.parent
    }
    return out
  }
  // What the view shows: an element's nearest shown self-or-ancestor.
  const shown = (e: ModelElement): boolean => {
    if (e.kind === 'person' || e.kind === 'softwaresystem') {
      return !(viewKind === 'container' && e.id === scope?.id) && !(viewKind === 'component' && e.id === scope?.parent)
    }
    if (e.kind === 'container') return (viewKind === 'container' && e.parent === scope?.id) || (viewKind === 'component' && e.parent === scope?.parent && e.id !== scope?.id)
    return viewKind === 'component' && e.parent === scope?.id
  }
  const visible = (id: string): string | undefined => [id, ...ancestors(id)].find((x) => shown(elements.get(x)!))

  const d: C4Diagram = {
    type: 'c4',
    kind: kindOf[viewKind]!,
    direction: view?.direction ?? 'TB',
    elements: new Map(),
    boundaries: new Map(),
    children: new Map([['', []]]),
    relations: [],
    shapeInRow: 4,
    boundaryInRow: 2,
    accessibility: {},
  }
  const child = (scopeId: string, id: string) => {
    if (!d.children.has(scopeId)) d.children.set(scopeId, [])
    d.children.get(scopeId)!.push(id)
  }
  // The scope of the view is a boundary around its contents.
  let inner = ''
  if (scope && viewKind === 'container') {
    const b: C4Boundary = { id: scope.id, kind: 'system', label: scope.name, description: scope.description }
    d.boundaries.set(b.id, b)
    child('', b.id)
    inner = b.id
  } else if (scope && viewKind === 'component') {
    const system = scope.parent ? elements.get(scope.parent) : undefined
    let outer = ''
    if (system) {
      d.boundaries.set(system.id, { id: system.id, kind: 'system', label: system.name, description: system.description })
      child('', system.id)
      outer = system.id
    }
    d.boundaries.set(scope.id, { id: scope.id, kind: 'container', label: scope.name, description: scope.description, parent: outer || undefined, type: scope.technology ? `Container: ${scope.technology}` : undefined })
    child(outer, scope.id)
    inner = scope.id
  }
  for (const e of elements.values()) {
    if (!shown(e)) continue
    const external = e.tags.some((t) => t.toLowerCase() === 'external')
    const tagShape = e.tags.map((t) => shapes.get(t)).find(Boolean)
    const shape: ElementShape = e.kind === 'person' ? 'person' : (tagShape ?? (e.tags.some((t) => /^database$/i.test(t)) ? 'db' : e.tags.some((t) => /^queue$/i.test(t)) ? 'queue' : 'box'))
    const parent = e.kind === 'component' && viewKind === 'component' ? inner : e.kind === 'container' && viewKind === 'container' ? inner : e.kind === 'container' && viewKind === 'component' ? (scope?.parent ?? '') : ''
    const el: C4Element = { id: e.id, level: LEVEL[e.kind], shape, external, label: e.name, techn: e.technology, description: e.description, parent: parent || undefined }
    d.elements.set(e.id, el)
    child(parent, e.id)
  }
  const seen = new Set<string>()
  for (const r of relationships) {
    const from = visible(r.from)
    const to = visible(r.to)
    if (!from || !to || from === to) continue
    const key = `${from}→${to}→${r.description ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    d.relations.push({ from, to, label: r.description ?? '', techn: r.technology, arrows: 'end', hidden: false, line: r.s.line, column: r.s.column })
  }
  return d
}
