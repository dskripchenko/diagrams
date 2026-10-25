/**
 * Shared by the diagrams whose nodes are boxes of rows (entities, classes)
 * and whose edges carry symbols at both ends (crow's feet, UML triangles and
 * diamonds): the layout with self loops kept beside their box, edge ends
 * attached square to a box side and spread apart, and the parts of a box.
 */
import type { Box, Point } from '../core/geometry'
import { cssText } from '../core/style'
import { el, PathBuilder, type SvgElement } from '../core/svg'
import { renderLabel, type MeasuredLabel } from '../core/text'
import { layout } from '../layout/layered'
import type { Direction, LayoutCluster, LayoutEdge, LayoutNode, LayoutResult } from '../layout/layered/types'

/** How far an edge leaves a box straight before it may bend: room for the end symbol. */
const STUB = 26

export interface Attachment {
  /** On the box outline. */
  point: Point
  /** Unit vector pointing out of the box. */
  normal: Point
}

const clamp = (value: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, value)))

/**
 * Where an edge heading for `toward` leaves `box`. The edge leaves through
 * the side facing the next rank, straight below (or beside) the point it
 * heads for when that is within the side — so neighbouring edges stay as
 * far apart as the layout put them, and each end symbol sits square on its side.
 */
export function attach(box: Box, toward: Point, direction: Direction): Attachment {
  const hw = box.width / 2
  const hh = box.height / 2
  // Keep the symbol's spread inside the side, clear of the corners.
  const mx = Math.min(16, hw)
  const my = Math.min(16, hh)
  const vertical = direction === 'TB' || direction === 'BT'
  const dx = toward.x - box.x
  const dy = toward.y - box.y
  const acrossFlow = vertical ? Math.abs(dy) > hh + 0.5 : Math.abs(dx) <= hw + 0.5
  if (acrossFlow) {
    const sy = dy < 0 ? -1 : 1
    return { point: { x: clamp(toward.x, box.x - hw + mx, box.x + hw - mx), y: box.y + sy * hh }, normal: { x: 0, y: sy } }
  }
  const sx = dx < 0 ? -1 : 1
  return { point: { x: box.x + sx * hw, y: clamp(toward.y, box.y - hh + my, box.y + hh - my) }, normal: { x: sx, y: 0 } }
}

/** Closest two edge ends may sit on one side, when the side is long enough. */
const PORT_GAP = 18
/** Room kept between the outermost end and a corner: half an end symbol. */
const PORT_MARGIN = 9

/**
 * Edges that leave one side of a box at (nearly) the same point would draw
 * their end symbols on top of each other. Ends on one side keep their order
 * but are pushed apart to a minimum gap — evenly over the side when it is
 * too short for that.
 */
function spreadPorts(ends: { id: string; box: Box; at: Attachment }[]): void {
  const sides = new Map<string, { box: Box; at: Attachment }[]>()
  for (const e of ends) {
    const key = `${e.id}\u0000${e.at.normal.x},${e.at.normal.y}`
    const list = sides.get(key) ?? []
    list.push(e)
    sides.set(key, list)
  }
  for (const list of sides.values()) {
    if (list.length < 2) continue
    const box = list[0]!.box
    const along = list[0]!.at.normal.x === 0 ? 'x' : 'y'
    const half = (along === 'x' ? box.width : box.height) / 2
    const centre = box[along]
    const lo = centre - half + Math.min(PORT_MARGIN, half)
    const hi = centre + half - Math.min(PORT_MARGIN, half)
    const gap = Math.min(PORT_GAP, (hi - lo) / (list.length - 1))
    list.sort((a, b) => a.at.point[along] - b.at.point[along])
    const pos = list.map((e) => e.at.point[along])
    for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i]!, pos[i - 1]! + gap)
    pos[pos.length - 1] = Math.min(pos[pos.length - 1]!, hi)
    for (let i = pos.length - 2; i >= 0; i--) pos[i] = Math.min(pos[i]!, pos[i + 1]! - gap)
    pos[0] = Math.max(pos[0]!, lo)
    for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i]!, pos[i - 1]! + gap)
    list.forEach((e, i) => (e.at.point = { ...e.at.point, [along]: pos[i]! }))
  }
}

function out(a: Attachment, distance: number): Point {
  return { x: a.point.x + a.normal.x * distance, y: a.point.y + a.normal.y * distance }
}

/**
 * The points of an edge between two attachments along the layout's bends,
 * with straight stretches at both ends.
 */
function between(start: Attachment, bends: readonly Point[], end: Attachment): Point[] {
  // Two collinear points per end: a B-spline is straight between them, so
  // the end symbol sits on a straight line rather than a curve.
  const gap = Math.hypot(end.point.x - start.point.x, end.point.y - start.point.y)
  const stub = Math.min(STUB, gap / 3)
  return [start.point, out(start, stub / 2), out(start, stub), ...bends, out(end, stub), out(end, stub / 2), end.point]
}

/** How far the first self loop reaches out of its box: an end symbol on each leg, and a gap. */
const LOOP = 48
const LOOP_STEP = 26

export interface SelfLoop {
  points: Point[]
  start: Attachment
  end: Attachment
  /** Where the label's near edge goes, and which way the label extends from it. */
  label: Point
  outward: Point
}

/**
 * A relation of a box to itself: a square loop on the box side across the
 * flow — right, then left, then further out — leaving and returning
 * perpendicular to the side so both end symbols sit square on it.
 */
export function selfLoop(box: Box, direction: Direction, index: number): SelfLoop {
  const vertical = direction === 'TB' || direction === 'BT'
  const sign = index % 2 === 0 ? 1 : -1
  const reach = LOOP + Math.floor(index / 2) * LOOP_STEP
  // In the frame where the loop leaves rightwards: u along the normal, v along the side.
  const half = (vertical ? box.height : box.width) / 2
  const spread = Math.max(10, Math.min(18, half - 8))
  const at = (u: number, v: number): Point =>
    vertical ? { x: box.x + sign * u, y: box.y + v } : { x: box.x + v, y: box.y + sign * u }
  const edge = (vertical ? box.width : box.height) / 2
  const normal = vertical ? { x: sign, y: 0 } : { x: 0, y: sign }
  const points = [
    at(edge, -spread),
    at(edge + reach / 2, -spread),
    at(edge + reach, -spread),
    at(edge + reach, spread),
    at(edge + reach / 2, spread),
    at(edge, spread),
  ]
  return {
    points,
    start: { point: points[0]!, normal },
    end: { point: points[5]!, normal },
    label: at(edge + reach + 6, 0),
    outward: normal,
  }
}

/**
 * Numbers the self loops of each box and works out the room they need on
 * either side of it, across the flow. Self loops stay out of the layout; the
 * box is laid out that much wider (or taller) instead.
 */
export function planSelfLoops(
  edges: readonly { from: string; to: string; label?: { width: number; height: number } }[],
  direction: Direction,
): { loop: Map<number, number>; room: Map<string, number> } {
  const vertical = direction === 'TB' || direction === 'BT'
  const loop = new Map<number, number>()
  const room = new Map<string, number>()
  const count = new Map<string, number>()
  edges.forEach((e, i) => {
    if (e.from !== e.to) return
    const index = count.get(e.from) ?? 0
    count.set(e.from, index + 1)
    loop.set(i, index)
    const reach = LOOP + Math.floor(index / 2) * LOOP_STEP
    const size = e.label ? (vertical ? e.label.width : e.label.height) + 10 : 4
    room.set(e.from, Math.max(room.get(e.from) ?? 0, reach + size))
  })
  return { loop, room }
}

/** The centre of a self loop's label of the given size. */
export function loopLabelCentre(l: SelfLoop, size: { width: number; height: number }): Point {
  return { x: l.label.x + (l.outward.x * size.width) / 2, y: l.label.y + (l.outward.y * size.height) / 2 }
}

export interface BoxEdge {
  from: string
  to: string
  /** Size of the label box, when the edge has a label. */
  label?: { width: number; height: number }
}

export interface Routed {
  points: Point[]
  start: Attachment
  end: Attachment
  /** Centre of the label box. */
  label?: Point
}

/**
 * Lays out boxes and their edges with the layered layout and routes every
 * edge: square onto the box sides, self loops beside their box. `extra`
 * edges (a note's tie to its class) are laid out but not routed here.
 */
export function layoutBoxes(input: {
  direction: Direction
  nodes: readonly LayoutNode[]
  edges: readonly BoxEdge[]
  extra?: readonly LayoutEdge[]
  clusters?: readonly LayoutCluster[]
  nodeSep: number
  rankSep: number
  clusterPadding?: number
}): { result: LayoutResult; routes: (Routed | undefined)[] } {
  const { direction } = input
  const vertical = direction === 'TB' || direction === 'BT'
  const loops = planSelfLoops(input.edges, direction)
  const nodes = input.nodes.map((n) => {
    const room = loops.room.get(n.id) ?? 0
    return vertical ? { ...n, width: n.width + room * 2 } : { ...n, height: n.height + room * 2 }
  })
  const edges: LayoutEdge[] = []
  input.edges.forEach((e, i) => {
    if (e.from !== e.to) edges.push({ id: String(i), from: e.from, to: e.to, label: e.label })
  })
  const result = layout({
    direction,
    nodes,
    edges: [...edges, ...(input.extra ?? [])],
    clusters: input.clusters,
    nodeSep: input.nodeSep,
    rankSep: input.rankSep,
    clusterPadding: input.clusterPadding,
    transpose: true,
  })
  // Back to the boxes' own size: the room for loops was only for the layout.
  for (const n of input.nodes) {
    const b = result.nodes.get(n.id)
    if (b) result.nodes.set(n.id, { ...b, width: n.width, height: n.height })
  }
  const ends: { id: string; box: Box; at: Attachment }[] = []
  const routes = input.edges.map((e, i): Routed | undefined => {
    const index = loops.loop.get(i)
    if (index !== undefined) {
      const l = selfLoop(result.nodes.get(e.from)!, direction, index)
      return { points: l.points, start: l.start, end: l.end, label: e.label ? loopLabelCentre(l, e.label) : undefined }
    }
    const route = result.edges.get(String(i))
    if (!route) return undefined
    const a = result.nodes.get(e.from)!
    const b = result.nodes.get(e.to)!
    const start = attach(a, route.points[0] ?? b, direction)
    const end = attach(b, route.points[route.points.length - 1] ?? a, direction)
    ends.push({ id: e.from, box: a, at: start }, { id: e.to, box: b, at: end })
    return { points: route.points, start, end, label: route.label }
  })
  spreadPorts(ends)
  routes.forEach((r, i) => {
    if (r && !loops.loop.has(i)) r.points = between(r.start, r.points, r.end)
  })
  return { result, routes }
}

/** A relation's label on its box, the line hidden behind it. */
export function edgeLabel(m: MeasuredLabel, at: Point): SvgElement {
  const w = m.width + 8
  const h = m.height + 4
  return el('g', { class: 'dg-edge-label-group' }, [
    el('rect', { class: 'dg-edge-label-box', x: at.x - w / 2, y: at.y - h / 2, width: w, height: h, rx: 3 }),
    renderLabel(m, at.x, at.y, { className: 'dg-edge-label' }),
  ])
}

/**
 * A user style split for a box of rows: the fill colours the header band
 * only — rows keep their own background, so text on them stays readable in
 * any theme — and everything else goes to the frame.
 */
export function splitFill(shape: Record<string, string>): { frame?: string; band?: string } {
  const band: Record<string, string> = {}
  const frame: Record<string, string> = {}
  for (const [k, value] of Object.entries(shape)) {
    if (k === 'fill' || k === 'fill-opacity') band[k] = value
    else frame[k] = value
  }
  return { frame: cssText(frame), band: cssText(band) }
}

/** A rectangle whose top and bottom corners have their own radii. */
export function roundedRect(left: number, top: number, width: number, height: number, rTop: number, rBottom: number): string {
  const right = left + width
  const bottom = top + height
  const p = new PathBuilder().moveTo(left + rTop, top).lineTo(right - rTop, top)
  if (rTop > 0) p.arcTo(rTop, rTop, 0, false, true, right, top + rTop)
  p.lineTo(right, bottom - rBottom)
  if (rBottom > 0) p.arcTo(rBottom, rBottom, 0, false, true, right - rBottom, bottom)
  p.lineTo(left + rBottom, bottom)
  if (rBottom > 0) p.arcTo(rBottom, rBottom, 0, false, true, left, bottom - rBottom)
  p.lineTo(left, top + rTop)
  if (rTop > 0) p.arcTo(rTop, rTop, 0, false, true, left + rTop, top)
  return p.close().toString()
}
