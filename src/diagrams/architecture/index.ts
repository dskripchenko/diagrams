/**
 * Architecture diagrams (`architecture-beta`): services with an icon,
 * groups, junctions and edges between them — drawn with the flowchart's
 * layout and shapes.
 *
 *     architecture-beta
 *       group api(cloud)[API]
 *       service db(database)[Database] in api
 *       service disk(disk)[Storage] in api
 *       service server(server)[Server] in api
 *       service gateway(internet)[Gateway]
 *       db:L -- R:server
 *       disk:T -- B:server
 *       gateway:R --> L:server
 *
 * Icons: cloud, database, disk, internet, server (other names draw a box).
 * Edges: `--`, `-->`, `<--`, `<-->`, with optional sides (`:L`, `R:`), which
 * are accepted (the layout routes the edges), and `{group}` to point at the
 * group a service is in. A label goes in the line: `a:R -[text]- L:b`.
 */
import { DiagramError } from '../../core/errors'
import { statements } from '../../core/scanner'
import type { ShapeKind } from '../../core/shapes'
import type { EdgeEnd, Flowchart } from '../flowchart/parser'
import { accessibilityStatement } from '../common'

const ICONS: Record<string, ShapeKind> = {
  cloud: 'cloud',
  database: 'cylinder',
  disk: 'storage',
  internet: 'circle',
  server: 'node',
}

const ID = String.raw`[\p{L}\p{N}_][\p{L}\p{N}_-]*`
const DECLARE = new RegExp(`^(service|group)\\s+(${ID})(?:\\(([^)]*)\\))?(?:\\[([^\\]]*)\\])?(?:\\s+in\\s+(${ID}))?$`, 'u')
const JUNCTION = new RegExp(`^junction\\s+(${ID})(?:\\s+in\\s+(${ID}))?$`, 'u')
const EDGE = new RegExp(`^(${ID})(\\{group\\})?(?::([LRTB]))?\\s*(<)?-(?:\\[([^\\]]*)\\])?-(>)?\\s*(?:([LRTB]):)?(${ID})(\\{group\\})?$`, 'u')

/** The architecture diagram, as the flowchart model it is drawn with. */
export function parseArchitecture(source: string): Flowchart {
  const list = statements(source)
  const head = list[0]
  if (!head || head.text !== 'architecture-beta') throw new DiagramError('An architecture diagram starts with "architecture-beta"', head?.line ?? 1, 1)
  const chart: Flowchart = { type: 'flowchart', direction: 'LR', nodes: new Map(), edges: [], subgraphs: new Map(), classDefs: new Map(), accessibility: {} }
  const groupOf = new Map<string, string | undefined>()
  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const consumed = accessibilityStatement(list, i, chart.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    let m: RegExpExecArray | null
    if ((m = DECLARE.exec(s.text))) {
      const [, kind, id, icon, title, parent] = m
      if (parent && !chart.subgraphs.has(parent)) throw new DiagramError(`"${parent}" is not a group declared above`, s.line, s.column + s.text.lastIndexOf(parent))
      if (chart.nodes.has(id!) || chart.subgraphs.has(id!)) throw new DiagramError(`"${id}" is declared twice`, s.line, s.column)
      const shape = icon ? (ICONS[icon.toLowerCase()] ?? 'rect') : 'rect'
      if (kind === 'group') {
        // A group is a plain frame: a cloud outline is smaller than its box and would cut the services at its edges.
        chart.subgraphs.set(id!, { id: id!, title: title ?? id!, markdown: false, parent, classes: [], kind: 'rect' })
      } else {
        chart.nodes.set(id!, { id: id!, text: title ?? id!, markdown: false, shape, classes: [], subgraph: parent })
      }
      groupOf.set(id!, parent)
      continue
    }
    if ((m = JUNCTION.exec(s.text))) {
      chart.nodes.set(m[1]!, { id: m[1]!, text: '', markdown: false, shape: 'start', classes: [], subgraph: m[2] })
      groupOf.set(m[1]!, m[2])
      continue
    }
    if ((m = EDGE.exec(s.text))) {
      const [, a, aGroup, , left, label, right, , b, bGroup] = m
      const end = (id: string, group: string | undefined): string => {
        if (!chart.nodes.has(id) && !chart.subgraphs.has(id)) throw new DiagramError(`"${id}" is not a service, a junction or a group`, s.line, s.column)
        if (!group) return id
        const g = groupOf.get(id)
        if (!g) throw new DiagramError(`"${id}" is in no group`, s.line, s.column)
        return g
      }
      const head = (on: string | undefined): EdgeEnd => (on ? 'arrow' : 'none')
      chart.edges.push({ from: end(a!, aGroup), to: end(b!, bGroup), stroke: 'normal', start: head(left), end: head(right), length: 1, text: label, markdown: false })
      continue
    }
    throw new DiagramError(`"${s.text}" is not an architecture statement`, s.line, s.column, 'service id(icon)[Title] in group, a:R --> L:b')
  }
  return chart
}
