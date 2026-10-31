/**
 * Drawing a class diagram with the layered layout. A class is a UML box:
 * annotations and name in the header, then attributes, then methods.
 * Namespaces are clusters; notes are boxes tied to their class by a dashed
 * line. A relationship is laid out from its "whole" end — the base class,
 * the container — so hierarchies read top-down as UML expects.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { basisPath, intersectRect, type Box, type Point } from '../../core/geometry'
import { markerDefs, markerId, type MarkerKind } from '../../core/markers'
import { PADDING_X, PADDING_Y } from '../../core/shapes'
import { cssText, mergeStyles, type UserStyle } from '../../core/style'
import { el, type SvgElement } from '../../core/svg'
import {
  decodeEntities,
  measureLabel,
  parseLabel,
  plainLabel,
  renderLabel,
  type FontSpec,
  type MeasuredLabel,
  type TextMeasurer,
} from '../../core/text'
import { BASE_FONT, v } from '../../core/theme'
import type { LayoutCluster, LayoutEdge, LayoutNode } from '../../layout/layered'
import { edgeLabel, layoutBoxes, roundedRect, splitFill, type Attachment, type BoxEdge } from '../boxes'
import type { ClassDiagram, ClassMember, ClassNode, ClassRelation, RelationEnd } from './parser'

const MEMBER_FONT: FontSpec = { ...BASE_FONT, size: 13 }
const ANNOTATION_FONT: FontSpec = { ...BASE_FONT, size: 12 }
const NAME_FONT: FontSpec = { ...BASE_FONT, weight: 'bold' }
const CARD_FONT: FontSpec = { ...BASE_FONT, size: 12 }
/** Space above and below the members of a compartment. */
const SECTION_PADDING = 6
/** Height of a compartment with no members. */
const EMPTY_SECTION = 10
const RADIUS = 5
const MIN_WIDTH = 100
const NOTE_PADDING = 8

const MARKERS: Record<RelationEnd, MarkerKind | null> = {
  none: null,
  inheritance: 'triangle',
  composition: 'diamond',
  aggregation: 'diamond-open',
  arrow: 'open-arrow',
}

interface MeasuredMember {
  member: ClassMember
  label: MeasuredLabel
}

interface ClassBox {
  annotations: MeasuredLabel[]
  name: MeasuredLabel
  attributes: MeasuredMember[]
  methods: MeasuredMember[]
  headerHeight: number
  attributesHeight: number
  methodsHeight: number
  width: number
  height: number
}

function memberFont(m: ClassMember): FontSpec {
  return m.classifier === 'abstract' ? { ...MEMBER_FONT, style: 'italic' } : MEMBER_FONT
}

function measureClass(node: ClassNode, measure: TextMeasurer): ClassBox {
  const annotations = node.annotations.map((a) => measureLabel(plainLabel(`«${decodeEntities(a)}»`), ANNOTATION_FONT, measure))
  const name = measureLabel(parseLabel(node.label), NAME_FONT, measure)
  const member = (m: ClassMember): MeasuredMember => ({
    member: m,
    label: measureLabel(plainLabel(decodeEntities(m.text)), memberFont(m), measure),
  })
  const attributes = node.attributes.map(member)
  const methods = node.methods.map(member)
  const headerHeight = annotations.reduce((h, a) => h + a.height, 0) + name.height + PADDING_Y * 2
  const lineHeight = MEMBER_FONT.size * 1.25
  const section = (list: MeasuredMember[]) => (list.length === 0 ? EMPTY_SECTION : list.length * lineHeight + SECTION_PADDING * 2)
  // A class with no members at all is just its header, as Mermaid draws it.
  const bare = attributes.length === 0 && methods.length === 0
  const attributesHeight = bare ? 0 : section(attributes)
  const methodsHeight = bare ? 0 : section(methods)
  const widest = Math.max(
    name.width,
    ...annotations.map((a) => a.width),
    ...attributes.map((a) => a.label.width),
    ...methods.map((a) => a.label.width),
  )
  return {
    annotations,
    name,
    attributes,
    methods,
    headerHeight,
    attributesHeight,
    methodsHeight,
    width: Math.max(widest + PADDING_X * 2, MIN_WIDTH),
    height: headerHeight + attributesHeight + methodsHeight,
  }
}

function styleFor(node: ClassNode, defs: Map<string, UserStyle>): UserStyle {
  return mergeStyles(defs.get('default'), ...node.classes.map((c) => defs.get(c)), node.style)
}

function drawClass(node: ClassNode, m: ClassBox, box: Box, style: UserStyle): SvgElement {
  const left = box.x - box.width / 2
  const top = box.y - box.height / 2
  const shapeStyle = cssText(style.shape)
  const split = splitFill(style.shape)
  const textStyle = cssText(style.text)
  const bare = m.attributesHeight === 0 && m.methodsHeight === 0
  const inset = 0.75
  const children: SvgElement[] = [
    el('rect', { class: bare ? 'dg-shape' : 'dg-shape dg-uml-box', x: left, y: top, width: box.width, height: box.height, rx: RADIUS, style: bare ? shapeStyle : split.frame }),
  ]
  if (!bare) {
    children.push(
      el('path', {
        class: 'dg-uml-header',
        d: roundedRect(left + inset, top + inset, box.width - inset * 2, m.headerHeight - inset, RADIUS - inset, 0),
        style: split.band,
      }),
    )
  }
  // Header: annotations, then the name, centred as a block.
  let y = top + PADDING_Y
  for (const a of m.annotations) {
    children.push(renderLabel(a, box.x, y + a.height / 2, { className: 'dg-label dg-uml-annotation', style: textStyle }))
    y += a.height
  }
  children.push(renderLabel(m.name, box.x, y + m.name.height / 2, { className: 'dg-label dg-uml-name', style: textStyle }))

  const rule = style.shape.stroke ? `stroke:${style.shape.stroke}` : undefined
  const section = (list: MeasuredMember[], sectionTop: number) => {
    children.push(el('line', { class: 'dg-uml-rule', x1: left, y1: sectionTop, x2: left + box.width, y2: sectionTop, style: rule }))
    let my = sectionTop + SECTION_PADDING
    for (const { member, label } of list) {
      const decoration = [
        member.classifier === 'static' ? 'text-decoration:underline' : '',
        member.classifier === 'abstract' ? 'font-style:italic' : '',
      ]
        .filter(Boolean)
        .join(';')
      children.push(
        renderLabel(label, left + PADDING_X / 1.6, my + label.height / 2, {
          anchor: 'start',
          className: `dg-uml-member dg-uml-${member.kind}`,
          style: decoration || undefined,
        }),
      )
      my += label.height
    }
  }
  if (!bare) {
    section(m.attributes, top + m.headerHeight)
    section(m.methods, top + m.headerHeight + m.attributesHeight)
  }
  const classes = ['dg-node', 'dg-uml-class', ...node.classes.map((c) => `dg-class-${c.replace(/[^\w-]/g, '')}`)].join(' ')
  const group = el('g', { class: classes, 'data-id': node.id }, [
    node.link?.tooltip ? el('title', {}, [{ text: node.link.tooltip }]) : null,
    ...children,
  ])
  if (!node.link) return group
  return el(
    'a',
    { href: node.link.href, target: node.link.target, rel: node.link.target === '_blank' ? 'noopener noreferrer' : undefined },
    [group],
  )
}

/** The relationship turned so that its "whole" end comes first. */
function oriented(r: ClassRelation): ClassRelation {
  const whole = (e: RelationEnd) => e === 'inheritance' || e === 'composition' || e === 'aggregation'
  if (whole(r.toEnd) && !whole(r.fromEnd)) {
    return {
      from: r.to,
      to: r.from,
      fromEnd: r.toEnd,
      toEnd: r.fromEnd,
      dashed: r.dashed,
      fromCardinality: r.toCardinality,
      toCardinality: r.fromCardinality,
      label: r.label,
    }
  }
  return r
}

/**
 * A cardinality beside the line, just clear of the end symbol: by default
 * right of a vertical line and above a horizontal one; `side` picks the
 * other side (-1 left / above, 1 right / below).
 */
function cardinality(label: MeasuredLabel, at: Attachment, side?: -1 | 1): SvgElement {
  const { point: p, normal: n } = at
  if (n.x === 0) {
    const s = side ?? 1
    return renderLabel(label, p.x + s * 12, p.y + n.y * (label.height / 2 + 4), {
      anchor: s > 0 ? 'start' : 'end',
      className: 'dg-uml-cardinality',
    })
  }
  const s = side ?? -1
  return renderLabel(label, p.x + n.x * (label.width / 2 + 6), p.y + s * (label.height / 2 + 7), { className: 'dg-uml-cardinality' })
}

export function renderClass(d: ClassDiagram, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const boxes = new Map<string, ClassBox>()
  for (const node of d.classes.values()) boxes.set(node.id, measureClass(node, measure))

  const relations = d.relations.map(oriented)
  const edgeLabels = new Map<number, MeasuredLabel>()
  const edges: BoxEdge[] = relations.map((r, i) => {
    let label: { width: number; height: number } | undefined
    if (r.label) {
      const m = measureLabel(parseLabel(r.label), BASE_FONT, measure)
      edgeLabels.set(i, m)
      label = { width: m.width + 8, height: m.height + 4 }
    }
    return { from: r.from, to: r.to, label }
  })

  const nodes: LayoutNode[] = [...d.classes.values()].map((c) => ({
    id: c.id,
    width: boxes.get(c.id)!.width,
    height: boxes.get(c.id)!.height,
    cluster: c.namespace,
  }))
  // A note is a box of its own, tied to its class by a weightless edge.
  const noteLabels = d.notes.map((n) => measureLabel(plainLabel(decodeEntities(n.text)), BASE_FONT, measure))
  const noteEdges: LayoutEdge[] = []
  d.notes.forEach((n, i) => {
    const l = noteLabels[i]!
    nodes.push({
      id: `\u0000note${i}`,
      width: l.width + NOTE_PADDING * 2,
      height: l.height + NOTE_PADDING * 2,
      cluster: n.target ? d.classes.get(n.target)!.namespace : undefined,
    })
    if (n.target) noteEdges.push({ id: `note${i}`, from: `\u0000note${i}`, to: n.target, weight: 0 })
  })

  const titleFont = { ...BASE_FONT, weight: 'bold' as const }
  const clusterLabels = new Map<string, MeasuredLabel>()
  const clusters: LayoutCluster[] = [...d.namespaces.values()].map((ns) => {
    const l = measureLabel(plainLabel(ns.id), titleFont, measure)
    clusterLabels.set(ns.id, l)
    return { id: ns.id, label: { width: l.width, height: l.height } }
  })

  const { result, routes } = layoutBoxes({
    direction: d.direction,
    nodes,
    edges,
    extra: noteEdges,
    clusters,
    nodeSep: 50,
    rankSep: 70,
    clusterPadding: 16,
  })

  const clusterEls: SvgElement[] = [...d.namespaces.values()].map((ns) => {
    const box = result.clusters.get(ns.id)!
    return el('g', { class: 'dg-cluster dg-namespace', 'data-id': ns.id }, [
      el('rect', { class: 'dg-cluster-box', x: box.x - box.width / 2, y: box.y - box.height / 2, width: box.width, height: box.height, rx: 6 }),
    ])
  })
  // Above the edges, with a halo of the frame's fill (see the flowchart).
  const titleEls: SvgElement[] = [...d.namespaces.values()].map((ns) => {
    const box = result.clusters.get(ns.id)!
    const l = clusterLabels.get(ns.id)!
    return el('g', { class: 'dg-cluster-title', 'data-id': ns.id }, [
      renderLabel(l, box.x, box.y - box.height / 2 + 6 + l.height / 2, { className: 'dg-cluster-label' }),
    ])
  })

  const used: MarkerKind[] = []
  const edgeEls: SvgElement[] = []
  const labelEls: SvgElement[] = []
  relations.forEach((r, i) => {
    const route = routes[i]
    if (!route) return
    const start = MARKERS[r.fromEnd]
    const end = MARKERS[r.toEnd]
    if (start) used.push(start)
    if (end) used.push(end)
    edgeEls.push(
      el('path', {
        class: r.dashed ? 'dg-edge dg-edge-dashed' : 'dg-edge',
        d: basisPath(route.points),
        'marker-start': start ? `url(#${markerId(id, start, true)})` : undefined,
        'marker-end': end ? `url(#${markerId(id, end)})` : undefined,
        'data-from': r.from,
        'data-to': r.to,
      }),
    )
    const m = edgeLabels.get(i)
    if (m && route.label) labelEls.push(edgeLabel(m, route.label))
    // On a self loop the two legs run side by side: each cardinality goes on its outer side.
    const loop = r.from === r.to
    const card = (text: string, at: Attachment, side?: -1 | 1) =>
      labelEls.push(cardinality(measureLabel(plainLabel(decodeEntities(text)), CARD_FONT, measure), at, side))
    if (r.fromCardinality) card(r.fromCardinality, route.start, loop ? -1 : undefined)
    if (r.toCardinality) card(r.toCardinality, route.end, loop ? 1 : undefined)
  })

  const noteEls: SvgElement[] = d.notes.map((n, i) => {
    const box = result.nodes.get(`\u0000note${i}`)!
    const l = noteLabels[i]!
    let link: SvgElement | null = null
    if (n.target) {
      const target = result.nodes.get(n.target)!
      const route = result.edges.get(`note${i}`)
      const toward = (route?.points[route.points.length - 1] ?? box) as Point
      const a = intersectRect(box, route?.points[0] ?? target)
      const b = intersectRect(target, toward)
      link = el('path', { class: 'dg-note-link', d: basisPath([a, ...(route?.points ?? []), b]) })
    }
    return el('g', { class: 'dg-note' }, [
      link,
      el('rect', { class: 'dg-note-box', x: box.x - box.width / 2, y: box.y - box.height / 2, width: box.width, height: box.height, rx: 2 }),
      renderLabel(l, box.x, box.y, { className: 'dg-note-text' }),
    ])
  })

  const nodeEls = [...d.classes.values()].map((c) => drawClass(c, boxes.get(c.id)!, result.nodes.get(c.id)!, styleFor(c, d.classDefs)))

  const r = `#${id}`
  const css = [
    `${r} .dg-uml-class .dg-uml-box{fill:${v('--dg-row-fill')}}`,
    `${r} .dg-uml-name{font-weight:bold}`,
    `${r} .dg-uml-header{fill:${v('--dg-node-fill')};stroke:none}`,
    `${r} .dg-uml-rule{stroke:${v('--dg-node-stroke')};stroke-width:1px}`,
    `${r} .dg-uml-annotation{font-size:${ANNOTATION_FONT.size}px}`,
    `${r} .dg-uml-member{font-size:${MEMBER_FONT.size}px}`,
    `${r} .dg-uml-cardinality{fill:${v('--dg-text-muted')};font-size:${CARD_FONT.size}px}`,
    `${r} .dg-edge-dashed{stroke-dasharray:6 4}`,
    `${r} .dg-note-box{fill:${v('--dg-note-fill')};stroke:${v('--dg-note-stroke')}}`,
    `${r} .dg-note-text{fill:${v('--dg-note-text')}}`,
    `${r} .dg-note-link{fill:none;stroke:${v('--dg-note-stroke')};stroke-dasharray:3 3}`,
  ].join('')

  return documentSvg({
    id,
    type: 'class',
    width: result.width,
    height: result.height,
    title: title ?? d.accessibility.title ?? 'Class diagram',
    description: d.accessibility.description,
    defs: markerDefs(id, used),
    body: [
      el('g', { class: 'dg-clusters' }, clusterEls),
      el('g', { class: 'dg-edges' }, edgeEls),
      el('g', { class: 'dg-cluster-titles' }, titleEls),
      el('g', { class: 'dg-notes' }, noteEls),
      el('g', { class: 'dg-edge-labels' }, labelEls),
      el('g', { class: 'dg-nodes' }, nodeEls),
    ],
    css,
  })
}
