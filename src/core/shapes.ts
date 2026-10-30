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
  // UML and infrastructure elements (PlantUML's use case, component and deployment diagrams).
  | 'actor'
  | 'usecase'
  | 'component'
  | 'interface'
  | 'node'
  | 'cloud'
  | 'folder'
  | 'frame'
  | 'artifact'
  | 'note'
  | 'file'
  | 'queue'
  | 'storage'
  | 'stack'
  | 'person'
  | 'collections'
  | 'boundary'
  | 'control'
  | 'entity'
  | 'text'

/** Shapes drawn as a figure with the label under it rather than inside. */
const FIGURES: Partial<Record<ShapeKind, number>> = {
  actor: 40,
  interface: 22,
  boundary: 30,
  control: 30,
  entity: 30,
}

/** True for shapes whose label sits under the figure, outside its outline. */
export function labelBelow(kind: ShapeKind): boolean {
  return FIGURES[kind] !== undefined
}

/** Where a shape's label is centred, given the box the layout placed it in. */
export function labelCentre(kind: ShapeKind, box: Box, labelHeight: number): Point {
  const figure = FIGURES[kind]
  if (figure === undefined) return { x: box.x, y: box.y + (kind === 'person' ? 8 : 0) }
  return { x: box.x, y: box.y - box.height / 2 + figure + 4 + labelHeight / 2 }
}

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
  const figure = FIGURES[kind]
  if (figure !== undefined) return { width: Math.max(labelWidth + 8, figure + 16), height: figure + 4 + labelHeight }
  switch (kind) {
    case 'usecase':
      // An ellipse holds its label's box when scaled by √2.
      return { width: Math.max(labelWidth * 1.42 + 20, 80), height: Math.max(labelHeight * 1.42 + 14, 40) }
    case 'component':
      return { width: w + 22, height: Math.max(h, 40) }
    case 'node':
      return { width: w + 10, height: h + 10 }
    case 'cloud':
      return { width: w + 34, height: h + 26 }
    case 'folder':
      return { width: Math.max(w, 60), height: h + 10 }
    case 'frame':
      return { width: w, height: h + 18 }
    case 'artifact':
    case 'note':
    case 'file':
      return { width: w + 12, height: h }
    case 'queue':
      return { width: w + 24, height: h }
    case 'storage':
      return { width: w + h / 2, height: h }
    case 'stack':
      return { width: w, height: h + 8 }
    case 'person':
      return { width: Math.max(w, 60), height: h + 18 }
    case 'collections':
      return { width: w + 6, height: h + 6 }
    case 'text':
      return { width: labelWidth + 8, height: labelHeight + 4 }
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
    default: {
      const element = drawElement(kind, box, cls, style)
      return element ?? el('rect', { class: cls, style, x: left, y: top, width: w, height: h })
    }
  }
}

/** The UML and infrastructure elements; null for a plain rectangle. */
function drawElement(kind: ShapeKind, box: Box, cls: string, style: string | undefined): SvgElement | null {
  const { x, y, width: w, height: h } = box
  const left = x - w / 2
  const top = y - h / 2
  const right = left + w
  const bottom = top + h
  const line = `${cls} dg-shape-line`
  switch (kind) {
    case 'actor': {
      const cx = x
      const head = 7
      const neck = top + head * 2 + 2
      const hips = neck + 13
      const feet = top + 38
      return el('g', {}, [
        el('circle', { class: cls, style, cx, cy: top + head + 2, r: head }),
        el('path', {
          class: line,
          style,
          d: new PathBuilder().moveTo(cx, neck).lineTo(cx, hips).moveTo(cx - 12, neck + 5).lineTo(cx + 12, neck + 5).moveTo(cx, hips).lineTo(cx - 10, feet).moveTo(cx, hips).lineTo(cx + 10, feet).toString(),
        }),
      ])
    }
    case 'interface':
      return el('circle', { class: cls, style, cx: x, cy: top + 11, r: 10 })
    case 'boundary':
      return el('g', {}, [
        el('path', { class: line, style, d: new PathBuilder().moveTo(x - 17, top + 3).lineTo(x - 17, top + 27).moveTo(x - 17, top + 15).lineTo(x - 8, top + 15).toString() }),
        el('circle', { class: cls, style, cx: x + 4, cy: top + 15, r: 12 }),
      ])
    case 'control':
      return el('g', {}, [
        el('circle', { class: cls, style, cx: x, cy: top + 17, r: 12 }),
        el('path', { class: line, style, d: new PathBuilder().moveTo(x + 5, top + 1).lineTo(x - 1, top + 5).lineTo(x + 5, top + 9).toString() }),
      ])
    case 'entity':
      return el('g', {}, [
        el('circle', { class: cls, style, cx: x, cy: top + 13, r: 12 }),
        el('line', { class: line, style, x1: x - 12, y1: top + 28, x2: x + 12, y2: top + 28 }),
      ])
    case 'usecase':
      return el('ellipse', { class: cls, style, cx: x, cy: y, rx: w / 2, ry: h / 2 })
    case 'component':
      // UML 2: the box with the component icon in its top right corner.
      return el('g', {}, [
        el('rect', { class: cls, style, x: left, y: top, width: w, height: h, rx: 2 }),
        el('rect', { class: cls, style, x: right - 20, y: top + 6, width: 12, height: 15, rx: 1 }),
        el('rect', { class: cls, style, x: right - 23, y: top + 9, width: 6, height: 3 }),
        el('rect', { class: cls, style, x: right - 23, y: top + 15, width: 6, height: 3 }),
      ])
    case 'node': {
      const d = 10
      return el('g', {}, [
        el('path', { class: cls, style, d: new PathBuilder().moveTo(left, top + d).lineTo(left + d, top).lineTo(right, top).lineTo(right, bottom - d).lineTo(right - d, bottom).lineTo(left, bottom).close().toString() }),
        el('path', { class: line, style, d: new PathBuilder().moveTo(left, top + d).lineTo(right - d, top + d).lineTo(right, top).moveTo(right - d, top + d).lineTo(right - d, bottom).toString() }),
      ])
    }
    case 'cloud': {
      // Bumps around the box: arcs between points on its outline.
      const p = new PathBuilder().moveTo(left + w * 0.2, bottom - h * 0.1)
      p.arcTo(w * 0.12, h * 0.18, 0, false, true, left + w * 0.05, top + h * 0.55)
      p.arcTo(w * 0.14, h * 0.22, 0, false, true, left + w * 0.25, top + h * 0.15)
      p.arcTo(w * 0.18, h * 0.22, 0, false, true, left + w * 0.6, top + h * 0.1)
      p.arcTo(w * 0.16, h * 0.22, 0, false, true, right - w * 0.05, top + h * 0.45)
      p.arcTo(w * 0.13, h * 0.2, 0, false, true, right - w * 0.2, bottom - h * 0.1)
      p.close()
      return el('path', { class: cls, style, d: p.toString() })
    }
    case 'folder':
      return el('path', { class: cls, style, d: new PathBuilder().moveTo(left, top + 10).lineTo(left, bottom).lineTo(right, bottom).lineTo(right, top + 10).lineTo(left + Math.min(w * 0.4, 60) + 6, top + 10).lineTo(left + Math.min(w * 0.4, 60), top).lineTo(left, top).close().toString() })
    case 'frame':
      return el('g', {}, [
        el('rect', { class: cls, style, x: left, y: top, width: w, height: h }),
        el('path', { class: line, style, d: new PathBuilder().moveTo(left, top + 14).lineTo(left + 26, top + 14).lineTo(left + 32, top + 8).lineTo(left + 32, top).toString() }),
      ])
    case 'artifact':
    case 'file':
    case 'note': {
      const f = 10
      return el('g', {}, [
        el('path', { class: cls, style, d: new PathBuilder().moveTo(left, top).lineTo(right - f, top).lineTo(right, top + f).lineTo(right, bottom).lineTo(left, bottom).close().toString() }),
        el('path', { class: line, style, d: new PathBuilder().moveTo(right - f, top).lineTo(right - f, top + f).lineTo(right, top + f).toString() }),
      ])
    }
    case 'queue': {
      const rx = 8
      return el('g', {}, [
        el('path', { class: cls, style, d: new PathBuilder().moveTo(left + rx, top).lineTo(right - rx, top).arcTo(rx, h / 2, 0, false, true, right - rx, bottom).lineTo(left + rx, bottom).arcTo(rx, h / 2, 0, false, true, left + rx, top).close().toString() }),
        el('path', { class: line, style, d: new PathBuilder().moveTo(right - rx, top).arcTo(rx, h / 2, 0, false, false, right - rx, bottom).toString() }),
      ])
    }
    case 'storage':
      return el('rect', { class: cls, style, x: left, y: top, width: w, height: h, rx: h / 2, ry: h / 2 })
    case 'stack':
      return el('g', {}, [
        el('rect', { class: cls, style, x: left, y: top + 8, width: w, height: h - 8 }),
        el('path', { class: line, style, d: new PathBuilder().moveTo(left + 4, top + 8).lineTo(left + 4, top + 4).lineTo(right - 4, top + 4).lineTo(right - 4, top + 8).moveTo(left + 8, top + 4).lineTo(left + 8, top).lineTo(right - 8, top).lineTo(right - 8, top + 4).toString() }),
      ])
    case 'person':
      return el('g', {}, [
        el('rect', { class: cls, style, x: left, y: top + 16, width: w, height: h - 16, rx: 10 }),
        el('circle', { class: cls, style, cx: x, cy: top + 9, r: 9 }),
      ])
    case 'collections':
      return el('g', {}, [
        el('rect', { class: cls, style, x: left + 6, y: top, width: w - 6, height: h - 6 }),
        el('rect', { class: cls, style, x: left, y: top + 6, width: w - 6, height: h - 6 }),
      ])
    case 'text':
      return el('g', {})
    default:
      return null
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
    case 'usecase':
      return intersectEllipse(box, box.width / 2, box.height / 2, toward)
    default:
      return intersectRect(box, toward)
  }
}
