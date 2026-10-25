/**
 * Placing a C4 diagram.
 *
 * C4-PlantUML hands its diagrams to Graphviz dot, a layered layout, and its
 * `Rel_U/D/L/R` macros are hints to it. The layered layout here plays the
 * same part: boundaries and deployment nodes are clusters, relations are
 * edges flowing top to bottom (or left to right), and the hints map onto it:
 *
 *   - along the flow (`Rel_D` in a top-down diagram) — an ordinary edge;
 *   - against it (`Rel_U`) — the edge is laid out reversed, so the target
 *     ends up above the source;
 *   - across it (`Rel_L`, `Rel_R`) — the two elements become one row, laid
 *     out as a single box with the relation drawn straight between them.
 *     When they cannot share a row (different boundaries, or the row would
 *     have to be split), the relation is left out of the layout and drawn
 *     directly — unless that line would cut through another element, in
 *     which case it is laid out as an ordinary edge after all.
 *
 * Elements and boundaries that no relation touches would all line up in one
 * rank; they are wrapped into rows of `c4ShapeInRow` and `c4BoundaryInRow`
 * (`UpdateLayoutConfig`) with invisible edges, in declaration order, as
 * Mermaid places its shapes.
 */
import { intersectEllipse, intersectRect, type Box, type Point } from '../../core/geometry'
import { layout, type LayoutCluster, type LayoutEdge, type LayoutNode, type LayoutResult } from '../../layout/layered'
import type { C4Diagram, C4Element, C4Relation, RelDirection } from './parser'

export interface Size {
  width: number
  height: number
}

export interface PlacedRel {
  /** From the `from` end to the `to` end, both ends on the outlines. */
  points: Point[]
  /** Straight segments rather than a curve. */
  straight: boolean
  /** Centre of the label. */
  label?: Point
}

export interface C4Layout {
  width: number
  height: number
  elements: Map<string, Box>
  boundaries: Map<string, Box>
  /** By index into `relations`; hidden relations have none. */
  rels: Map<number, PlacedRel>
}

export interface C4LayoutInput {
  diagram: C4Diagram
  elementSize: Map<string, Size>
  boundaryLabel: Map<string, Size>
  /** Label sizes of drawn relations, by index. */
  relLabel: Map<number, Size>
}

const NODE_SEP = 60
const RANK_SEP = 64
const EDGE_SEP = 18
const CLUSTER_PADDING = 18
/** Least room between two elements of a row, and around a label between them. */
const ROW_GAP = 70
const ROW_LABEL_PAD = 16
/** Height of a person's head above its body; the outline clips edges. */
export const PERSON_HEAD = 40
export const PERSON_HEAD_R = 21

type Axis = 'forward' | 'backward' | 'before' | 'after'

/** A hint relative to the flow of the diagram. */
function axisOf(direction: RelDirection | undefined, flow: 'TB' | 'LR'): Axis {
  if (!direction) return 'forward'
  if (flow === 'TB') {
    return direction === 'down' ? 'forward' : direction === 'up' ? 'backward' : direction === 'left' ? 'before' : 'after'
  }
  return direction === 'right' ? 'forward' : direction === 'left' ? 'backward' : direction === 'up' ? 'before' : 'after'
}

interface Row {
  id: string
  members: string[]
  parent?: string
}

/** Where an edge from `toward` meets an element's outline. */
export function clipElement(element: C4Element, box: Box, toward: Point): Point {
  if (element.shape === 'person') {
    const top = box.y - box.height / 2
    const bodyTop = top + PERSON_HEAD
    const body: Box = { x: box.x, y: (bodyTop + box.y + box.height / 2) / 2, width: box.width, height: box.height - PERSON_HEAD }
    const p = intersectRect(body, toward)
    if (Math.abs(p.y - bodyTop) < 0.5 && Math.abs(p.x - box.x) < PERSON_HEAD_R) {
      return intersectEllipse({ x: box.x, y: top + PERSON_HEAD_R }, PERSON_HEAD_R, PERSON_HEAD_R, toward)
    }
    return p
  }
  return intersectRect(box, toward)
}

function segmentHitsBox(a: Point, b: Point, box: Box, inset = 2): boolean {
  const left = box.x - box.width / 2 + inset
  const right = box.x + box.width / 2 - inset
  const top = box.y - box.height / 2 + inset
  const bottom = box.y + box.height / 2 - inset
  // Liang–Barsky clipping: does any part of the segment fall inside?
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  const checks: [number, number][] = [
    [-dx, a.x - left],
    [dx, right - a.x],
    [-dy, a.y - top],
    [dy, bottom - a.y],
  ]
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
  }
  return t0 < t1
}

/**
 * Closes empty strips across the whole drawing. The layered layout never
 * pulls a part of the graph back towards a part it is not connected to, so
 * shapes nobody links to can be left a long way from the rest. A strip that
 * holds no element, label, route bend or frame side is narrowed to the usual
 * spacing; everything beyond it moves closer, frames spanning it shrink.
 */
function collapse(
  axis: 'x' | 'y',
  keep: number,
  boxes: Map<string, Box>,
  frames: Map<string, Box>,
  rels: Map<number, PlacedRel>,
  labels: Map<number, Size>,
): void {
  const ext = (b: Box) => (axis === 'x' ? b.width : b.height)
  const occupied: [number, number][] = []
  for (const b of boxes.values()) occupied.push([b[axis] - ext(b) / 2, b[axis] + ext(b) / 2])
  for (const f of frames.values()) {
    const lo = f[axis] - ext(f) / 2
    const hi = f[axis] + ext(f) / 2
    // The sides, and on the top the title band.
    occupied.push([lo - 1, lo + (axis === 'y' ? 40 : 1)], [hi - 1, hi + 1])
  }
  for (const [i, rel] of rels) {
    for (const p of rel.points) occupied.push([p[axis] - 1, p[axis] + 1])
    const l = labels.get(i)
    if (rel.label && l) {
      const half = (axis === 'x' ? l.width : l.height) / 2
      occupied.push([rel.label[axis] - half, rel.label[axis] + half])
    }
  }
  if (occupied.length === 0) return
  occupied.sort((a, b) => a[0] - b[0])
  const gaps: { at: number; by: number }[] = []
  let reach = occupied[0]![1]
  for (const [lo, hi] of occupied) {
    if (lo - reach > keep * 1.5) gaps.push({ at: reach, by: lo - reach - keep })
    reach = Math.max(reach, hi)
  }
  if (gaps.length === 0) return
  const map = (v: number): number => {
    let out = v
    for (const g of gaps) if (v > g.at) out -= g.by
    return out
  }
  const mapBox = (b: Box): Box => {
    const lo = map(b[axis] - ext(b) / 2)
    const hi = map(b[axis] + ext(b) / 2)
    return axis === 'x' ? { ...b, x: (lo + hi) / 2, width: hi - lo } : { ...b, y: (lo + hi) / 2, height: hi - lo }
  }
  for (const map2 of [boxes, frames]) for (const [k, b] of map2) map2.set(k, mapBox(b))
  const mapPoint = (p: Point): Point => (axis === 'x' ? { x: map(p.x), y: p.y } : { x: p.x, y: map(p.y) })
  for (const rel of rels.values()) {
    rel.points = rel.points.map(mapPoint)
    if (rel.label) rel.label = mapPoint(rel.label)
  }
}

function nearest(points: readonly Point[], target: Point): number {
  let best = -1
  let bestD = Infinity
  points.forEach((p, i) => {
    const dist = Math.hypot(p.x - target.x, p.y - target.y)
    if (dist < bestD) {
      bestD = dist
      best = i
    }
  })
  return best
}

/**
 * Drops bends the route does not need. The layered layout keeps an edge's
 * bends outside every frame the edge does not belong to, so an edge between
 * nested deployment nodes leaves its frames sideways and comes back; here a
 * run is taken straight wherever it clears every element box, from the
 * first point to the farthest one it can see.
 */
function shortcut(points: readonly Point[], obstacles: readonly Box[]): Point[] {
  if (points.length <= 2) return points.slice()
  const clear = (a: Point, b: Point) => !obstacles.some((box) => segmentHitsBox(a, b, box, -10))
  const out = [points[0]!]
  let i = 0
  while (i < points.length - 1) {
    let j = points.length - 1
    while (j > i + 1 && !clear(points[i]!, points[j]!)) j--
    out.push(points[j]!)
    i = j
  }
  return out
}

export function layoutC4(input: C4LayoutInput): C4Layout {
  const { diagram: d } = input
  const flow = d.direction
  const horizontal = flow === 'LR'

  // 1. Rows from the across-the-flow hints.
  const rowOf = new Map<string, Row>()
  const rows: Row[] = []
  let rowCount = 0
  const rowFor = (id: string): Row => {
    let row = rowOf.get(id)
    if (!row) {
      row = { id: `\u0000row${rowCount++}`, members: [id], parent: d.elements.get(id)!.parent }
      rows.push(row)
      rowOf.set(id, row)
    }
    return row
  }
  /** Relations that wanted a row and did not get one. */
  const loose = new Set<number>()
  d.relations.forEach((r, i) => {
    const axis = axisOf(r.direction, flow)
    if (axis !== 'before' && axis !== 'after') return
    const a = d.elements.get(r.from)
    const b = d.elements.get(r.to)
    if (!a || !b || a === b || a.parent !== b.parent) {
      if (r.from !== r.to) loose.add(i)
      return
    }
    const [first, second] = axis === 'after' ? [a.id, b.id] : [b.id, a.id]
    const left = rowFor(first)
    const right = rowFor(second)
    if (left === right) {
      // Already neighbours in this order: the relation is drawn between them.
      const k = left.members.indexOf(first)
      if (left.members[k + 1] !== second) loose.add(i)
      return
    }
    if (left.members[left.members.length - 1] !== first || right.members[0] !== second) {
      loose.add(i)
      return
    }
    left.members.push(...right.members)
    for (const m of right.members) rowOf.set(m, left)
    rows.splice(rows.indexOf(right), 1)
  })
  const realRows = rows.filter((r) => r.members.length > 1)
  const inRow = (id: string): Row | undefined => {
    const r = rowOf.get(id)
    return r && r.members.length > 1 ? r : undefined
  }

  // The gap after each member of a row: room for the labels between neighbours.
  const gapAfter = new Map<string, number>()
  const between = new Map<string, number[]>()
  const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)
  d.relations.forEach((r, i) => {
    const row = inRow(r.from)
    if (!row || row !== inRow(r.to)) return
    const ka = row.members.indexOf(r.from)
    const kb = row.members.indexOf(r.to)
    if (Math.abs(ka - kb) !== 1) return
    const key = pairKey(r.from, r.to)
    const list = between.get(key) ?? []
    list.push(i)
    between.set(key, list)
  })
  for (const row of realRows) {
    for (let k = 0; k + 1 < row.members.length; k++) {
      const key = pairKey(row.members[k]!, row.members[k + 1]!)
      let need = ROW_GAP
      for (const i of between.get(key) ?? []) {
        const l = input.relLabel.get(i)
        if (l) need = Math.max(need, (horizontal ? l.height : l.width) + ROW_LABEL_PAD * 2)
      }
      gapAfter.set(row.members[k]!, need)
    }
  }
  const rowSize = (row: Row): Size => {
    let along = 0
    let across = 0
    row.members.forEach((m, k) => {
      const s = input.elementSize.get(m)!
      along = Math.max(along, horizontal ? s.width : s.height)
      across += (horizontal ? s.height : s.width) + (k + 1 < row.members.length ? gapAfter.get(m)! : 0)
    })
    return horizontal ? { width: along, height: across } : { width: across, height: along }
  }

  // 2. The layout graph: one node per element or row, one cluster per boundary.
  const unit = (id: string): string => inRow(id)?.id ?? id
  const nodes: LayoutNode[] = []
  const seenRows = new Set<Row>()
  for (const el of d.elements.values()) {
    const row = inRow(el.id)
    if (row) {
      if (seenRows.has(row)) continue
      seenRows.add(row)
      nodes.push({ id: row.id, ...rowSize(row), cluster: row.parent })
    } else {
      nodes.push({ id: el.id, ...input.elementSize.get(el.id)!, cluster: el.parent })
    }
  }
  const clusters: LayoutCluster[] = [...d.boundaries.values()].map((b) => ({
    id: b.id,
    parent: b.parent,
    label: input.boundaryLabel.get(b.id),
  }))

  /**
   * How many ranks an edge needs: every frame it leaves or enters takes a
   * rank of its own for the border, and without the room the frames of the
   * two ends would overlap in height and be squeezed side by side.
   */
  const frameChain = (id: string): string[] => {
    const out: string[] = d.boundaries.has(id) ? [id] : []
    let p = d.elements.get(id)?.parent ?? d.boundaries.get(id)?.parent
    while (p !== undefined) {
      out.push(p)
      p = d.boundaries.get(p)?.parent
    }
    return out
  }
  const span = (a: string, b: string): number => {
    const ca = frameChain(a)
    const cb = frameChain(b)
    const crossed = ca.filter((c) => !cb.includes(c)).length + cb.filter((c) => !ca.includes(c)).length
    return 1 + Math.ceil(crossed / 2)
  }

  /** Relations drawn inside a row, not given to the layout. */
  const rowRels = new Set<number>()
  const relEdges = (includeLoose: boolean): LayoutEdge[] => {
    const out: LayoutEdge[] = []
    d.relations.forEach((r, i) => {
      const a = unit(r.from)
      const b = unit(r.to)
      if (a === b && r.from !== r.to) {
        rowRels.add(i)
        return
      }
      if (loose.has(i) && !includeLoose) return
      const axis = axisOf(r.direction, flow)
      const reversed = axis === 'backward'
      out.push({
        id: String(i),
        from: reversed ? b : a,
        to: reversed ? a : b,
        label: r.hidden ? undefined : input.relLabel.get(i),
        weight: r.hidden ? 0.5 : 1,
        minlen: span(r.from, r.to),
      })
    })
    return out
  }

  // Wrapping of untouched shapes and boundaries into rows.
  const wrapEdges = (edges: LayoutEdge[]): LayoutEdge[] => {
    const endsOf = (unitId: string): string[] => rows.find((r) => r.id === unitId)?.members ?? [unitId]
    const touched = new Set<string>()
    for (const e of edges) for (const id of [...endsOf(e.from), ...endsOf(e.to)]) touched.add(id)
    // A boundary is "touched" only when an edge crosses its frame; edges inside it do not count.
    const crossing = (b: string): boolean =>
      edges.some((e) => {
        const inside = (id: string) => endsOf(id).some((m) => within(m, b))
        return inside(e.from) !== inside(e.to)
      })
    const within = (id: string, b: string): boolean => {
      let p: string | undefined = id
      while (p !== undefined) {
        if (p === b) return true
        p = d.elements.get(p)?.parent ?? d.boundaries.get(p)?.parent
      }
      return false
    }
    const out: LayoutEdge[] = []
    let n = 0
    for (const items of d.children.values()) {
      const shapes: string[] = []
      const frames: string[] = []
      for (const id of items) {
        if (d.elements.has(id)) {
          if (!touched.has(id) && !inRow(id)) shapes.push(id)
        } else if (!crossing(id)) {
          frames.push(id)
        }
      }
      const chain = (list: string[], per: number) => {
        for (let k = 0; k + per < list.length; k++) {
          out.push({ id: `\u0000wrap${n++}`, from: list[k]!, to: list[k + per]!, weight: 0.2 })
        }
      }
      chain(shapes, d.shapeInRow)
      chain(frames, d.boundaryInRow)
      // Boundaries start below the last row of loose shapes, as in Mermaid.
      if (shapes.length > 0 && frames.length > 0) {
        const last = shapes[shapes.length - 1]!
        for (const f of frames.slice(0, d.boundaryInRow)) out.push({ id: `\u0000wrap${n++}`, from: last, to: f, weight: 0.2 })
      }
    }
    return out
  }

  const run = (includeLoose: boolean): LayoutResult => {
    rowRels.clear()
    const edges = relEdges(includeLoose)
    return layout({
      direction: flow,
      nodes,
      edges: [...edges, ...wrapEdges(edges)],
      clusters,
      nodeSep: NODE_SEP,
      rankSep: RANK_SEP,
      edgeSep: EDGE_SEP,
      clusterPadding: CLUSTER_PADDING,
    })
  }

  // 3. Element boxes from the layout, rows unpacked.
  const unpack = (result: LayoutResult): Map<string, Box> => {
    const boxes = new Map<string, Box>()
    for (const el of d.elements.values()) {
      const row = inRow(el.id)
      if (!row) {
        boxes.set(el.id, result.nodes.get(el.id)!)
        continue
      }
      if (boxes.has(el.id)) continue
      const rb = result.nodes.get(row.id)!
      let at = horizontal ? rb.y - rb.height / 2 : rb.x - rb.width / 2
      for (const m of row.members) {
        const s = input.elementSize.get(m)!
        const extent = horizontal ? s.height : s.width
        boxes.set(
          m,
          horizontal
            ? { x: rb.x, y: at + extent / 2, width: s.width, height: s.height }
            : { x: at + extent / 2, y: rb.y, width: s.width, height: s.height },
        )
        at += extent + (gapAfter.get(m) ?? 0)
      }
    }
    return boxes
  }

  let result = run(false)
  let boxes = unpack(result)
  if (loose.size > 0) {
    // A loose relation drawn straight must not cut through an element.
    const blocked = [...loose].some((i) => {
      const r = d.relations[i]!
      if (r.hidden) return false
      const a = boxes.get(r.from) ?? result.clusters.get(r.from)!
      const b = boxes.get(r.to) ?? result.clusters.get(r.to)!
      return [...boxes].some(([id, box]) => id !== r.from && id !== r.to && segmentHitsBox(a, b, box))
    })
    if (blocked) {
      result = run(true)
      boxes = unpack(result)
      loose.clear()
    }
  }

  // 4. Relations.
  const frames = result.clusters
  const endBox = (id: string): Box => boxes.get(id) ?? frames.get(id)!
  const clip = (id: string, toward: Point): Point => {
    const el = d.elements.get(id)
    return el ? clipElement(el, boxes.get(id)!, toward) : intersectRect(frames.get(id)!, toward)
  }
  /**
   * The last stretch into a row member: the layout routed the edge to the
   * row as a whole, so it is bent to arrive square at the member.
   */
  const approach = (id: string, from: Point): Point[] | null => {
    const row = inRow(id)
    if (!row) return null
    const rb = result.nodes.get(row.id)!
    const box = boxes.get(id)!
    const el = d.elements.get(id)!
    if (!horizontal) {
      const above = from.y < rb.y
      const edge = above ? rb.y - rb.height / 2 : rb.y + rb.height / 2
      if (above ? from.y >= edge : from.y <= edge) return null
      // A person is entered through the head, everything else square to its side.
      const x =
        el.shape === 'person' && above
          ? box.x
          : Math.max(box.x - box.width / 2 + 16, Math.min(box.x + box.width / 2 - 16, from.x))
      const gap = Math.min(18, Math.abs(edge - from.y) / 2)
      return [
        { x, y: above ? edge - gap : edge + gap },
        { x, y: above ? box.y - box.height / 2 : box.y + box.height / 2 },
      ]
    }
    const before = from.x < rb.x
    const edge = before ? rb.x - rb.width / 2 : rb.x + rb.width / 2
    if (before ? from.x >= edge : from.x <= edge) return null
    const top = el.shape === 'person' ? box.y - box.height / 2 + PERSON_HEAD : box.y - box.height / 2
    const y = Math.max(top + 16, Math.min(box.y + box.height / 2 - 16, from.y))
    const gap = Math.min(18, Math.abs(edge - from.x) / 2)
    return [
      { x: before ? edge - gap : edge + gap, y },
      { x: before ? box.x - box.width / 2 : box.x + box.width / 2, y },
    ]
  }

  // Boundary titles are in the way of a straightened route as much as elements are.
  // A frame around one of the ends is left through its title anyway, so those do not count.
  const titles: { id: string; box: Box }[] = []
  for (const [bid, size] of input.boundaryLabel) {
    const f = frames.get(bid)
    if (!f) continue
    titles.push({ id: bid, box: { x: f.x - f.width / 2 + 8 + size.width / 2, y: f.y - f.height / 2 + size.height / 2, width: size.width + 8, height: size.height } })
  }
  const rels = new Map<number, PlacedRel>()
  // Several relations between the same two row neighbours run side by side.
  const parallel = new Map<string, number>()
  d.relations.forEach((r, i) => {
    if (r.hidden) return
    if (rowRels.has(i) || (loose.has(i) && !result.edges.has(String(i)))) {
      rels.set(i, direct(i, r))
      return
    }
    const route = result.edges.get(String(i))
    if (!route) return
    if (route.selfLoop) {
      rels.set(i, { points: route.points, straight: false, label: route.label })
      return
    }
    const reversed = axisOf(r.direction, flow) === 'backward'
    // The layout's route runs from its `from` to its `to`; turn it to the relation's own direction.
    let inner = route.points.slice()
    let start = route.start
    let end = route.end
    if (reversed) {
      inner = inner.reverse()
      ;[start, end] = [end, start]
    }
    // Ends are fixed where the layout cut the edge at a frame or where it
    // bends into a row member; otherwise they are the element's centre,
    // clipped to its outline once the route is final.
    const pre = start ? null : approach(r.from, inner[0] ?? endBox(r.to))
    const post = end ? null : approach(r.to, inner[inner.length - 1] ?? endBox(r.from))
    let head: Point[] = pre ? pre.slice().reverse() : [start ?? endBox(r.from)]
    let tail: Point[] = post ?? [end ?? endBox(r.to)]
    const around = new Set([...frameChain(r.from), ...frameChain(r.to)])
    const obstacles = [
      ...[...boxes].filter(([k]) => k !== r.from && k !== r.to).map(([, b]) => b),
      ...titles.filter((t) => !around.has(t.id)).map((t) => t.box),
    ]
    const first = head[head.length - 1]!
    const last = tail[0]!
    let mid: Point[]
    const at = route.label ? nearest(inner, route.label) : -1
    if (at >= 0) {
      // The label's point stays: room for the label was made there.
      mid = [
        ...shortcut([first, ...inner.slice(0, at + 1)], obstacles).slice(1),
        ...shortcut([inner[at]!, ...inner.slice(at + 1), last], obstacles).slice(1, -1),
      ]
    } else {
      mid = shortcut([first, ...inner, last], obstacles).slice(1, -1)
    }
    // The layout aims the last run at the element's centre from a bend that
    // may sit beside a neighbour of it; when that run cuts the neighbour,
    // the edge turns square into the element instead.
    const blocked = (a: Point, b: Point) => obstacles.some((box) => segmentHitsBox(a, b, box, -4))
    const elbow = (from: Point, centre: Point): Point | null => {
      if (!blocked(from, centre)) return null
      const corner = horizontal ? { x: from.x, y: centre.y } : { x: centre.x, y: from.y }
      return blocked(from, corner) || blocked(corner, centre) ? null : corner
    }
    if (!post && !end && mid.length > 0) {
      const corner = elbow(mid[mid.length - 1]!, last)
      if (corner) mid.push(corner)
    }
    if (!pre && !start && mid.length > 0) {
      const corner = elbow(mid[0]!, first)
      if (corner) mid.unshift(corner)
    }
    if (!pre && !start) head = [clip(r.from, mid[0] ?? last)]
    if (!post && !end) tail = [clip(r.to, mid[mid.length - 1] ?? first)]
    rels.set(i, { points: [...head, ...mid, ...tail], straight: false, label: route.label })
  })

  function direct(i: number, r: C4Relation): PlacedRel {
    const a = endBox(r.from)
    const b = endBox(r.to)
    const row = inRow(r.from)
    const neighbours = row && row === inRow(r.to) && Math.abs(row.members.indexOf(r.from) - row.members.indexOf(r.to)) === 1
    if (neighbours) {
      const key = pairKey(r.from, r.to)
      const all = between.get(key) ?? [i]
      const k = parallel.get(key) ?? 0
      parallel.set(key, k + 1)
      let tallest = 0
      for (const j of all) tallest = Math.max(tallest, horizontal ? (input.relLabel.get(j)?.width ?? 0) : (input.relLabel.get(j)?.height ?? 0))
      const spread = Math.max(14, tallest + 6)
      const offset = (k - (all.length - 1) / 2) * spread
      if (!horizontal) {
        const y = (a.y + b.y) / 2 + offset
        const ax = a.x < b.x ? a.x + a.width / 2 : a.x - a.width / 2
        const bx = a.x < b.x ? b.x - b.width / 2 : b.x + b.width / 2
        return { points: [{ x: ax, y }, { x: bx, y }], straight: true, label: { x: (ax + bx) / 2, y } }
      }
      const x = (a.x + b.x) / 2 + offset
      const ay = a.y < b.y ? a.y + a.height / 2 : a.y - a.height / 2
      const by = a.y < b.y ? b.y - b.height / 2 : b.y + b.height / 2
      return { points: [{ x, y: ay }, { x, y: by }], straight: true, label: { x, y: (ay + by) / 2 } }
    }
    if (row && row === inRow(r.to)) {
      // Two members of one row that are not neighbours: an arc over the row.
      const rb = result.nodes.get(row.id)!
      if (!horizontal) {
        const top = rb.y - rb.height / 2 - RANK_SEP / 3
        const p1 = { x: a.x, y: a.y - a.height / 2 }
        const p2 = { x: b.x, y: b.y - b.height / 2 }
        return {
          points: [p1, { x: a.x, y: top }, { x: b.x, y: top }, p2],
          straight: true,
          label: { x: (a.x + b.x) / 2, y: top },
        }
      }
      const leftX = rb.x - rb.width / 2 - RANK_SEP / 3
      const p1 = { x: a.x - a.width / 2, y: a.y }
      const p2 = { x: b.x - b.width / 2, y: b.y }
      return {
        points: [p1, { x: leftX, y: a.y }, { x: leftX, y: b.y }, p2],
        straight: true,
        label: { x: leftX, y: (a.y + b.y) / 2 },
      }
    }
    const p1 = clip(r.from, b)
    const p2 = clip(r.to, a)
    return { points: [p1, p2], straight: true, label: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } }
  }

  collapse('x', NODE_SEP, boxes, frames, rels, input.relLabel)
  collapse('y', RANK_SEP, boxes, frames, rels, input.relLabel)

  // The canvas covers everything drawn: routes drawn here (arcs over a row,
  // the ends bent into row members) may reach past the layout's own box.
  let minX = 0
  let minY = 0
  let maxX = 0
  let maxY = 0
  for (const b of [...boxes.values(), ...frames.values()]) {
    maxX = Math.max(maxX, b.x + b.width / 2)
    maxY = Math.max(maxY, b.y + b.height / 2)
  }
  const cover = (x: number, y: number, w = 0, h = 0) => {
    minX = Math.min(minX, x - w / 2)
    maxX = Math.max(maxX, x + w / 2)
    minY = Math.min(minY, y - h / 2)
    maxY = Math.max(maxY, y + h / 2)
  }
  for (const [i, rel] of rels) {
    for (const p of rel.points) cover(p.x, p.y)
    const l = input.relLabel.get(i)
    if (rel.label && l) cover(rel.label.x, rel.label.y, l.width, l.height)
  }
  if (minX < 0 || minY < 0) {
    const move = (p: Point): Point => ({ x: p.x - minX, y: p.y - minY })
    for (const map of [boxes, frames]) for (const [k, b] of map) map.set(k, { ...b, ...move(b) })
    for (const rel of rels.values()) {
      rel.points = rel.points.map(move)
      if (rel.label) rel.label = move(rel.label)
    }
  }
  return { width: maxX - minX, height: maxY - minY, elements: boxes, boundaries: frames, rels }
}
