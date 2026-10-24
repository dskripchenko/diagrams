/**
 * Arrowheads and other line ends, as SVG `<marker>`s.
 *
 * Marker ids carry the document's id prefix: two diagrams on one page each
 * define their own, and a reference never resolves to the other diagram's.
 */
import { el, type SvgElement } from './svg'

export type MarkerKind = 'arrow' | 'open-arrow' | 'circle' | 'cross' | 'half-arrow'

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
  }
}
