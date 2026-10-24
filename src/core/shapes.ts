/**
 * Node shapes: how big a shape must be to hold its label, how it is drawn,
 * and where an edge pointing at its centre meets its outline.
 */
import { intersectEllipse, intersectPolygon, intersectRect, type Box, type Point } from './geometry'
import { el, PathBuilder, type SvgElement } from './svg'

export type ShapeKind =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'doublecircle'
  | 'asymmetric'
  | 'rhombus'
  | 'hexagon'
  | 'parallelogram'
  | 'parallelogram-alt'
  | 'trapezoid'
  | 'trapezoid-alt'
  // State-diagram pseudo states.
  | 'start'
  | 'end'
  | 'fork'
  | 'choice'

export interface ShapeSize {
  width: number
  height: number
}

export const PADDING_X = 16
export const PADDING_Y = 9

function polygonPoints(points: readonly Point[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function abs(box: Box, rel: readonly Point[]): Point[] {
  return rel.map((p) => ({ x: box.x + p.x, y: box.y + p.y }))
}

/** The outline polygon relative to the centre, for polygonal shapes. */
function outline(kind: ShapeKind, w: number, h: number): Point[] | null {
  const hw = w / 2
  const hh = h / 2
  switch (kind) {
    case 'rhombus':
    case 'choice':
      return [
        { x: 0, y: -hh },
        { x: hw, y: 0 },
        { x: 0, y: hh },
        { x: -hw, y: 0 },
      ]
    case 'hexagon': {
      const m = Math.min(h / 2, w / 4)
      return [
        { x: -hw + m, y: -hh },
        { x: hw - m, y: -hh },
        { x: hw, y: 0 },
        { x: hw - m, y: hh },
        { x: -hw + m, y: hh },
        { x: -hw, y: 0 },
      ]
    }
    case 'parallelogram': {
      const m = h / 2
      return [
        { x: -hw + m, y: -hh },
        { x: hw, y: -hh },
        { x: hw - m, y: hh },
        { x: -hw, y: hh },
      ]
    }
    case 'parallelogram-alt': {
      const m = h / 2
      return [
        { x: -hw, y: -hh },
        { x: hw - m, y: -hh },
        { x: hw, y: hh },
        { x: -hw + m, y: hh },
      ]
    }
    case 'trapezoid': {
      const m = h / 2
      return [
        { x: -hw + m, y: -hh },
        { x: hw - m, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ]
    }
    case 'trapezoid-alt': {
      const m = h / 2
      return [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw - m, y: hh },
        { x: -hw + m, y: hh },
      ]
    }
    case 'asymmetric': {
      const m = h / 2
      return [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
        { x: -hw + m, y: 0 },
      ]
    }
    default:
      return null
  }
}

/** The size a shape needs around a label of the given size. */
export function shapeSize(kind: ShapeKind, labelWidth: number, labelHeight: number): ShapeSize {
  const w = labelWidth + PADDING_X * 2
  const h = labelHeight + PADDING_Y * 2
  switch (kind) {
    case 'start':
      return { width: 14, height: 14 }
    case 'end':
      return { width: 18, height: 18 }
    case 'fork':
      return { width: 70, height: 8 }
    case 'choice':
      return { width: 28, height: 28 }
    case 'circle': {
      const d = Math.max(labelWidth, labelHeight) + PADDING_Y * 2
      return { width: d, height: d }
    }
    case 'doublecircle': {
      const d = Math.max(labelWidth, labelHeight) + PADDING_Y * 2 + 10
      return { width: d, height: d }
    }
    case 'rhombus': {
      // A diamond holds its label's box when each half-diagonal is the sum
      // of the label's half-width and half-height.
      const s = labelWidth + labelHeight + PADDING_Y * 2
      return { width: Math.max(s, 40), height: Math.max(s * 0.75, 40) }
    }
    case 'hexagon':
      return { width: w + h / 2, height: h }
    case 'parallelogram':
    case 'parallelogram-alt':
    case 'trapezoid':
    case 'trapezoid-alt':
      return { width: w + h / 2, height: h }
    case 'asymmetric':
      return { width: w + h / 4, height: h }
    case 'stadium':
      return { width: w + h / 2, height: h }
    case 'subroutine':
      return { width: w + 16, height: h }
    case 'cylinder':
      return { width: w, height: h + 16 }
    default:
      return { width: w, height: h }
  }
}

/** Draws the shape centred in `box`. `className` goes on the outline element(s). */
export function drawShape(
  kind: ShapeKind,
  box: Box,
  options: { className?: string; style?: string } = {},
): SvgElement {
  const cls = options.className ?? 'dg-shape'
  const style = options.style
  const { x, y, width: w, height: h } = box
  const left = x - w / 2
  const top = y - h / 2
  const poly = outline(kind, w, h)
  if (poly) {
    return el('polygon', { class: cls, style, points: polygonPoints(abs(box, poly)) })
  }
  switch (kind) {
    case 'round':
      return el('rect', { class: cls, style, x: left, y: top, width: w, height: h, rx: 6, ry: 6 })
    case 'stadium':
      return el('rect', { class: cls, style, x: left, y: top, width: w, height: h, rx: h / 2, ry: h / 2 })
    case 'circle':
      return el('circle', { class: cls, style, cx: x, cy: y, r: w / 2 })
    case 'doublecircle':
      return el('g', {}, [
        el('circle', { class: cls, style, cx: x, cy: y, r: w / 2 }),
        el('circle', { class: cls, style, cx: x, cy: y, r: w / 2 - 5 }),
      ])
    case 'subroutine':
      return el('g', {}, [
        el('rect', { class: cls, style, x: left, y: top, width: w, height: h }),
        el('line', { class: cls, style, x1: left + 8, y1: top, x2: left + 8, y2: top + h }),
        el('line', { class: cls, style, x1: left + w - 8, y1: top, x2: left + w - 8, y2: top + h }),
      ])
    case 'cylinder': {
      const ry = 8
      const rx = w / 2
      const body = new PathBuilder()
        .moveTo(left, top + ry)
        .arcTo(rx, ry, 0, false, false, left + w, top + ry)
        .lineTo(left + w, top + h - ry)
        .arcTo(rx, ry, 0, false, true, left, top + h - ry)
        .close()
      const lid = new PathBuilder()
        .moveTo(left, top + ry)
        .arcTo(rx, ry, 0, false, true, left + w, top + ry)
      return el('g', {}, [
        el('path', { class: cls, style, d: body.toString() }),
        el('path', { class: cls, style, d: lid.toString(), 'fill-opacity': 0 }),
      ])
    }
    case 'start':
      return el('circle', { class: 'dg-state-start', cx: x, cy: y, r: w / 2 })
    case 'end':
      return el('g', {}, [
        el('circle', { class: 'dg-state-end-ring', cx: x, cy: y, r: w / 2 }),
        el('circle', { class: 'dg-state-start', cx: x, cy: y, r: w / 2 - 4 }),
      ])
    case 'fork':
      return el('rect', { class: 'dg-state-start', x: left, y: top, width: w, height: h, rx: 2 })
    default:
      return el('rect', { class: cls, style, x: left, y: top, width: w, height: h })
  }
}

/** Where a line from the shape's centre towards `toward` crosses its outline. */
export function intersectShape(kind: ShapeKind, box: Box, toward: Point): Point {
  const poly = outline(kind, box.width, box.height)
  if (poly) {
    return intersectPolygon(box, abs(box, poly), toward)
  }
  switch (kind) {
    case 'circle':
    case 'doublecircle':
    case 'start':
    case 'end':
      return intersectEllipse(box, box.width / 2, box.height / 2, toward)
    default:
      return intersectRect(box, toward)
  }
}
