/**
 * Placing a C4 diagram: a grid of shapes inside nested frames, and
 * orthogonal relations routed around them.
 *
 * Placement follows Mermaid's C4 renderer: every scope (the diagram, a
 * boundary, a deployment node) lays out what it contains in declaration
 * order — shapes in rows of `c4ShapeInRow`, then boundaries in rows of
 * `c4BoundaryInRow` — and a frame is sized to its content. On top of that,
 * the `Rel_U/D/L/R` hints of C4-PlantUML put an element in the cell above,
 * below, left or right of the element it is related to; a hint between
 * elements in different frames applies to the frames that hold them.
 *
 * Relations are routed after placement, each as a path of horizontal and
 * vertical runs found by A* over a sparse grid of the lines that pass
 * between obstacles: every element the relation does not connect, every
 * frame that holds neither end, and every frame title. A path leaves and
 * enters square to the side of an element, bends as little as it can and
 * avoids running along a path already routed. Labels go where the path has
 * room for them near its middle; when one cannot be placed clear of
 * everything else, the gaps of the grid grow and the diagram is laid out
 * again.
 */
import type { Box, Point } from '../../core/geometry'
import type { C4Diagram, C4Relation, RelDirection } from './parser'

export interface Size {
  width: number
  height: number
}

export interface PlacedRel {
  /** From the `from` end to the `to` end, both ends on the outlines. */
  points: Point[]
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
  /** Room for a frame's title: its text block plus margins. */
  boundaryLabel: Map<string, Size>
  /** Label sizes of drawn relations, by index. */
  relLabel: Map<number, Size>
}

/** Height of a person's head above its body. */
export const PERSON_HEAD = 40
export const PERSON_HEAD_R = 21

const GAP_X = 76
const GAP_Y = 76
/** Padding inside a frame, and between its title and its content. */
const PAD = 28
const TITLE_GAP = 16
/** How far a path keeps from things it passes. */
const CLEAR = 14
/** Room around the drawing for paths that go round everything. */
const OUTER = 36
const BEND = 30
const ATTEMPTS = 4

interface Rect {
  l: number
  t: number
  r: number
  b: number
}

const rectOf = (b: Box): Rect => ({ l: b.x - b.width / 2, t: b.y - b.height / 2, r: b.x + b.width / 2, b: b.y + b.height / 2 })
const inflate = (r: Rect, m: number): Rect => ({ l: r.l - m, t: r.t - m, r: r.r + m, b: r.b + m })
const overlaps = (a: Rect, b: Rect) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b
const area = (a: Rect, b: Rect) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))

const DELTA: Record<RelDirection, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }

export function layoutC4(input: C4LayoutInput): C4Layout {
  // Gaps start wide enough for the labels of side-by-side relations.
  let gx = GAP_X
  let gy = GAP_Y
  input.diagram.relations.forEach((r, i) => {
    const l = input.relLabel.get(i)
    if (!l || r.hidden) return
    gy = Math.max(gy, Math.min(l.height + 2 * CLEAR + 24, 160))
    if (r.direction === 'left' || r.direction === 'right') gx = Math.max(gx, l.width + 2 * CLEAR + 16)
  })
  let best: { result: C4Layout; conflicts: number; needs: { x: number; y: number } } | null = null
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // Twice: the second pass arranges each frame knowing where the things
    // outside it that its items relate to ended up in the first.
    const placed = place(input, gx, gy, place(input, gx, gy))
    const routed = route(input, placed)
    if (!best || routed.conflicts < best.conflicts) best = routed
    if (routed.conflicts === 0) break
    // Widen only the gaps the stuck labels needed: across a horizontal run
    // they need wider columns, along a vertical one taller rows.
    if (routed.needs.x > 0) gx = Math.max(gx + 30, routed.needs.x)
    if (routed.needs.y > 0) gy = Math.max(gy + 30, routed.needs.y)
  }
  return best!.result
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

interface Placement {
  elements: Map<string, Box>
  boundaries: Map<string, Box>
  width: number
  height: number
}

interface Cell {
  r: number
  c: number
}

interface ScopeLayout {
  width: number
  height: number
  /** Top-left corners and sizes of the direct children, relative to the content origin. */
  items: Map<string, { x: number; y: number; width: number; height: number }>
}

function place(input: C4LayoutInput, gx: number, gy: number, prev?: Placement): Placement {
  const d = input.diagram
  const horizontal = d.direction === 'LR'
  const parentOf = (id: string) => d.elements.get(id)?.parent ?? d.boundaries.get(id)?.parent
  /** The ancestor-or-self of `id` that sits directly in `scope`. */
  const childIn = (id: string, scope: string): string | undefined => {
    let cur = id
    for (let guard = 0; guard < 1000; guard++) {
      const p = parentOf(cur)
      if ((p ?? '') === scope) return cur
      if (p === undefined) return undefined
      cur = p
    }
    return undefined
  }

  const cache = new Map<string, ScopeLayout>()
  const frameSize = (id: string): Size => {
    const inner = layoutScope(id)
    const title = input.boundaryLabel.get(id) ?? { width: 0, height: 0 }
    return {
      width: Math.max(inner.width + PAD * 2, title.width + PAD * 2, 140),
      height: title.height + (inner.height > 0 ? TITLE_GAP + inner.height + PAD : PAD / 2),
    }
  }

  const grid = (
    scope: string,
    items: readonly string[] = d.children.get(scope) ?? [],
    shift?: number,
  ): Map<string, Cell> => {
    const cells = new Map<string, Cell>()
    const taken = new Set<string>()
    const key = (c: Cell) => `${c.r},${c.c}`
    const put = (id: string, c: Cell) => {
      cells.set(id, c)
      taken.add(key(c))
    }
    // The first hint that ties `id` to something already placed.
    const hinted = (id: string): Cell | null => {
      for (const r of d.relations) {
        if (!r.direction) continue
        const a = childIn(r.from, scope)
        const b = childIn(r.to, scope)
        if (!a || !b || a === b) continue
        let anchor: Cell | undefined
        let sign = 1
        if (b === id && cells.has(a)) anchor = cells.get(a)
        else if (a === id && cells.has(b)) {
          anchor = cells.get(b)
          sign = -1
        }
        if (!anchor) continue
        const [dr, dc] = DELTA[r.direction]
        const cell = { r: anchor.r + dr * sign, c: anchor.c + dc * sign }
        while (taken.has(key(cell))) {
          cell.r += dr * sign
          cell.c += dc * sign
        }
        return cell
      }
      return null
    }
    const shapes = items.filter((id) => d.elements.has(id))
    const frames = items.filter((id) => d.boundaries.has(id))
    let k = 0
    const nextFree = (per: number, base: number): Cell => {
      for (;;) {
        const along = Math.floor(k / per)
        const across = k % per
        k++
        const cell = horizontal ? { r: across, c: base + along } : { r: base + along, c: across }
        if (!taken.has(key(cell))) return cell
      }
    }
    const free = new Set<string>()
    for (const id of shapes) {
      const cell = hinted(id)
      if (cell) put(id, cell)
      else {
        put(id, nextFree(d.shapeInRow, 0))
        free.add(id)
      }
    }
    // A last row with room to spare is centred (or shifted by `shift`)
    // when nothing in it was placed by a hint.
    const lineOf = (c: Cell) => (horizontal ? c.c : c.r)
    const last = Math.max(-1, ...shapes.map((id) => lineOf(cells.get(id)!)))
    const lastRow = shapes.filter((id) => lineOf(cells.get(id)!) === last)
    const lines = shapes.length > 0 ? Math.ceil(shapes.length / d.shapeInRow) : 0
    if (lines > 1 && lastRow.length < d.shapeInRow && lastRow.every((id) => free.has(id))) {
      const room = d.shapeInRow - lastRow.length
      const by = Math.min(room, shift ?? Math.floor(room / 2))
      for (const id of lastRow) {
        const c = cells.get(id)!
        taken.delete(key(c))
        if (horizontal) c.r += by
        else c.c += by
        taken.add(key(c))
      }
    }
    // Boundaries start after the last row (or column) of shapes, as in Mermaid.
    let base = 0
    for (const c of cells.values()) base = Math.max(base, (horizontal ? c.c : c.r) + 1)
    k = 0
    for (const id of frames) put(id, hinted(id) ?? nextFree(d.boundaryInRow, base))
    // Close the rows and columns no item ended up in.
    const rows = [...new Set([...cells.values()].map((c) => c.r))].sort((a, b) => a - b)
    const cols = [...new Set([...cells.values()].map((c) => c.c))].sort((a, b) => a - b)
    for (const c of cells.values()) {
      c.r = rows.indexOf(c.r)
      c.c = cols.indexOf(c.c)
    }
    return cells
  }

  /** Sizes and places the items of one scope on the given grid. */
  const measure = (cells: Map<string, Cell>): ScopeLayout => {
    const size = new Map<string, Size>()
    for (const id of cells.keys()) size.set(id, d.elements.has(id) ? input.elementSize.get(id)! : frameSize(id))
    const isShape = (id: string) => d.elements.has(id)

    // Shapes share one cell size, so rows of them line up as a grid.
    let cellW = 0
    for (const [id, s] of size) if (isShape(id)) cellW = Math.max(cellW, s.width)
    const rowCount = Math.max(0, ...[...cells.values()].map((c) => c.r + 1))
    const rows: string[][] = Array.from({ length: rowCount }, () => [])
    for (const [id, c] of cells) rows[c.r]!.push(id)
    for (const row of rows) row.sort((a, b) => cells.get(a)!.c - cells.get(b)!.c)
    const shapeRow = rows.map((row) => row.every(isShape))

    // A block of shape-only rows on one grid, other rows packed and centred.
    let cmin = Infinity
    let cmax = -Infinity
    rows.forEach((row, r) => {
      if (!shapeRow[r]) return
      for (const id of row) {
        cmin = Math.min(cmin, cells.get(id)!.c)
        cmax = Math.max(cmax, cells.get(id)!.c)
      }
    })
    const blockW = Number.isFinite(cmin) ? (cmax - cmin + 1) * cellW + (cmax - cmin) * gx : 0
    const rowW = rows.map((row, r) => (shapeRow[r] ? blockW : row.reduce((s, id, i) => s + size.get(id)!.width + (i > 0 ? gx : 0), 0)))
    const width = Math.max(0, ...rowW)
    const items = new Map<string, { x: number; y: number; width: number; height: number }>()
    let y = 0
    rows.forEach((row, r) => {
      if (row.length === 0) return
      const height = Math.max(...row.map((id) => size.get(id)!.height))
      if (shapeRow[r]) {
        const x0 = (width - blockW) / 2
        // Every shape of the row as tall as the tallest: an even row.
        for (const id of row) items.set(id, { x: x0 + (cells.get(id)!.c - cmin) * (cellW + gx), y, width: cellW, height })
      } else {
        let x = (width - rowW[r]!) / 2
        for (const id of row) {
          const s = size.get(id)!
          items.set(id, { x, y, width: s.width, height: s.height })
          x += s.width + gx
        }
      }
      y += height + gy
    })
    return { width, height: Math.max(0, y - gy), items }
  }

  /**
   * The grid with related items close together where declaration order
   * does not already put them there. Candidate orders are measured and
   * scored by the room between related items, a detour for every item in
   * the way, and — on the second pass — the distance of an item from the
   * things outside its frame it relates to.
   */
  const arrange = (scope: string): Map<string, Cell> => {
    const order = [...(d.children.get(scope) ?? [])]
    const links: [string, string][] = []
    const outside: [string, Point][] = []
    for (const r of d.relations) {
      if (r.hidden) continue
      const a = childIn(r.from, scope)
      const b = childIn(r.to, scope)
      if (a && b && a !== b) links.push([a, b])
      else if (prev && (a || b) && !(a && b)) {
        const other = prev.elements.get(a ? r.to : r.from) ?? prev.boundaries.get(a ? r.to : r.from)
        if (other) outside.push([(a ?? b)!, other])
      }
    }
    let cells = grid(scope, order)
    if ((links.length === 0 && outside.length === 0) || order.length < 2) return cells
    const frame = scope === '' ? undefined : prev?.boundaries.get(scope)
    const title = input.boundaryLabel.get(scope)?.height ?? 0
    const cost = (c: Map<string, Cell>) => {
      const m = measure(c)
      const box = (id: string) => {
        const it = m.items.get(id)!
        return { l: it.x, t: it.y, r: it.x + it.width, b: it.y + it.height }
      }
      let sum = 0
      for (const [a, b] of links) {
        const p = box(a)
        const q = box(b)
        sum += Math.max(0, Math.max(p.l, q.l) - Math.min(p.r, q.r)) + Math.max(0, Math.max(p.t, q.t) - Math.min(p.b, q.b))
        // Every item on the straight way between them is a detour.
        const from = { x: (p.l + p.r) / 2, y: (p.t + p.b) / 2 }
        const to = { x: (q.l + q.r) / 2, y: (q.t + q.b) / 2 }
        for (const id of m.items.keys()) {
          if (id === a || id === b) continue
          const o = box(id)
          if (segmentCrosses(from, to, o)) sum += gx + gy + 120
        }
      }
      if (outside.length > 0) {
        // Where the content will sit, judged by where the frame was before.
        const ox = frame ? frame.x - m.width / 2 : 0
        const oy = frame ? frame.y - frame.height / 2 + title + TITLE_GAP : 0
        for (const [id, other] of outside) {
          const o = box(id)
          sum += 0.5 * (Math.abs(ox + (o.l + o.r) / 2 - other.x) + Math.abs(oy + (o.t + o.b) / 2 - other.y))
        }
      }
      // Rows longer than asked for (hints can make them) cost what they spread.
      const perRow = new Map<number, number>()
      for (const cell of c.values()) perRow.set(cell.r, (perRow.get(cell.r) ?? 0) + 1)
      for (const n of perRow.values()) if (n > Math.max(d.shapeInRow, d.boundaryInRow)) sum += (n - Math.max(d.shapeInRow, d.boundaryInRow)) * 400
      return sum
    }
    let best = cost(cells)
    const shapes = order.filter((id) => d.elements.has(id))
    const frames = order.filter((id) => d.boundaries.has(id))
    const room = Math.max(0, d.shapeInRow - (shapes.length % d.shapeInRow || d.shapeInRow))
    const shifts = [Math.floor(room / 2), ...Array.from({ length: room + 1 }, (_, i) => i)]
    if (shapes.length <= 6 && frames.length <= 3) {
      // Few enough to try every order; declaration order wins ties.
      for (const ps of permutations(shapes)) {
        for (const pf of permutations(frames)) {
          for (const shift of shifts) {
            const next = grid(scope, [...ps, ...pf], shift)
            const c = cost(next)
            if (c < best - 1e-6) {
              best = c
              cells = next
            }
          }
        }
      }
      return cells
    }
    for (let round = 0; round < 4; round++) {
      let improved = false
      for (let i = 0; i < order.length; i++) {
        for (let j = i + 1; j < order.length; j++) {
          if (d.elements.has(order[i]!) !== d.elements.has(order[j]!)) continue
          ;[order[i], order[j]] = [order[j]!, order[i]!]
          const next = grid(scope, order)
          const c = cost(next)
          if (c < best - 1e-6) {
            best = c
            cells = next
            improved = true
          } else {
            ;[order[i], order[j]] = [order[j]!, order[i]!]
          }
        }
      }
      if (!improved) break
    }
    return cells
  }

  function layoutScope(scope: string): ScopeLayout {
    const cached = cache.get(scope)
    if (cached) return cached
    const result = measure(arrange(scope))
    cache.set(scope, result)
    return result
  }

  const elements = new Map<string, Box>()
  const boundaries = new Map<string, Box>()
  const visit = (scope: string, ox: number, oy: number) => {
    const inner = layoutScope(scope)
    for (const [id, it] of inner.items) {
      const box: Box = { x: ox + it.x + it.width / 2, y: oy + it.y + it.height / 2, width: it.width, height: it.height }
      if (d.elements.has(id)) {
        elements.set(id, box)
        continue
      }
      boundaries.set(id, box)
      const content = layoutScope(id)
      const title = input.boundaryLabel.get(id) ?? { width: 0, height: 0 }
      visit(id, ox + it.x + (it.width - content.width) / 2, oy + it.y + title.height + TITLE_GAP)
    }
  }
  visit('', 0, 0)
  const root = layoutScope('')
  return { elements, boundaries, width: root.width, height: root.height }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

type Dir = 0 | 1 | 2 | 3 // right, down, left, up
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

interface Port {
  /** On the outline. */
  at: Point
  /** A short step out of it, where the path starts. */
  stub: Point
  /** Direction out of the shape. */
  out: Dir
  key: string
  cost: number
}

/** Candidate ends on every side of a box, the middle of a side preferred. */
function ports(id: string, box: Box, person: boolean, other: Box): Port[] {
  const r = rectOf(box)
  const out: Port[] = []
  const body = person ? r.t + PERSON_HEAD : r.t
  const add = (side: Dir, frac: number, cost: number) => {
    let at: Point
    if (side === 0 || side === 2) at = { x: side === 0 ? r.r : r.l, y: body + (r.b - body) * frac }
    else at = { x: r.l + (r.r - r.l) * frac, y: side === 1 ? r.b : r.t }
    out.push({ at, stub: { x: at.x + DX[side]! * CLEAR, y: at.y + DY[side]! * CLEAR }, out: side, key: `${id}:${side}:${frac}`, cost })
  }
  // Facing the other end across a shared span: a port in the middle of
  // that span lets the relation run straight.
  const o = rectOf(other)
  const lo = Math.max(r.l + 16, o.l + 16)
  const hi = Math.min(r.r - 16, o.r - 16)
  // (A person is entered from above through the head only.)
  if (lo <= hi && !(person && o.b <= r.t)) {
    const frac = ((lo + hi) / 2 - r.l) / (r.r - r.l)
    add(o.t >= r.b ? 1 : 3, frac, 0)
  }
  const top = Math.max(body + 16, o.t + 16)
  const bottom = Math.min(r.b - 16, o.b - 16)
  if (top <= bottom) {
    const frac = ((top + bottom) / 2 - body) / (r.b - body)
    add(o.l >= r.r ? 0 : 2, frac, 0)
  }
  for (const side of [0, 1, 2, 3] as Dir[]) {
    add(side, 0.5, 0)
    // A person is entered from above through the head only.
    if (person && side === 3) continue
    add(side, 0.35, 6)
    add(side, 0.65, 6)
    add(side, 0.2, 14)
    add(side, 0.8, 14)
  }
  return out
}

class Heap {
  private items: { f: number; n: number; s: number }[] = []
  private seq = 0
  get size(): number {
    return this.items.length
  }
  push(f: number, s: number): void {
    const items = this.items
    items.push({ f, n: this.seq++, s })
    let i = items.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (less(items[p]!, items[i]!)) break
      ;[items[p], items[i]] = [items[i]!, items[p]!]
      i = p
    }
  }
  pop(): number {
    const items = this.items
    const top = items[0]!
    const last = items.pop()!
    if (items.length > 0) {
      items[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < items.length && less(items[l]!, items[m]!)) m = l
        if (r < items.length && less(items[r]!, items[m]!)) m = r
        if (m === i) break
        ;[items[m], items[i]] = [items[i]!, items[m]!]
        i = m
      }
    }
    return top.s
  }
}
const less = (a: { f: number; n: number }, b: { f: number; n: number }) => a.f < b.f || (a.f === b.f && a.n < b.n)

/** Runs already taken by routed paths, by the line they lie on. */
class Used {
  private h = new Map<number, [number, number][]>()
  private v = new Map<number, [number, number][]>()
  add(a: Point, b: Point): void {
    if (a.y === b.y) push(this.h, a.y, a.x, b.x)
    else if (a.x === b.x) push(this.v, a.x, a.y, b.y)
  }
  /** Length of `a`–`b` that runs along a path already there. */
  shared(a: Point, b: Point): number {
    const list = a.y === b.y ? this.h.get(a.y) : this.v.get(a.x)
    if (!list) return 0
    const [lo, hi] = a.y === b.y ? [Math.min(a.x, b.x), Math.max(a.x, b.x)] : [Math.min(a.y, b.y), Math.max(a.y, b.y)]
    let s = 0
    for (const [p, q] of list) s += Math.max(0, Math.min(hi, q) - Math.max(lo, p))
    return s
  }
  /** Whether a run across `p` (in the other direction) would cross one already there. */
  crosses(p: Point, horizontal: boolean): boolean {
    const list = horizontal ? this.v.get(p.x) : this.h.get(p.y)
    const at = horizontal ? p.y : p.x
    return !!list && list.some(([lo, hi]) => at > lo && at < hi)
  }
}
function push(map: Map<number, [number, number][]>, line: number, a: number, b: number): void {
  const list = map.get(line) ?? []
  list.push([Math.min(a, b), Math.max(a, b)])
  map.set(line, list)
}

function route(input: C4LayoutInput, placed: Placement): { result: C4Layout; conflicts: number; needs: { x: number; y: number } } {
  const d = input.diagram
  const { elements, boundaries } = placed
  const within = (id: string, frame: string): boolean => {
    let p: string | undefined = id
    while (p !== undefined) {
      if (p === frame) return true
      p = d.elements.get(p)?.parent ?? d.boundaries.get(p)?.parent
    }
    return false
  }
  const titleRect = (id: string): Rect => {
    const f = rectOf(boundaries.get(id)!)
    const t = input.boundaryLabel.get(id) ?? { width: 0, height: 0 }
    return { l: f.l, t: f.t, r: Math.min(f.r, f.l + 12 + t.width), b: f.t + t.height - 4 }
  }
  const titles = [...boundaries.keys()].map(titleRect)

  // Extent of the drawing, with room around it for paths.
  let ext: Rect = { l: 0, t: 0, r: placed.width, b: placed.height }
  const grow = (r: Rect) => (ext = { l: Math.min(ext.l, r.l), t: Math.min(ext.t, r.t), r: Math.max(ext.r, r.r), b: Math.max(ext.b, r.b) })
  for (const b of [...elements.values(), ...boundaries.values()]) grow(rectOf(b))
  const outer = inflate(ext, OUTER)

  const used = new Used()
  const usedPorts = new Set<string>()
  const rels = new Map<number, PlacedRel>()
  const order = d.relations.map((r, i) => ({ r, i })).filter(({ r }) => !r.hidden)
  // Short relations first: they get the direct lines, long ones go round.
  const centre = (id: string) => elements.get(id) ?? boundaries.get(id)!
  const dist = (r: C4Relation) => {
    const a = centre(r.from)
    const b = centre(r.to)
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  }
  order.sort((a, b) => dist(a.r) - dist(b.r) || a.i - b.i)

  for (const { r, i } of order) {
    const fromBox = centre(r.from)
    const toBox = centre(r.to)
    if (r.from === r.to) {
      const f = rectOf(fromBox)
      const y0 = fromBox.y - 14
      const y1 = fromBox.y + 14
      const x = f.r + 28
      rels.set(i, { points: [{ x: f.r, y: y0 }, { x, y: y0 }, { x, y: y1 }, { x: f.r, y: y1 }] })
      continue
    }
    // What this relation must keep out of.
    const blocks: Rect[] = []
    for (const [id, b] of elements) {
      blocks.push(id === r.from || id === r.to ? rectOf(b) : inflate(rectOf(b), CLEAR))
    }
    /** Frames the path may cross: it should do so once, and never run along a border. */
    const crossable: Rect[] = []
    for (const [id, b] of boundaries) {
      if (id === r.from || id === r.to) {
        blocks.push(rectOf(b))
        continue
      }
      const holds = within(r.from, id) || within(r.to, id)
      blocks.push(holds ? inflate(titleRect(id), 4) : inflate(rectOf(b), CLEAR / 2))
      if (holds) crossable.push(rectOf(b))
    }
    const person = (id: string) => d.elements.get(id)?.shape === 'person'
    const starts = ports(r.from, fromBox, person(r.from), toBox)
    const ends = ports(r.to, toBox, person(r.to), fromBox)

    // The grid: lines along every obstacle side and port, and halfway between them.
    const xsSet = new Set<number>([outer.l, outer.r])
    const ysSet = new Set<number>([outer.t, outer.b])
    for (const b of blocks) {
      xsSet.add(b.l).add(b.r)
      ysSet.add(b.t).add(b.b)
    }
    // Channels just inside and outside the frames the path crosses.
    for (const f of crossable) {
      xsSet.add(f.l - CLEAR).add(f.l + CLEAR).add(f.r - CLEAR).add(f.r + CLEAR)
      ysSet.add(f.t - CLEAR).add(f.b - CLEAR).add(f.b + CLEAR)
    }
    for (const p of [...starts, ...ends]) {
      xsSet.add(p.stub.x)
      ysSet.add(p.stub.y)
    }
    const lines = (set: Set<number>) => {
      const sorted = [...set].map((v) => Math.round(v * 100) / 100).sort((a, b) => a - b)
      const out: number[] = []
      sorted.forEach((v, k) => {
        if (k > 0 && v - sorted[k - 1]! > 8) out.push(Math.round(((v + sorted[k - 1]!) / 2) * 100) / 100)
        out.push(v)
      })
      return [...new Set(out)].sort((a, b) => a - b)
    }
    const xs = lines(xsSet)
    const ys = lines(ysSet)
    const nx = xs.length
    const ix = new Map(xs.map((v, k) => [v, k]))
    const iy = new Map(ys.map((v, k) => [v, k]))
    const snap = (v: number) => Math.round(v * 100) / 100
    const blocked = (a: Point, b: Point) => {
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      for (const q of blocks) if (mx > q.l && mx < q.r && my > q.t && my < q.b) return true
      return false
    }
    const stateOf = (cx: number, cy: number, dir: number) => (cy * nx + cx) * 4 + dir
    const goal = new Map<number, Port>()
    for (const p of ends) {
      const cx = ix.get(snap(p.stub.x))
      const cy = iy.get(snap(p.stub.y))
      if (cx === undefined || cy === undefined) continue
      // Arriving means heading into the shape: against its port's outward direction.
      goal.set(cy * nx + cx, p)
    }
    const g = new Map<number, number>()
    const prev = new Map<number, number>()
    const heap = new Heap()
    const h = (cx: number, cy: number) => {
      let m = Infinity
      for (const p of ends) m = Math.min(m, Math.abs(xs[cx]! - p.stub.x) + Math.abs(ys[cy]! - p.stub.y))
      return m
    }
    const startPort = new Map<number, Port>()
    for (const p of starts) {
      const cx = ix.get(snap(p.stub.x))
      const cy = iy.get(snap(p.stub.y))
      if (cx === undefined || cy === undefined) continue
      const s = stateOf(cx, cy, p.out)
      const cost = p.cost + (usedPorts.has(p.key) ? 60 : 0)
      if (cost < (g.get(s) ?? Infinity)) {
        g.set(s, cost)
        startPort.set(s, p)
        heap.push(cost + h(cx, cy), s)
      }
    }
    let found = -1
    let foundPort: Port | null = null
    const closed = new Set<number>()
    while (heap.size > 0) {
      const s = heap.pop()
      if (closed.has(s)) continue
      closed.add(s)
      if (s < 0) {
        found = s
        foundPort = goal.get((-1 - s) / 4)!
        break
      }
      const dir = s % 4
      const node = (s - dir) / 4
      const cx = node % nx
      const cy = (node - cx) / nx
      const end = goal.get(node)
      // The last step goes straight into the shape.
      if (end && dir === (end.out + 2) % 4) {
        const total = g.get(s)! + end.cost + (usedPorts.has(end.key) ? 60 : 0)
        const key = -1 - node * 4
        if (total < (g.get(key) ?? Infinity)) {
          g.set(key, total)
          prev.set(key, s)
          heap.push(total, key)
        }
      }
      for (let nd = 0; nd < 4; nd++) {
        if (nd === (dir + 2) % 4) continue
        const tx = cx + DX[nd]!
        const ty = cy + DY[nd]!
        if (tx < 0 || ty < 0 || tx >= nx || ty >= ys.length) continue
        const a = { x: xs[cx]!, y: ys[cy]! }
        const b = { x: xs[tx]!, y: ys[ty]! }
        if (blocked(a, b)) continue
        const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
        // No turn right at a port's stub: it would read as a hook along the side.
        if (nd !== dir && startPort.has(s)) continue
        let cost = len + (nd === dir ? 0 : BEND)
        const shared = used.shared(a, b)
        if (shared > 0) cost += 40 + shared * 3
        if (used.crosses(b, nd % 2 === 0)) cost += 12
        cost += borderCost(a, b, crossable)
        const t = stateOf(tx, ty, nd)
        const total = g.get(s)! + cost
        if (total < (g.get(t) ?? Infinity)) {
          g.set(t, total)
          prev.set(t, s)
          heap.push(total + h(tx, ty), t)
        }
      }
    }

    let points: Point[]
    if (found !== -1 && foundPort) {
      const chain: Point[] = []
      let s: number | undefined = prev.get(found)
      let first: number | undefined
      while (s !== undefined) {
        const node = (s - (s % 4)) / 4
        const cx = node % nx
        chain.push({ x: xs[cx]!, y: ys[(node - cx) / nx]! })
        first = s
        s = prev.get(s)
      }
      chain.reverse()
      const startP = startPort.get(first!)!
      points = simplify([startP.at, ...chain, foundPort.at])
      usedPorts.add(startP.key)
      usedPorts.add(foundPort.key)
    } else {
      // No way round (should not happen with the margin around the drawing).
      points = [{ x: fromBox.x, y: fromBox.y }, { x: toBox.x, y: toBox.y }]
    }
    for (let k = 1; k < points.length; k++) used.add(points[k - 1]!, points[k]!)
    rels.set(i, { points })
  }

  const { conflicts, needs } = placeLabels(input, elements, titles, [...boundaries.values()].map(rectOf), rels)

  // Everything shifted so the drawing starts at the origin.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const cover = (r: Rect) => {
    minX = Math.min(minX, r.l)
    minY = Math.min(minY, r.t)
    maxX = Math.max(maxX, r.r)
    maxY = Math.max(maxY, r.b)
  }
  for (const b of [...elements.values(), ...boundaries.values()]) cover(rectOf(b))
  for (const [i, rel] of rels) {
    for (const p of rel.points) cover({ l: p.x, t: p.y, r: p.x, b: p.y })
    const l = input.relLabel.get(i)
    if (rel.label && l) cover(rectOf({ ...rel.label, ...l }))
  }
  if (!Number.isFinite(minX)) {
    minX = 0
    minY = 0
    maxX = 0
    maxY = 0
  }
  const move = (p: Point): Point => ({ x: p.x - minX, y: p.y - minY })
  for (const map of [elements, boundaries]) for (const [k, b] of map) map.set(k, { ...b, ...move(b) })
  for (const rel of rels.values()) {
    rel.points = rel.points.map(move)
    if (rel.label) rel.label = move(rel.label)
  }
  return { result: { width: maxX - minX, height: maxY - minY, elements, boundaries, rels }, conflicts, needs }
}

/** Whether the segment from `a` to `b` passes through the rectangle. */
function segmentCrosses(a: Point, b: Point, r: Rect): boolean {
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  for (const [p, q] of [
    [-dx, a.x - r.l],
    [dx, r.r - a.x],
    [-dy, a.y - r.t],
    [dy, r.b - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 > t1) return false
  }
  return t0 < t1
}

/** Every order of a short list, the given order first. */
function permutations<T>(list: readonly T[]): T[][] {
  if (list.length <= 1) return [list.slice()]
  const out: T[][] = []
  list.forEach((head, i) => {
    for (const rest of permutations([...list.slice(0, i), ...list.slice(i + 1)])) out.push([head, ...rest])
  })
  return out
}

/** What a step costs for the frame borders it crosses or runs along. */
function borderCost(a: Point, b: Point, frames: readonly Rect[]): number {
  let cost = 0
  const horizontal = a.y === b.y
  for (const f of frames) {
    if (horizontal) {
      const lo = Math.min(a.x, b.x)
      const hi = Math.max(a.x, b.x)
      const inSpan = Math.min(hi, f.r) - Math.max(lo, f.l)
      if (inSpan > 0 && (Math.abs(a.y - f.t) < CLEAR || Math.abs(a.y - f.b) < CLEAR)) cost += inSpan * 2
      if (a.y > f.t && a.y < f.b) {
        if (lo < f.l && hi > f.l) cost += 60
        if (lo < f.r && hi > f.r) cost += 60
      }
    } else {
      const lo = Math.min(a.y, b.y)
      const hi = Math.max(a.y, b.y)
      const inSpan = Math.min(hi, f.b) - Math.max(lo, f.t)
      if (inSpan > 0 && (Math.abs(a.x - f.l) < CLEAR || Math.abs(a.x - f.r) < CLEAR)) cost += inSpan * 2
      if (a.x > f.l && a.x < f.r) {
        if (lo < f.t && hi > f.t) cost += 60
        if (lo < f.b && hi > f.b) cost += 60
      }
    }
  }
  return cost
}

/** Drops points in the middle of a straight run. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue
    out.push(p)
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3) as [Point, Point, Point]
      const straight = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01)
      if (!straight) break
      out.splice(out.length - 2, 1)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/**
 * Puts every label on its path: near the middle, on a long run, clear of
 * elements, titles and labels placed before. Returns how many could not be
 * placed clear of everything.
 */
function placeLabels(
  input: C4LayoutInput,
  elements: Map<string, Box>,
  titles: Rect[],
  frames: Rect[],
  rels: Map<number, PlacedRel>,
): { conflicts: number; needs: { x: number; y: number } } {
  const placed: Rect[] = []
  const elementRects = [...elements.values()].map(rectOf)
  const segments: { a: Point; b: Point; rel: number }[] = []
  for (const [i, rel] of rels) for (let k = 1; k < rel.points.length; k++) segments.push({ a: rel.points[k - 1]!, b: rel.points[k]!, rel: i })
  let conflicts = 0
  const needs = { x: 0, y: 0 }
  // Long paths choose last: short ones have fewer places to go.
  const ids = [...rels.keys()].filter((i) => input.relLabel.has(i))
  const length = (i: number) => {
    const pts = rels.get(i)!.points
    let s = 0
    for (let k = 1; k < pts.length; k++) s += Math.abs(pts[k]!.x - pts[k - 1]!.x) + Math.abs(pts[k]!.y - pts[k - 1]!.y)
    return s
  }
  ids.sort((a, b) => length(a) - length(b) || a - b)
  for (const i of ids) {
    const size = input.relLabel.get(i)!
    const pts = rels.get(i)!.points
    const total = length(i)
    let best: { p: Point; score: number; horizontal: boolean } | null = null
    let along = 0
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!
      const b = pts[k]!
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
      const horizontal = Math.abs(a.y - b.y) < 0.01
      for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
        const on = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
        const offsets = horizontal
          ? [{ x: 0, y: 0 }, { x: 0, y: -(size.height / 2 + 4) }, { x: 0, y: size.height / 2 + 4 }]
          : [{ x: 0, y: 0 }, { x: size.width / 2 + 6, y: 0 }, { x: -(size.width / 2 + 6), y: 0 }]
        offsets.forEach((o, n) => {
          const p = { x: on.x + o.x, y: on.y + o.y }
          const box: Rect = { l: p.x - size.width / 2, t: p.y - size.height / 2, r: p.x + size.width / 2, b: p.y + size.height / 2 }
          let score = Math.abs(along + len * t - total / 2) * 0.3 + (n > 0 ? 60 : 0) + (len < (horizontal ? size.width : size.height) ? 20 : 0)
          for (const e of elementRects) if (overlaps(box, inflate(e, 2))) score += 1000 + area(box, e)
          for (const q of placed) if (overlaps(box, inflate(q, 3))) score += 1000 + area(box, q)
          for (const q of titles) if (overlaps(box, q)) score += 500
          // Over a bend of its own path the label hides where the path turns.
          for (let v = 1; v + 1 < pts.length; v++) {
            const q = pts[v]!
            if (q.x > box.l - 4 && q.x < box.r + 4 && q.y > box.t - 4 && q.y < box.b + 4) score += 80
          }
          // Astride a frame's border the label hides it and reads as part of it.
          for (const f of frames) {
            const inside = box.l >= f.l + 6 && box.r <= f.r - 6 && box.t >= f.t + 6 && box.b <= f.b - 6
            if (overlaps(box, inflate(f, 6)) && !inside) score += 150
          }
          for (const s of segments) {
            if (s.rel === i) continue
            const sr: Rect = { l: Math.min(s.a.x, s.b.x), t: Math.min(s.a.y, s.b.y), r: Math.max(s.a.x, s.b.x), b: Math.max(s.a.y, s.b.y) }
            if (overlaps(box, inflate(sr, 0.5))) score += 200
          }
          if (!best || score < best.score) best = { p, score, horizontal }
        })
      }
      along += len
    }
    if (!best) continue
    const chosen: { p: Point; score: number; horizontal: boolean } = best
    if (chosen.score >= 500) {
      conflicts++
      // The gap that would hold the label on its run, with clearance.
      if (chosen.horizontal) needs.x = Math.max(needs.x, size.width + 2 * CLEAR + 12)
      else needs.y = Math.max(needs.y, size.height + 2 * CLEAR + 12)
    }
    rels.get(i)!.label = chosen.p
    placed.push({ l: chosen.p.x - size.width / 2, t: chosen.p.y - size.height / 2, r: chosen.p.x + size.width / 2, b: chosen.p.y + size.height / 2 })
  }
  return { conflicts, needs }
}
