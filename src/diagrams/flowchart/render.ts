/**
 * Drawing a parsed flowchart: measure, lay out, then paint clusters, edges,
 * edge labels and nodes in that order (nodes on top, as a reader expects).
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { DiagramError } from '../../core/errors'
import { basisPath, type Box, type Point } from '../../core/geometry'
import { markerDefs, markerId, type MarkerKind } from '../../core/markers'
import { drawShape, intersectShape, labelBelow, labelCentre, shapeSize } from '../../core/shapes'
import { cssText, mergeStyles, type UserStyle } from '../../core/style'
import { el, type SvgElement } from '../../core/svg'
import {
  isEmptyLabel,
  measureLabel,
  parseLabel,
  renderLabel,
  wrapLabel,
  type MeasuredLabel,
  type TextMeasurer,
} from '../../core/text'
import { BASE_FONT, v } from '../../core/theme'
import { layout, type LayoutEdge } from '../../layout/layered'
import type { EdgeEnd, FlowEdge, Flowchart } from './parser'

/** Shapes with strokes that must not be filled (limbs, ticks). */
const FIGURE_SHAPES = new Set(['actor', 'boundary', 'control', 'entity', 'node', 'frame', 'artifact', 'note', 'file', 'queue', 'stack'])

/** Markdown strings wrap at this width, as in Mermaid. */
const MARKDOWN_WRAP = 200

function label(text: string, markdown: boolean, measure: TextMeasurer, font = BASE_FONT): MeasuredLabel {
  let l = parseLabel(text, { markdown })
  if (markdown) l = wrapLabel(l, MARKDOWN_WRAP, font, measure)
  return measureLabel(l, font, measure)
}

function marker(end: EdgeEnd): MarkerKind | null {
  return end === 'none' ? null : end
}

function styleFor(classes: readonly string[], own: UserStyle | undefined, defs: Map<string, UserStyle>): UserStyle {
  return mergeStyles(defs.get('default'), ...classes.map((c) => defs.get(c)), own)
}

export function renderFlowchart(chart: Flowchart, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const nodeLabels = new Map<string, MeasuredLabel>()
  const nodeSizes = new Map<string, { width: number; height: number }>()
  for (const node of chart.nodes.values()) {
    const measured = label(node.text, node.markdown, measure)
    nodeLabels.set(node.id, measured)
    nodeSizes.set(node.id, shapeSize(node.shape, measured.width, Math.max(measured.height, BASE_FONT.size * 1.25)))
  }

  const titleFont = { ...BASE_FONT, weight: 'bold' as const }
  const clusterLabels = new Map<string, MeasuredLabel>()
  for (const sub of chart.subgraphs.values()) {
    if (sub.title.trim() !== '') clusterLabels.set(sub.id, label(sub.title, sub.markdown, measure, titleFont))
  }

  const edgeLabels = new Map<number, MeasuredLabel>()
  const layoutEdges: LayoutEdge[] = chart.edges.map((e, i) => {
    let lbl: { width: number; height: number } | undefined
    if (e.text !== undefined && e.text !== '') {
      const measured = label(e.text, e.markdown, measure)
      if (!isEmptyLabel(measured.label)) {
        edgeLabels.set(i, measured)
        lbl = { width: measured.width + 8, height: measured.height + 4 }
      }
    }
    return { id: String(i), from: e.from, to: e.to, minlen: e.length, label: lbl }
  })

  const result = layout({
    direction: chart.direction,
    nodes: [...chart.nodes.values()].map((n) => ({ id: n.id, ...nodeSizes.get(n.id)!, cluster: n.subgraph })),
    edges: layoutEdges,
    clusters: [...chart.subgraphs.values()].map((s) => {
      const l = clusterLabels.get(s.id)
      return { id: s.id, parent: s.parent, direction: s.direction, label: l ? { width: l.width, height: l.height } : undefined }
    }),
    nodeSep: 50,
    rankSep: 50,
    clusterPadding: 14,
  })

  // Clusters, outermost first so inner frames paint over outer ones.
  const depth = (sid: string): number => {
    let d = 0
    let p = chart.subgraphs.get(sid)?.parent
    while (p) {
      d++
      p = chart.subgraphs.get(p)?.parent
    }
    return d
  }
  const clusterEls: SvgElement[] = [...chart.subgraphs.values()]
    .sort((a, b) => depth(a.id) - depth(b.id))
    .map((sub) => {
      const box = result.clusters.get(sub.id)!
      const style = styleFor(sub.classes, sub.style, chart.classDefs)
      const l = clusterLabels.get(sub.id)
      // A shaped frame (package, node, cloud…) leaves room for its tab or top above the title.
      const titleTop = sub.kind === 'folder' ? 14 : sub.kind === 'node' ? 14 : sub.kind === 'cloud' ? 12 : sub.kind === 'frame' ? 2 : 6
      return el('g', { class: 'dg-cluster', 'data-id': sub.id }, [
        sub.kind && sub.kind !== 'rect'
          ? drawShape(sub.kind, box, { className: 'dg-cluster-box', style: cssText(style.shape) })
          : el('rect', {
              class: 'dg-cluster-box',
              x: box.x - box.width / 2,
              y: box.y - box.height / 2,
              width: box.width,
              height: box.height,
              rx: 4,
              style: cssText(style.shape),
            }),
        l
          ? renderLabel(l, sub.kind === 'frame' ? box.x - box.width / 2 + 40 + l.width / 2 : box.x, box.y - box.height / 2 + titleTop + l.height / 2, {
              className: 'dg-cluster-label',
              style: cssText(style.text),
            })
          : null,
      ])
    })

  // Where an edge meets a node or a cluster frame.
  const endBox = (ref: string): { box: Box; clip: (toward: Point) => Point } => {
    const node = chart.nodes.get(ref)
    if (node) {
      const box = result.nodes.get(ref)!
      return { box, clip: (p) => intersectShape(node.shape, box, p) }
    }
    const box = result.clusters.get(ref)!
    return { box, clip: (p) => intersectShape('rect', box, p) }
  }

  const usedMarkers: MarkerKind[] = []
  const edgeEls: SvgElement[] = []
  const labelEls: SvgElement[] = []
  chart.edges.forEach((e: FlowEdge, i) => {
    const route = result.edges.get(String(i))
    if (!route) return
    if (e.stroke === 'invisible') return
    let points: Point[]
    if (route.selfLoop) {
      points = route.points
    } else {
      const from = endBox(e.from)
      const to = endBox(e.to)
      const first = route.points[0] ?? to.box
      const last = route.points[route.points.length - 1] ?? from.box
      points = [route.start ?? from.clip(first), ...route.points, route.end ?? to.clip(last)]
    }
    const style = e.style ?? { shape: {}, text: {} }
    const startMarker = marker(e.start)
    const endMarker = marker(e.end)
    if (startMarker) usedMarkers.push(startMarker)
    if (endMarker) usedMarkers.push(endMarker)
    const classes = ['dg-edge', e.stroke === 'thick' ? 'dg-edge-thick' : '', e.stroke === 'dotted' ? 'dg-edge-dotted' : '']
      .filter(Boolean)
      .join(' ')
    edgeEls.push(
      el('path', {
        class: classes,
        d: basisPath(points),
        'marker-start': startMarker ? `url(#${markerId(id, startMarker, true)})` : undefined,
        'marker-end': endMarker ? `url(#${markerId(id, endMarker)})` : undefined,
        style: cssText(style.shape),
        'data-from': e.from,
        'data-to': e.to,
      }),
    )
    const measured = edgeLabels.get(i)
    if (measured && route.label) {
      const w = measured.width + 8
      const h = measured.height + 4
      labelEls.push(
        el('g', { class: 'dg-edge-label-group' }, [
          el('rect', {
            class: 'dg-edge-label-box',
            x: route.label.x - w / 2,
            y: route.label.y - h / 2,
            width: w,
            height: h,
            rx: 3,
          }),
          renderLabel(measured, route.label.x, route.label.y, { className: 'dg-edge-label', style: cssText(style.text) }),
        ]),
      )
    }
  })

  const nodeEls: SvgElement[] = [...chart.nodes.values()].map((node) => {
    const box = result.nodes.get(node.id)
    if (!box) throw new DiagramError(`Node "${node.id}" was not laid out`)
    const style = styleFor(node.classes, node.style, chart.classDefs)
    const classes = ['dg-node', ...node.classes.map((c) => `dg-class-${c.replace(/[^\w-]/g, '')}`)].join(' ')
    const measuredLabel = nodeLabels.get(node.id)!
    const at = labelCentre(node.shape, box, measuredLabel.height)
    const kindClass = node.shape === 'note' ? ' dg-node-note' : labelBelow(node.shape) ? ' dg-node-figure' : ''
    const group = el('g', { class: classes + kindClass, 'data-id': node.id }, [
      node.tooltip || node.link?.tooltip ? el('title', {}, [{ text: node.link?.tooltip ?? node.tooltip ?? '' }]) : null,
      drawShape(node.shape, box, { style: cssText(style.shape) }),
      renderLabel(measuredLabel, at.x, at.y, { style: cssText(style.text) }),
    ])
    if (node.link) {
      return el(
        'a',
        {
          href: node.link.href,
          target: node.link.target,
          rel: node.link.target === '_blank' ? 'noopener noreferrer' : undefined,
        },
        [group],
      )
    }
    return group
  })

  const shapes = new Set([...chart.nodes.values()].map((n) => n.shape))
  const css = [
    `#${id} .dg-edge-label-group text{fill:${v('--dg-text')}}`,
    // Only when used: diagrams without them render byte for byte as before.
    shapes.has('note') ? `#${id} .dg-node-note .dg-shape{fill:${v('--dg-note-fill')};stroke:${v('--dg-note-stroke')}}#${id} .dg-node-note .dg-label{fill:${v('--dg-note-text')}}` : '',
    [...shapes].some((k) => FIGURE_SHAPES.has(k)) ? `#${id} .dg-shape-line{fill:none}` : '',
  ].join('')

  return documentSvg({
    id,
    type: 'flowchart',
    width: result.width,
    height: result.height,
    title: title ?? chart.accessibility.title ?? 'Flowchart',
    description: chart.accessibility.description,
    defs: markerDefs(id, usedMarkers),
    body: [
      el('g', { class: 'dg-clusters' }, clusterEls),
      el('g', { class: 'dg-edges' }, edgeEls),
      el('g', { class: 'dg-edge-labels' }, labelEls),
      el('g', { class: 'dg-nodes' }, nodeEls),
    ],
    css,
  })
}
