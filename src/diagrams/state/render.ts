/**
 * Drawing a state diagram with the layered layout. Composite states and
 * concurrent regions are clusters; notes sit beside their state, in room the
 * state reserves for them in the layout.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { basisPath, intersectRect, type Box, type Point } from '../../core/geometry'
import { markerDefs, markerId } from '../../core/markers'
import { drawShape, intersectShape, PADDING_X, PADDING_Y, shapeSize, type ShapeKind } from '../../core/shapes'
import { cssText, mergeStyles, type UserStyle } from '../../core/style'
import { el, type SvgElement } from '../../core/svg'
import { measureLabel, parseLabel, plainLabel, renderLabel, type MeasuredLabel, type TextMeasurer } from '../../core/text'
import { BASE_FONT, v } from '../../core/theme'
import { layout, type LayoutCluster, type LayoutEdge, type LayoutNode } from '../../layout/layered'
import type { StateDiagram, StateKind, StateNode } from './parser'

const NOTE_GAP = 16
const NOTE_PADDING = 8

function shapeOf(kind: StateKind): ShapeKind {
  switch (kind) {
    case 'start':
      return 'start'
    case 'end':
      return 'end'
    case 'choice':
      return 'choice'
    case 'fork':
    case 'join':
      return 'fork'
    default:
      return 'round'
  }
}

interface Measured {
  title: MeasuredLabel
  body?: MeasuredLabel
  width: number
  height: number
}

function styleFor(classes: readonly string[], own: UserStyle | undefined, defs: Map<string, UserStyle>): UserStyle {
  return mergeStyles(defs.get('default'), ...classes.map((c) => defs.get(c)), own)
}

export function renderState(d: StateDiagram, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const horizontal = d.direction === 'LR' || d.direction === 'RL'
  const titleFont = { ...BASE_FONT, weight: 'bold' as const }

  // Sizes of states, with their descriptions under a rule.
  const measured = new Map<string, Measured>()
  for (const st of d.states.values()) {
    if (st.kind !== 'state') continue
    if (st.descriptions.length === 0) {
      const t = measureLabel(parseLabel(st.name), BASE_FONT, measure)
      const size = shapeSize('round', t.width, t.height)
      measured.set(st.id, { title: t, width: Math.max(size.width, 60), height: size.height })
    } else {
      const t = measureLabel(parseLabel(st.name), titleFont, measure)
      const b = measureLabel(parseLabel(st.descriptions.join('<br>')), BASE_FONT, measure)
      measured.set(st.id, {
        title: t,
        body: b,
        width: Math.max(t.width, b.width, 40) + PADDING_X * 2,
        height: t.height + b.height + PADDING_Y * 3,
      })
    }
  }
  const sizeOf = (st: StateNode): { width: number; height: number } => {
    if (st.kind === 'state') return measured.get(st.id)!
    const s = shapeSize(shapeOf(st.kind), 0, 0)
    // A fork bar lies across the flow.
    return (st.kind === 'fork' || st.kind === 'join') && horizontal ? { width: s.height, height: s.width } : s
  }

  // Notes beside states reserve room on both sides, so the state stays
  // centred on the point its edges were laid out towards.
  const noteLabels = d.notes.map((n) => measureLabel(plainLabel(n.text), BASE_FONT, measure))
  const noteRoom = new Map<string, number>()
  const compositeNotes: number[] = []
  d.notes.forEach((n, i) => {
    if (d.composites.has(n.target)) {
      compositeNotes.push(i)
      return
    }
    // Across the flow: beside the state in TB/BT, above or below it in LR/RL,
    // where a note "left of" a state would otherwise sit on its incoming edge.
    const l = noteLabels[i]!
    const room = (horizontal ? l.height : l.width) + NOTE_PADDING * 2 + NOTE_GAP
    noteRoom.set(n.target, Math.max(noteRoom.get(n.target) ?? 0, room))
  })

  const nodes: LayoutNode[] = [...d.states.values()].map((st) => {
    const s = sizeOf(st)
    const room = noteRoom.get(st.id) ?? 0
    const across = Math.max(
      0,
      ...d.notes.map((n, i) =>
        n.target === st.id ? (horizontal ? noteLabels[i]!.width : noteLabels[i]!.height) + NOTE_PADDING * 2 : 0,
      ),
    )
    return horizontal
      ? { id: st.id, width: Math.max(s.width, across), height: s.height + room * 2, cluster: st.parent }
      : { id: st.id, width: s.width + room * 2, height: Math.max(s.height, across), cluster: st.parent }
  })
  for (const i of compositeNotes) {
    const l = noteLabels[i]!
    nodes.push({
      id: `\u0000note${i}`,
      width: l.width + NOTE_PADDING * 2,
      height: l.height + NOTE_PADDING * 2,
      cluster: d.composites.get(d.notes[i]!.target)!.parent,
    })
  }

  const clusterLabels = new Map<string, MeasuredLabel>()
  const clusters: LayoutCluster[] = [...d.composites.values()].map((c) => {
    if (!c.region && c.name !== '') clusterLabels.set(c.id, measureLabel(parseLabel(c.name), titleFont, measure))
    const l = clusterLabels.get(c.id)
    return { id: c.id, parent: c.parent, direction: c.direction, label: l ? { width: l.width, height: l.height } : undefined }
  })

  const edgeLabels = new Map<number, MeasuredLabel>()
  const edges: LayoutEdge[] = d.transitions.map((t, i) => {
    let label: { width: number; height: number } | undefined
    if (t.label) {
      const m = measureLabel(parseLabel(t.label), BASE_FONT, measure)
      edgeLabels.set(i, m)
      label = { width: m.width + 8, height: m.height + 4 }
    }
    return { id: String(i), from: t.from, to: t.to, label }
  })
  for (const i of compositeNotes) {
    edges.push({ id: `note${i}`, from: `\u0000note${i}`, to: d.notes[i]!.target, weight: 0 })
  }

  const result = layout({ direction: d.direction, nodes, edges, clusters, nodeSep: 40, rankSep: 40, clusterPadding: 14 })

  // The state's own box inside its layout box (which includes note room).
  const stateBox = (st: StateNode): Box => {
    const b = result.nodes.get(st.id)!
    const s = sizeOf(st)
    return { x: b.x, y: b.y, width: s.width, height: s.height }
  }

  const depth = (cid: string): number => {
    let n = 0
    let p = d.composites.get(cid)?.parent
    while (p) {
      n++
      p = d.composites.get(p)?.parent
    }
    return n
  }
  const clusterEls: SvgElement[] = [...d.composites.values()]
    .sort((a, b) => depth(a.id) - depth(b.id))
    .map((c) => {
      const box = result.clusters.get(c.id)!
      const style = styleFor(c.classes, c.style, d.classDefs)
      const left = box.x - box.width / 2
      const top = box.y - box.height / 2
      if (c.region) {
        return el('rect', {
          class: 'dg-state-region',
          x: left,
          y: top,
          width: box.width,
          height: box.height,
          rx: 4,
        })
      }
      const l = clusterLabels.get(c.id)
      const band = l ? l.height + 10 : 0
      return el('g', { class: 'dg-cluster dg-state-composite', 'data-id': c.id }, [
        el('rect', { class: 'dg-cluster-box', x: left, y: top, width: box.width, height: box.height, rx: 8, style: cssText(style.shape) }),
        l ? el('line', { class: 'dg-state-divider', x1: left, y1: top + band, x2: left + box.width, y2: top + band }) : null,
        l ? renderLabel(l, box.x, top + band / 2, { className: 'dg-cluster-label', style: cssText(style.text) }) : null,
      ])
    })

  const ends = (ref: string): { box: Box; clip: (p: Point) => Point } => {
    const st = d.states.get(ref)
    if (st) {
      const box = stateBox(st)
      return { box, clip: (p) => intersectShape(shapeOf(st.kind), box, p) }
    }
    const box = result.clusters.get(ref) ?? result.nodes.get(ref)!
    return { box, clip: (p) => intersectRect(box, p) }
  }

  const edgeEls: SvgElement[] = []
  const labelEls: SvgElement[] = []
  d.transitions.forEach((t, i) => {
    const route = result.edges.get(String(i))
    if (!route) return
    let points: Point[]
    if (route.selfLoop) {
      points = route.points
    } else {
      const a = ends(t.from)
      const b = ends(t.to)
      points = [
        route.start ?? a.clip(route.points[0] ?? b.box),
        ...route.points,
        route.end ?? b.clip(route.points[route.points.length - 1] ?? a.box),
      ]
    }
    edgeEls.push(el('path', { class: 'dg-edge', d: basisPath(points), 'marker-end': `url(#${markerId(id, 'arrow')})` }))
    const m = edgeLabels.get(i)
    if (m && route.label) {
      const w = m.width + 8
      const h = m.height + 4
      labelEls.push(
        el('g', {}, [
          el('rect', { class: 'dg-edge-label-box', x: route.label.x - w / 2, y: route.label.y - h / 2, width: w, height: h, rx: 3 }),
          renderLabel(m, route.label.x, route.label.y, { className: 'dg-edge-label' }),
        ]),
      )
    }
  })

  const noteEls: SvgElement[] = []
  d.notes.forEach((n, i) => {
    const l = noteLabels[i]!
    const w = l.width + NOTE_PADDING * 2
    const h = l.height + NOTE_PADDING * 2
    let box: Box
    let anchor: Point
    const st = d.states.get(n.target)
    if (st) {
      const sb = stateBox(st)
      const sign = n.side === 'left' ? -1 : 1
      if (horizontal) {
        const dy = sb.height / 2 + NOTE_GAP + h / 2
        box = { x: sb.x, y: sb.y + sign * dy, width: w, height: h }
        anchor = { x: sb.x, y: sb.y + (sign * sb.height) / 2 }
      } else {
        const dx = sb.width / 2 + NOTE_GAP + w / 2
        box = { x: sb.x + sign * dx, y: sb.y, width: w, height: h }
        anchor = { x: sb.x + (sign * sb.width) / 2, y: sb.y }
      }
    } else {
      box = result.nodes.get(`\u0000note${i}`)!
      const cb = result.clusters.get(n.target)!
      anchor = intersectRect(cb, box)
    }
    const edge = intersectRect(box, anchor)
    noteEls.push(
      el('g', { class: 'dg-note' }, [
        el('line', { class: 'dg-note-link', x1: edge.x, y1: edge.y, x2: anchor.x, y2: anchor.y }),
        el('rect', { class: 'dg-note-box', x: box.x - w / 2, y: box.y - h / 2, width: w, height: h, rx: 2 }),
        renderLabel(l, box.x, box.y, { className: 'dg-note-text' }),
      ]),
    )
  })

  const nodeEls: SvgElement[] = [...d.states.values()].map((st) => {
    const box = stateBox(st)
    const style = styleFor(st.classes, st.style, d.classDefs)
    if (st.kind !== 'state') {
      return el('g', { class: `dg-node dg-state-${st.kind}`, 'data-id': st.kind === 'start' || st.kind === 'end' ? undefined : st.id }, [
        drawShape(shapeOf(st.kind), box, { style: cssText(style.shape) }),
      ])
    }
    const m = measured.get(st.id)!
    const children: SvgElement[] = [drawShape('round', box, { style: cssText(style.shape) })]
    if (!m.body) {
      children.push(renderLabel(m.title, box.x, box.y, { style: cssText(style.text) }))
    } else {
      const top = box.y - box.height / 2
      const titleY = top + PADDING_Y + m.title.height / 2
      const ruleY = top + PADDING_Y * 1.5 + m.title.height
      children.push(
        renderLabel(m.title, box.x, titleY, { style: cssText(style.text) }),
        el('line', { class: 'dg-state-divider', x1: box.x - box.width / 2, y1: ruleY, x2: box.x + box.width / 2, y2: ruleY }),
        renderLabel(m.body, box.x, ruleY + PADDING_Y / 2 + m.body.height / 2 + PADDING_Y / 2, { style: cssText(style.text) }),
      )
    }
    const classes = ['dg-node', 'dg-state', ...st.classes.map((c) => `dg-class-${c.replace(/[^\w-]/g, '')}`)].join(' ')
    return el('g', { class: classes, 'data-id': st.id }, children)
  })

  const css = [
    `#${id} .dg-state-start{fill:${v('--dg-state-start')};stroke:none}`,
    `#${id} .dg-state-end-ring{fill:none;stroke:${v('--dg-state-start')};stroke-width:1.5px}`,
    `#${id} .dg-state-divider{stroke:${v('--dg-node-stroke')};stroke-width:1px}`,
    `#${id} .dg-state-composite .dg-state-divider{stroke:${v('--dg-cluster-stroke')}}`,
    `#${id} .dg-state-region{fill:none;stroke:${v('--dg-cluster-stroke')};stroke-dasharray:5 4}`,
    `#${id} .dg-state-choice .dg-shape{fill:${v('--dg-node-fill')};stroke:${v('--dg-node-stroke')}}`,
    `#${id} .dg-note-box{fill:${v('--dg-note-fill')};stroke:${v('--dg-note-stroke')}}`,
    `#${id} .dg-note-text{fill:${v('--dg-note-text')}}`,
    `#${id} .dg-note-link{stroke:${v('--dg-note-stroke')};stroke-dasharray:3 3}`,
  ].join('')

  return documentSvg({
    id,
    type: 'state',
    width: result.width,
    height: result.height,
    title: title ?? d.accessibility.title ?? 'State diagram',
    description: d.accessibility.description,
    defs: markerDefs(id, ['arrow']),
    body: [
      el('g', { class: 'dg-clusters' }, clusterEls),
      el('g', { class: 'dg-edges' }, edgeEls),
      el('g', { class: 'dg-edge-labels' }, labelEls),
      el('g', { class: 'dg-notes' }, noteEls),
      el('g', { class: 'dg-nodes' }, nodeEls),
    ],
    css,
  })
}
