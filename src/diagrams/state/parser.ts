/**
 * The state diagram grammar (`stateDiagram-v2`, and the older `stateDiagram`
 * with the same syntax): states, transitions, composites, concurrent regions,
 * pseudo states, notes, classes.
 */
import { DiagramError } from '../../core/errors'
import { statements, type Statement } from '../../core/scanner'
import { parseStyle, type UserStyle } from '../../core/style'
import type { Direction } from '../../layout/layered/types'
import { accessibilityStatement, type Accessibility } from '../common'

export type StateKind = 'state' | 'start' | 'end' | 'choice' | 'fork' | 'join'

export interface StateNode {
  id: string
  kind: StateKind
  /** Display name; the id unless `state "…" as id` gave one. */
  name: string
  descriptions: string[]
  /** The composite or region it sits in. */
  parent?: string
  classes: string[]
  style?: UserStyle
}

export interface StateComposite {
  id: string
  name: string
  parent?: string
  /** A concurrent region: no title, drawn dashed inside its composite. */
  region: boolean
  direction?: Direction
  classes: string[]
  style?: UserStyle
}

export interface StateTransition {
  from: string
  to: string
  label?: string
}

export interface StateNote {
  target: string
  side: 'left' | 'right'
  text: string
}

export interface StateDiagram {
  type: 'state'
  direction: Direction
  states: Map<string, StateNode>
  composites: Map<string, StateComposite>
  transitions: StateTransition[]
  notes: StateNote[]
  classDefs: Map<string, UserStyle>
  accessibility: Accessibility
}

const DIRECTIONS: Record<string, Direction> = { TB: 'TB', TD: 'TB', BT: 'BT', LR: 'LR', RL: 'RL' }
const ID = '[\\p{L}\\p{N}_][\\p{L}\\p{N}_.-]*'
const REF = `(\\[\\*\\]|${ID})`

export function parseState(source: string): StateDiagram {
  const list = statements(source)
  const head = list[0]
  if (!head || !/^stateDiagram(-v2)?$/.test(head.text)) {
    throw new DiagramError('A state diagram starts with "stateDiagram-v2"', head?.line ?? 1, 1)
  }
  const d: StateDiagram = {
    type: 'state',
    direction: 'TB',
    states: new Map(),
    composites: new Map(),
    transitions: [],
    notes: [],
    classDefs: new Map(),
    accessibility: {},
  }
  /** Open scopes: composites and regions; the innermost is last. */
  const stack: StateComposite[] = []
  const regionCount = new Map<string, number>()
  const pendingClasses: { ids: string[]; cls: string; s: Statement }[] = []
  const pendingStyles: { id: string; style: UserStyle; s: Statement }[] = []

  const scope = () => stack[stack.length - 1]?.id
  /** `[*]` stands for the start or the end of the current scope. */
  const pseudo = (asSource: boolean): string => {
    const owner = scope() ?? 'root'
    const id = `\u0000${asSource ? 'start' : 'end'}:${owner}`
    if (!d.states.has(id)) {
      d.states.set(id, {
        id,
        kind: asSource ? 'start' : 'end',
        name: '',
        descriptions: [],
        parent: scope(),
        classes: [],
      })
    }
    return id
  }
  const touch = (id: string, s: Statement): StateNode | StateComposite => {
    const composite = d.composites.get(id)
    if (composite) return composite
    let node = d.states.get(id)
    if (!node) {
      node = { id, kind: 'state', name: id, descriptions: [], parent: scope(), classes: [] }
      d.states.set(id, node)
    }
    void s
    return node
  }
  const withClass = (raw: string): { id: string; cls?: string } => {
    const m = /^(.*?):::([\w-]+)$/.exec(raw)
    return m ? { id: m[1]!, cls: m[2] } : { id: raw }
  }

  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const text = s.text
    const consumed = accessibilityStatement(list, i, d.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }

    let m = /^direction\s+(\w+)$/.exec(text)
    if (m) {
      const dir = DIRECTIONS[m[1]!.toUpperCase()]
      if (!dir) throw new DiagramError(`"${m[1]}" is not a direction`, s.line, s.column + 10)
      const current = stack[stack.length - 1]
      if (current) current.direction = dir
      else d.direction = dir
      continue
    }

    m = /^classDef\s+([\w,-]+)\s+(.+)$/.exec(text)
    if (m) {
      const style = parseStyle(m[2]!, s.line, s.column)
      for (const name of m[1]!.split(',')) d.classDefs.set(name.trim(), style)
      continue
    }
    m = /^class\s+(.+?)\s+([\w-]+)$/.exec(text)
    if (m) {
      pendingClasses.push({ ids: m[1]!.split(',').map((x) => x.trim()), cls: m[2]!, s })
      continue
    }
    m = /^style\s+(\S+)\s+(.+)$/.exec(text)
    if (m) {
      pendingStyles.push({ id: m[1]!, style: parseStyle(m[2]!, s.line, s.column), s })
      continue
    }

    // Notes: one-line `note left of a : text` or a block up to `end note`.
    m = new RegExp(`^note\\s+(left|right)\\s+of\\s+(${ID})\\s*(?::\\s*(.*))?$`, 'u').exec(text)
    if (m) {
      const side = m[1] as 'left' | 'right'
      const target = m[2]!
      let body = m[3]
      if (body === undefined) {
        const lines: string[] = []
        let j = i + 1
        for (; j < list.length && list[j]!.text !== 'end note'; j++) lines.push(list[j]!.text)
        if (j >= list.length) throw new DiagramError('The note is not closed', s.line, s.column, 'Add "end note".')
        body = lines.join('\n')
        i = j
      }
      d.notes.push({ target, side, text: body })
      continue
    }

    // Composite: `state Name {`, `state "Title" as Name {`.
    m = new RegExp(`^state\\s+(?:"([^"]*)"\\s+as\\s+)?(${ID})\\s*\\{$`, 'u').exec(text)
    if (m) {
      const id = m[2]!
      if (d.composites.has(id)) throw new DiagramError(`State "${id}" is defined twice`, s.line, s.column)
      const existing = d.states.get(id)
      const composite: StateComposite = {
        id,
        name: m[1] ?? existing?.name ?? id,
        parent: scope(),
        region: false,
        classes: existing?.classes ?? [],
      }
      // A state used before it was opened as a composite becomes the composite.
      if (existing) {
        d.states.delete(id)
        composite.parent = existing.parent
      }
      d.composites.set(id, composite)
      stack.push(composite)
      continue
    }
    if (text === '}') {
      // Close a region first, then its composite.
      while (stack.length > 0 && stack[stack.length - 1]!.region) stack.pop()
      if (stack.length === 0) throw new DiagramError('"}" without an open state', s.line, s.column)
      stack.pop()
      continue
    }
    if (text === '--') {
      // Concurrent regions: everything so far in the composite becomes the
      // first region, what follows goes into the next.
      while (stack.length > 0 && stack[stack.length - 1]!.region) stack.pop()
      const owner = stack[stack.length - 1]
      if (!owner) throw new DiagramError('"--" separates regions inside a composite state', s.line, s.column)
      const n = regionCount.get(owner.id) ?? 0
      if (n === 0) {
        const first: StateComposite = { id: `${owner.id}\u0000r0`, name: '', parent: owner.id, region: true, classes: [] }
        d.composites.set(first.id, first)
        for (const st of d.states.values()) if (st.parent === owner.id) st.parent = first.id
        for (const c of d.composites.values()) if (c.parent === owner.id && c.id !== first.id) c.parent = first.id
        // The first region's own `[*]` keep their ids but now live in the region.
      }
      const next: StateComposite = { id: `${owner.id}\u0000r${n + 1}`, name: '', parent: owner.id, region: true, classes: [] }
      regionCount.set(owner.id, n + 1)
      d.composites.set(next.id, next)
      stack.push(next)
      continue
    }

    // `state "Description" as Id`, `state Id <<choice>>`, `state Id : desc`.
    m = new RegExp(`^state\\s+"([^"]*)"\\s+as\\s+(${ID})$`, 'u').exec(text)
    if (m) {
      const node = touch(m[2]!, s)
      node.name = m[1]!
      continue
    }
    m = new RegExp(`^state\\s+(${ID})\\s*<<(choice|fork|join)>>$`, 'u').exec(text)
    if (m) {
      const node = touch(m[1]!, s)
      if ('kind' in node) node.kind = m[2] as StateKind
      continue
    }
    m = new RegExp(`^state\\s+(${ID})(?:\\s*:\\s*(.*))?$`, 'u').exec(text)
    if (m) {
      const node = touch(m[1]!, s)
      if (m[2] !== undefined && 'descriptions' in node) node.descriptions.push(m[2]!.trim())
      continue
    }

    // Transition.
    m = new RegExp(`^${REF}(?::::([\\w-]+))?\\s*-->\\s*${REF}(?::::([\\w-]+))?\\s*(?::\\s*(.*))?$`, 'u').exec(text)
    if (m) {
      const from = m[1] === '[*]' ? pseudo(true) : touch(m[1]!, s).id
      const to = m[3] === '[*]' ? pseudo(false) : touch(m[3]!, s).id
      if (m[2]) touch(from, s).classes.push(m[2])
      if (m[4]) touch(to, s).classes.push(m[4])
      d.transitions.push({ from, to, label: m[5]?.trim() || undefined })
      continue
    }

    // `Id : description`, or a bare `Id` (optionally `Id:::class`).
    m = new RegExp(`^(${ID})\\s*:\\s*(.*)$`, 'u').exec(text)
    if (m) {
      const node = touch(m[1]!, s)
      if ('descriptions' in node) node.descriptions.push(m[2]!.trim())
      continue
    }
    const bare = withClass(text)
    if (new RegExp(`^${ID}$`, 'u').test(bare.id)) {
      const node = touch(bare.id, s)
      if (bare.cls) node.classes.push(bare.cls)
      continue
    }
    throw new DiagramError(`"${text}" is not a state diagram statement`, s.line, s.column)
  }
  if (stack.some((c) => !c.region)) {
    const open = stack.filter((c) => !c.region).pop()!
    throw new DiagramError(`State "${open.id}" is not closed`, 0, 0, 'Add "}".')
  }

  for (const c of pendingClasses) {
    for (const id of c.ids) {
      const target = d.states.get(id) ?? d.composites.get(id)
      if (!target) throw new DiagramError(`class refers to an unknown state "${id}"`, c.s.line, c.s.column)
      target.classes.push(c.cls)
    }
  }
  for (const st of pendingStyles) {
    const target = d.states.get(st.id) ?? d.composites.get(st.id)
    if (!target) throw new DiagramError(`style refers to an unknown state "${st.id}"`, st.s.line, st.s.column)
    target.style = st.style
  }
  for (const n of d.notes) {
    if (!d.states.has(n.target) && !d.composites.has(n.target)) {
      throw new DiagramError(`A note refers to an unknown state "${n.target}"`)
    }
  }
  return d
}
