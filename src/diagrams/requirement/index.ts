/**
 * Requirement diagrams (SysML-style), drawn with the class diagram's
 * renderer: a requirement or an element is a box with its kind as the
 * stereotype and its fields as rows; relationships are dashed arrows
 * labelled with their kind.
 *
 *     requirementDiagram
 *       requirement login {
 *         id: 1
 *         text: The user signs in with a password.
 *         risk: high
 *         verifymethod: test
 *       }
 *       element web {
 *         type: service
 *         docref: docs/web.md
 *       }
 *       web - satisfies -> login
 *
 * Kinds: requirement, functionalRequirement, interfaceRequirement,
 * performanceRequirement, physicalRequirement, designConstraint, element.
 * Relationships: contains, copies, derives, satisfies, verifies, refines,
 * traces (`a - kind -> b` or `b <- kind - a`). Also `direction`, `classDef`,
 * `class`, `style` and `:::class`.
 */
import { DiagramError } from '../../core/errors'
import { statements, unquote, type Statement } from '../../core/scanner'
import { parseStyle } from '../../core/style'
import type { ClassDiagram, ClassNode } from '../class/parser'
import { accessibilityStatement } from '../common'
import type { Direction } from '../../layout/layered/types'

const KINDS: Record<string, string> = {
  requirement: 'Requirement',
  functionalrequirement: 'Functional Requirement',
  interfacerequirement: 'Interface Requirement',
  performancerequirement: 'Performance Requirement',
  physicalrequirement: 'Physical Requirement',
  designconstraint: 'Design Constraint',
  element: 'Element',
}
const RELATIONS = ['contains', 'copies', 'derives', 'satisfies', 'verifies', 'refines', 'traces']
const FIELDS: Record<string, string> = { id: 'Id', text: 'Text', risk: 'Risk', verifymethod: 'Verification', type: 'Type', docref: 'Doc ref' }
const RISKS = ['low', 'medium', 'high']
const METHODS = ['analysis', 'inspection', 'test', 'demonstration']
const NAME = String.raw`[\p{L}\p{N}_][\p{L}\p{N}_.-]*|"[^"]+"`

/** The requirement diagram, as the class model it is drawn with. */
export function parseRequirement(source: string): ClassDiagram {
  const list = statements(source)
  const head = list[0]
  if (!head || head.text !== 'requirementDiagram') throw new DiagramError('A requirement diagram starts with "requirementDiagram"', head?.line ?? 1, 1)
  const d: ClassDiagram = { type: 'class', direction: 'TB', classes: new Map(), relations: [], notes: [], namespaces: new Map(), classDefs: new Map(), accessibility: {} }
  const pending: { id: string; s: Statement }[] = []
  const node = (raw: string, s: Statement): ClassNode => {
    const name = unquote(raw)
    let c = d.classes.get(name)
    if (!c) {
      c = { id: name, label: name, annotations: [], attributes: [], methods: [], classes: [] }
      d.classes.set(name, c)
      pending.push({ id: name, s })
    }
    return c
  }
  const declared = new Set<string>()

  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const consumed = accessibilityStatement(list, i, d.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    let m = new RegExp(`^(\\w+)\\s+(${NAME})(?::::([\\w-]+))?\\s*\\{$`, 'u').exec(s.text)
    if (m && KINDS[m[1]!.toLowerCase()]) {
      const c = node(m[2]!, s)
      declared.add(c.id)
      const kind = m[1]!.toLowerCase()
      c.annotations = [KINDS[kind]!]
      if (m[3]) c.classes.push(m[3])
      let j = i + 1
      for (; j < list.length && list[j]!.text !== '}'; j++) {
        const f = list[j]!
        const fm = /^(\w+)\s*:\s*(.*)$/.exec(f.text)
        const key = fm?.[1]!.toLowerCase()
        if (!fm || !FIELDS[key!]) throw new DiagramError(`"${f.text}" is not a field`, f.line, f.column, kind === 'element' ? 'type: …, docref: …' : 'id: …, text: …, risk: low|medium|high, verifymethod: analysis|inspection|test|demonstration')
        let value = unquote(fm[2]!.trim())
        if (key === 'risk') {
          if (!RISKS.includes(value.toLowerCase())) throw new DiagramError(`"${value}" is not a risk`, f.line, f.column, 'low, medium, high')
          value = value[0]!.toUpperCase() + value.slice(1).toLowerCase()
        }
        if (key === 'verifymethod') {
          if (!METHODS.includes(value.toLowerCase())) throw new DiagramError(`"${value}" is not a verification method`, f.line, f.column, 'analysis, inspection, test, demonstration')
          value = value[0]!.toUpperCase() + value.slice(1).toLowerCase()
        }
        c.attributes.push({ kind: 'attribute', text: `${FIELDS[key!]}: ${value}` })
      }
      if (j >= list.length) throw new DiagramError(`"${c.id}" is never closed`, s.line, s.column, 'Close it with "}".')
      i = j
      continue
    }
    if (m) throw new DiagramError(`"${m[1]}" is not a kind of requirement`, s.line, s.column, Object.keys(KINDS).join(', '))
    m = new RegExp(`^(${NAME})\\s*-\\s*(\\w+)\\s*->\\s*(${NAME})$`, 'u').exec(s.text) ?? null
    let back = false
    if (!m) {
      m = new RegExp(`^(${NAME})\\s*<-\\s*(\\w+)\\s*-\\s*(${NAME})$`, 'u').exec(s.text)
      back = !!m
    }
    if (m) {
      const kind = m[2]!.toLowerCase()
      if (!RELATIONS.includes(kind)) throw new DiagramError(`"${m[2]}" is not a relationship`, s.line, s.column, RELATIONS.join(', '))
      const [from, to] = back ? [m[3]!, m[1]!] : [m[1]!, m[3]!]
      d.relations.push({ from: node(from, s).id, to: node(to, s).id, fromEnd: 'none', toEnd: 'arrow', dashed: true, label: `«${kind}»` })
      continue
    }
    if ((m = /^direction\s+(TB|TD|BT|LR|RL)$/.exec(s.text))) {
      d.direction = (m[1] === 'TD' ? 'TB' : m[1]) as Direction
      continue
    }
    if ((m = /^classDef\s+([\w,-]+)\s+(.+)$/.exec(s.text))) {
      const style = parseStyle(m[2]!, s.line, s.column)
      for (const n of m[1]!.split(',')) d.classDefs.set(n.trim(), style)
      continue
    }
    if ((m = /^class\s+(.+?)\s+([\w-]+)$/.exec(s.text))) {
      for (const id of m[1]!.split(',')) node(id.trim(), s).classes.push(m[2]!)
      continue
    }
    if ((m = /^style\s+(.+?)\s+(.+)$/.exec(s.text))) {
      const style = parseStyle(m[2]!, s.line, s.column)
      for (const id of m[1]!.split(',')) node(id.trim(), s).style = style
      continue
    }
    throw new DiagramError(`"${s.text}" is not a requirement diagram statement`, s.line, s.column)
  }
  for (const p of pending) {
    if (!declared.has(p.id)) throw new DiagramError(`"${p.id}" is used but never declared`, p.s.line, p.s.column, `requirement ${p.id} { … } or element ${p.id} { … }`)
  }
  return d
}
