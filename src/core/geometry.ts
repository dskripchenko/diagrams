/**
 * Points, boxes, and the curves edges are drawn with.
 */
import { PathBuilder } from './svg'

export interface Point {
  x: number
  y: number
}

export interface Box {
  /** Centre. */
  x: number
  y: number
  width: number
  height: number
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Where the segment from the centre of `box` towards `toward` leaves the box.
 */
export function intersectRect(box: Box, toward: Point): Point {
  const dx = toward.x - box.x
  const dy = toward.y - box.y
  const w = box.width / 2
  const h = box.height / 2
  if (dx === 0 && dy === 0) return { x: box.x, y: box.y + h }
  let sx: number
  let sy: number
  if (Math.abs(dy) * w > Math.abs(dx) * h) {
    // Top or bottom side.
    sy = dy < 0 ? -h : h
    sx = (sy * dx) / dy
  } else {
    sx = dx < 0 ? -w : w
    sy = (sx * dy) / dx
  }
  return { x: box.x + sx, y: box.y + sy }
}

export function intersectEllipse(center: Point, rx: number, ry: number, toward: Point): Point {
  const dx = toward.x - center.x
  const dy = toward.y - center.y
  if (dx === 0 && dy === 0) return { x: center.x, y: center.y + ry }
  const t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry))
  return { x: center.x + dx * t, y: center.y + dy * t }
}

/**
 * Where the segment from `center` towards `toward` crosses a convex polygon
 * given in absolute coordinates.
 */
export function intersectPolygon(center: Point, polygon: readonly Point[], toward: Point): Point {
  let best: Point | null = null
  let bestT = Infinity
  const dx = toward.x - center.x
  const dy = toward.y - center.y
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const ex = b.x - a.x
    const ey = b.y - a.y
    const denom = dx * ey - dy * ex
    if (Math.abs(denom) < 1e-9) continue
    const t = ((a.x - center.x) * ey - (a.y - center.y) * ex) / denom
    const u = ((a.x - center.x) * dy - (a.y - center.y) * dx) / denom
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9 && t < bestT) {
      bestT = t
      best = { x: center.x + dx * t, y: center.y + dy * t }
    }
  }
  return best ?? { x: center.x, y: center.y }
}

/** Removes consecutive points closer than `epsilon`. */
export function dedupe(points: readonly Point[], epsilon = 0.5): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || distance(last, p) > epsilon) out.push(p)
  }
  return out
}

/**
 * A smooth path through the points: a uniform B-spline ("basis", as Mermaid
 * draws by default) that starts and ends exactly on the first and last point.
 */
export function basisPath(points: readonly Point[]): string {
  const pts = dedupe(points)
  const path = new PathBuilder()
  if (pts.length === 0) return ''
  if (pts.length === 1) return path.moveTo(pts[0]!.x, pts[0]!.y).toString()
  // d3's curveBasis, written out.
  let x0 = 0
  let y0 = 0
  let x1 = 0
  let y1 = 0
  const bezier = (x: number, y: number) => {
    path.curveTo(
      (2 * x0 + x1) / 3,
      (2 * y0 + y1) / 3,
      (x0 + 2 * x1) / 3,
      (y0 + 2 * y1) / 3,
      (x0 + 4 * x1 + x) / 6,
      (y0 + 4 * y1 + y) / 6,
    )
  }
  let state = 0
  for (const p of pts) {
    if (state === 0) {
      state = 1
      path.moveTo(p.x, p.y)
    } else if (state === 1) {
      state = 2
    } else if (state === 2) {
      state = 3
      path.lineTo((5 * x0 + x1) / 6, (5 * y0 + y1) / 6)
      bezier(p.x, p.y)
    } else {
      bezier(p.x, p.y)
    }
    x0 = x1
    x1 = p.x
    y0 = y1
    y1 = p.y
  }
  if (state === 3) bezier(x1, y1)
  path.lineTo(x1, y1)
  return path.toString()
}

/** Straight segments through the points. */
export function linearPath(points: readonly Point[]): string {
  const pts = dedupe(points)
  const path = new PathBuilder()
  pts.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)))
  return path.toString()
}

/** The point halfway along a polyline, measured by length. */
export function midpoint(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  let total = 0
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1]!, points[i]!)
  let remaining = total / 2
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const d = distance(a, b)
    if (d >= remaining && d > 0) {
      const t = remaining / d
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    remaining -= d
  }
  return points[points.length - 1]!
}

/** Moves the end of a polyline back by `amount` so an arrowhead fits on top of it. */
export function shortenEnd(points: Point[], amount: number): Point[] {
  if (points.length < 2 || amount <= 0) return points
  const out = points.slice()
  const end = out[out.length - 1]!
  const prev = out[out.length - 2]!
  const d = distance(prev, end)
  if (d <= amount) return out
  const t = (d - amount) / d
  out[out.length - 1] = { x: prev.x + (end.x - prev.x) * t, y: prev.y + (end.y - prev.y) * t }
  return out
}

export function shortenStart(points: Point[], amount: number): Point[] {
  return shortenEnd(points.slice().reverse(), amount).reverse()
}
