/**
 * Arrowheads and other line ends, as SVG `<marker>`s.
 *
 * Marker ids carry the document's id prefix: two diagrams on one page each
 * define their own, and a reference never resolves to the other diagram's.
 */
import { el, type SvgElement } from './svg'
import { v } from './theme'

export type MarkerKind =
  | 'arrow'
  | 'open-arrow'
  | 'circle'
  | 'cross'
  | 'half-arrow'
  // Crow's foot ends of entity relationships.
  | 'er-one'
  | 'er-zero-one'
  | 'er-one-many'
  | 'er-zero-many'
  // UML ends: inheritance and realization, composition, aggregation.
  | 'triangle'
  | 'diamond'
  | 'diamond-open'

export function markerId(prefix: string, kind: MarkerKind, start = false): string {
  return `${prefix}-m-${kind}${start ? '-start' : ''}`
}

/**
 * Builds `<marker>` definitions. Each kind gets an end and a start variant
 * (the start one is mirrored), since `orient="auto-start-reverse"` is still
 * not drawn the same way everywhere.
 */
export function markerDefs(prefix: string, kinds: Iterable<MarkerKind>): SvgElement[] {
  const out: SvgElement[] = []
  for (const kind of new Set(kinds)) {
    for (const start of [false, true]) {
      out.push(marker(prefix, kind, start))
    }
  }
  return out
}

/** Hollow parts are filled with the page background, so the line under them does not show. */
const HOLLOW = `fill:${v('--dg-edge-label-fill')}`

/**
 * Ends that sit on a box edge. Drawn pointing right in a `width` × `height`
 * box with the box edge at `tip`; one unit is one pixel whatever the stroke
 * width, and the shapes keep a pixel of margin so the marker's clip does not
 * shave their stroke.
 */
function edgeEnd(id: string, start: boolean, width: number, height: number, tip: number, parts: SvgElement[]): SvgElement {
  return el(
    'marker',
    {
      id,
      markerUnits: 'userSpaceOnUse',
      orient: 'auto',
      viewBox: `0 0 ${width} ${height}`,
      refX: start ? width - tip : tip,
      refY: height / 2,
      markerWidth: width,
      markerHeight: height,
    },
    [el('g', { transform: start ? `translate(${width},0) scale(-1,1)` : undefined }, parts)],
  )
}

/** A crow's foot: three toes spread over the box edge at `tip`, joined `length` before it. */
function crowsFoot(tip: number, length: number, spread: number, mid: number): SvgElement {
  return el('path', {
    class: 'dg-marker',
    d: `M${tip},${mid - spread} L${tip - length},${mid} L${tip},${mid + spread}`,
    style: 'fill:none',
    'stroke-width': 1.5,
  })
}

function bar(x: number, mid: number, half: number): SvgElement {
  return el('path', { class: 'dg-marker', d: `M${x},${mid - half} L${x},${mid + half}`, style: 'fill:none', 'stroke-width': 1.5 })
}

function ring(cx: number, mid: number, r: number): SvgElement {
  return el('circle', { class: 'dg-marker', cx, cy: mid, r, style: HOLLOW, 'stroke-width': 1.5 })
}

function marker(prefix: string, kind: MarkerKind, start: boolean): SvgElement {
  const id = markerId(prefix, kind, start)
  const common = {
    id,
    markerUnits: 'userSpaceOnUse',
    orient: 'auto',
  }
  // Drawn pointing right with the tip at (10, 5); the start variant points left.
  const flip = start ? 'translate(10,0) scale(-1,1)' : undefined
  switch (kind) {
    case 'arrow':
      return el('marker', { ...common, viewBox: '0 0 10 10', refX: start ? 1 : 9, refY: 5, markerWidth: 10, markerHeight: 10 }, [
        el('path', { class: 'dg-marker', d: 'M0,0 L10,5 L0,10 z', transform: flip, 'stroke-width': 1 }),
      ])
    case 'open-arrow':
      return el('marker', { ...common, viewBox: '0 0 10 10', refX: start ? 1 : 9, refY: 5, markerWidth: 10, markerHeight: 10 }, [
        el('path', { class: 'dg-marker dg-marker-open', d: 'M1,1 L9,5 L1,9', transform: flip, style: 'fill:none', 'stroke-width': 1.5 }),
      ])
    case 'half-arrow':
      return el('marker', { ...common, viewBox: '0 0 10 10', refX: start ? 1 : 9, refY: 5, markerWidth: 10, markerHeight: 10 }, [
        el('path', { class: 'dg-marker', d: 'M0,0 L10,5 L0,5 z', transform: flip, 'stroke-width': 1 }),
      ])
    case 'circle':
      return el('marker', { ...common, viewBox: '0 0 10 10', refX: start ? 1 : 9, refY: 5, markerWidth: 9, markerHeight: 9 }, [
        el('circle', { class: 'dg-marker', cx: 5, cy: 5, r: 4, 'stroke-width': 1 }),
      ])
    case 'cross':
      return el('marker', { ...common, viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 11, markerHeight: 11 }, [
        el('path', { class: 'dg-marker', d: 'M1,1 L9,9 M1,9 L9,1', 'stroke-width': 2, style: 'fill:none' }),
      ])
    // Crow's feet: the outer symbol says "one" or "many", the inner one
    // whether zero is allowed. Box edge at x = 31 in a 32 × 20 box.
    case 'er-one':
      return edgeEnd(id, start, 32, 20, 31, [bar(23, 10, 7), bar(17, 10, 7)])
    case 'er-zero-one':
      return edgeEnd(id, start, 32, 20, 31, [bar(23, 10, 7), ring(12, 10, 5)])
    case 'er-one-many':
      return edgeEnd(id, start, 32, 20, 31, [crowsFoot(31, 14, 8, 10), bar(13, 10, 7)])
    case 'er-zero-many':
      return edgeEnd(id, start, 32, 20, 31, [crowsFoot(31, 14, 8, 10), ring(10, 10, 5)])
    case 'triangle':
      return edgeEnd(id, start, 20, 20, 19, [
        el('path', { class: 'dg-marker', d: 'M19,10 L3,2 L3,18 z', style: HOLLOW, 'stroke-width': 1.5 }),
      ])
    case 'diamond':
    case 'diamond-open':
      return edgeEnd(id, start, 22, 16, 21, [
        el('path', {
          class: 'dg-marker',
          d: 'M21,8 L12,2 L3,8 L12,14 z',
          style: kind === 'diamond-open' ? HOLLOW : undefined,
          'stroke-width': 1.5,
        }),
      ])
  }
}
