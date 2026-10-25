/**
 * Mind maps: the root in the middle, its branches split between the right
 * and the left so the two sides are about as tall as each other, each
 * branch a horizontal tidy tree in its own colour.
 *
 * Branches are read clockwise, as on paper: the first ones go down the right
 * side from the top, the rest come back up the left. The layout is a pure
 * function of the outline and the label sizes — no force simulation, no
 * randomness — so the same source always draws the same map.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { el, num, PathBuilder, type SvgElement } from '../../core/svg'
import { drawShape } from '../../core/shapes'
import { measureLabel, parseLabel, renderLabel, wrapLabel, type FontSpec, type MeasuredLabel, type TextMeasurer } from '../../core/text'
import { BASE_FONT, paletteVar, v } from '../../core/theme'
import type { MindmapDiagram, MindmapNode, MindmapShape } from './parser'

const ROOT_FONT: FontSpec = { ...BASE_FONT, size: 16, weight: 'bold' }
const BRANCH_FONT: FontSpec = { ...BASE_FONT, weight: 'bold' }
const LEAF_FONT: FontSpec = { ...BASE_FONT, size: 13 }
/* Mermaid wraps mind map labels at 200px. */
const WRAP = 200
/* Room for the measurer being a little off: labels are measured, then padded by this factor. */
const FIT = 1.06
const GAP_X_ROOT = 56
const GAP_X = 36
const GAP_Y_BRANCH = 22
const GAP_Y = 10

interface Laid {
  node: MindmapNode
  depth: number
  /** Index of the first-level branch this node belongs to; -1 for the root. */
  branch: number
  label: MeasuredLabel
  width: number
  height: number
  x: number
  y: number
  /** Height of the node with everything under it. */
  block: number
  children: Laid[]
}

function fontFor(depth: number): FontSpec {
  return depth === 0 ? ROOT_FONT : depth === 1 ? BRANCH_FONT : LEAF_FONT
}

/** The size a shape needs around a label of `w` × `h`. */
function shapeSize(shape: MindmapShape, w: number, h: number, depth: number): { width: number; height: number } {
  const px = depth === 0 ? 22 : 14
  const py = depth === 0 ? 13 : 8
  switch (shape) {
    case 'circle': {
      // The label's corners on the circle, plus padding.
      const d = Math.max(Math.hypot(w, h) + 16, depth === 0 ? 72 : 44)
      return { width: d, height: d }
    }
    case 'bang': {
      // An ellipse through the label's corners, then the spikes outside it.
      const a = (w / 2 + 8) * Math.SQRT2 * 1.3
      const b = (h / 2 + 6) * Math.SQRT2 * 1.3
      return { width: a * 2, height: b * 2 }
    }
    case 'cloud':
      return { width: w + px * 2 + 18, height: h + py * 2 + 16 }
    case 'hexagon': {
      const height = h + py * 2
      return { width: w + px * 2 + height / 2, height }
    }
    default:
      return { width: w + px * 2, height: h + py * 2 }
  }
}

function layoutTree(node: MindmapNode, depth: number, branch: number, measure: TextMeasurer): Laid {
  const font = fontFor(depth)
  const label = measureLabel(wrapLabel(parseLabel(node.label, { markdown: node.markdown }), WRAP, font, measure), font, measure)
  const size = shapeSize(node.shape, label.width * FIT, label.height, depth)
  const children = node.children.map((child, i) => layoutTree(child, depth + 1, depth === 0 ? i : branch, measure))
  const gap = depth === 0 ? GAP_Y_BRANCH : GAP_Y
  const span = children.reduce((sum, c) => sum + c.block, 0) + gap * Math.max(0, children.length - 1)
  return { node, depth, branch, label, ...size, x: 0, y: 0, block: Math.max(size.height, span), children }
}

/** Places a subtree with its near edge at `edge`, growing to the right (side 1) or the left (-1) from `top`. */
function place(n: Laid, side: 1 | -1, edge: number, top: number): void {
  n.x = edge + (side * n.width) / 2
  n.y = top + n.block / 2
  const gap = n.depth === 0 ? GAP_Y_BRANCH : GAP_Y
  const span = n.children.reduce((sum, c) => sum + c.block, 0) + gap * Math.max(0, n.children.length - 1)
  let childTop = top + (n.block - span) / 2
  const next = n.x + side * (n.width / 2 + GAP_X)
  for (const child of n.children) {
    place(child, side, next, childTop)
    childTop += child.block + gap
  }
}

/**
 * How many first branches go to the right: the split whose two sides are
 * closest in height, preferring the right side on a tie.
 */
function split(blocks: readonly number[]): number {
  if (blocks.length <= 1) return blocks.length
  const total = blocks.reduce((a, b) => a + b, 0)
  let best = 1
  let bestDiff = Infinity
  let acc = 0
  for (let k = 1; k <= blocks.length; k++) {
    acc += blocks[k - 1]!
    const diff = Math.abs(acc - (total - acc))
    if (diff < bestDiff - 1e-9) {
      best = k
      bestDiff = diff
    }
  }
  // Never put everything on one side while there are two branches or more.
  return Math.min(best, blocks.length - 1)
}

function cloudPath(x: number, y: number, w: number, h: number): string {
  // Bumps along the outline of a rectangle inset by their height.
  const bump = 7
  const left = x - w / 2 + bump
  const top = y - h / 2 + bump
  const iw = w - bump * 2
  const ih = h - bump * 2
  const corners = [
    { x: left, y: top },
    { x: left + iw, y: top },
    { x: left + iw, y: top + ih },
    { x: left, y: top + ih },
  ]
  const path = new PathBuilder().moveTo(left, top)
  corners.forEach((from, i) => {
    const to = corners[(i + 1) % 4]!
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    const count = Math.max(1, Math.round(length / 26))
    const chord = length / count
    for (let k = 1; k <= count; k++) {
      const px = from.x + ((to.x - from.x) * k) / count
      const py = from.y + ((to.y - from.y) * k) / count
      path.arcTo(chord * 0.6, chord * 0.6, 0, false, true, px, py)
    }
  })
  return path.close().toString()
}

function bangPath(x: number, y: number, w: number, h: number): string {
  // A star around an ellipse: points on the outer ellipse, notches on an inner one.
  const ax = w / 2
  const ay = h / 2
  const perimeter = Math.PI * (ax + ay)
  const spikes = Math.max(10, Math.min(28, Math.round(perimeter / 30)))
  const path = new PathBuilder()
  for (let i = 0; i < spikes * 2; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / spikes
    const r = i % 2 === 0 ? 1 : 0.8
    const px = x + Math.cos(angle) * ax * r
    const py = y + Math.sin(angle) * ay * r
    if (i === 0) path.moveTo(px, py)
    else path.lineTo(px, py)
  }
  return path.close().toString()
}

function defaultPath(x: number, y: number, w: number, h: number): string {
  // Rounded top, square bottom: the bottom edge is drawn as a bar in the branch colour.
  const r = 6
  const l = x - w / 2
  const t = y - h / 2
  return new PathBuilder()
    .moveTo(l, t + h)
    .lineTo(l, t + r)
    .quadTo(l, t, l + r, t)
    .lineTo(l + w - r, t)
    .quadTo(l + w, t, l + w, t + r)
    .lineTo(l + w, t + h)
    .close()
    .toString()
}

function drawNode(n: Laid, colour: string | undefined): SvgElement[] {
  const style = colour ? `fill:${colour};stroke:${colour}` : undefined
  const box = { x: n.x, y: n.y, width: n.width, height: n.height }
  const cls = 'dg-mm-shape'
  // The root has no shape of its own in Mermaid's default; it gets the rounded box.
  const shape = n.depth === 0 && n.node.shape === 'default' ? 'rounded' : n.node.shape
  switch (shape) {
    case 'square':
      return [drawShape('rect', box, { className: cls, style })]
    case 'rounded':
      return [el('rect', { class: cls, style, x: n.x - n.width / 2, y: n.y - n.height / 2, width: n.width, height: n.height, rx: 10, ry: 10 })]
    case 'circle':
      return [drawShape('circle', box, { className: cls, style })]
    case 'hexagon':
      return [drawShape('hexagon', box, { className: cls, style })]
    case 'cloud':
      return [el('path', { class: cls, style, d: cloudPath(n.x, n.y, n.width, n.height) })]
    case 'bang':
      return [el('path', { class: cls, style, d: bangPath(n.x, n.y, n.width, n.height) })]
    default:
      return [
        el('path', { class: `${cls} dg-mm-default`, style: colour ? `fill:${colour}` : undefined, d: defaultPath(n.x, n.y, n.width, n.height) }),
        el('line', {
          class: 'dg-mm-bar',
          x1: n.x - n.width / 2,
          y1: n.y + n.height / 2,
          x2: n.x + n.width / 2,
          y2: n.y + n.height / 2,
          style: colour ? `stroke:${colour}` : undefined,
        }),
      ]
  }
}

export function renderMindmap(diagram: MindmapDiagram, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const root = layoutTree(diagram.root, 0, -1, measure)

  // Split the branches between the sides; the left side is stacked bottom-up.
  const k = split(root.children.map((c) => c.block))
  const right = root.children.slice(0, k)
  const left = root.children.slice(k).reverse()
  const sideHeight = (list: Laid[]) => list.reduce((sum, c) => sum + c.block, 0) + GAP_Y_BRANCH * Math.max(0, list.length - 1)
  root.x = 0
  root.y = 0
  let top = -sideHeight(right) / 2
  for (const child of right) {
    place(child, 1, root.width / 2 + GAP_X_ROOT, top)
    top += child.block + GAP_Y_BRANCH
  }
  top = -sideHeight(left) / 2
  for (const child of left) {
    place(child, -1, -root.width / 2 - GAP_X_ROOT, top)
    top += child.block + GAP_Y_BRANCH
  }

  const all: Laid[] = []
  const walk = (n: Laid) => {
    all.push(n)
    n.children.forEach(walk)
  }
  walk(root)
  const minX = Math.min(...all.map((n) => n.x - n.width / 2))
  const maxX = Math.max(...all.map((n) => n.x + n.width / 2))
  const minY = Math.min(...all.map((n) => n.y - n.height / 2))
  const maxY = Math.max(...all.map((n) => n.y + n.height / 2))

  const edges: SvgElement[] = []
  const nodes: SvgElement[] = []
  for (const n of all) {
    const colour = n.depth === 0 ? undefined : paletteVar(n.branch)
    for (const child of n.children) {
      const side = child.x >= n.x ? 1 : -1
      const x0 = n.x + (side * n.width) / 2
      const x1 = child.x - (side * child.width) / 2
      const dx = (x1 - x0) / 2
      const path = new PathBuilder().moveTo(x0, n.y).curveTo(x0 + dx, n.y, x1 - dx, child.y, x1, child.y)
      edges.push(
        el('path', {
          class: `dg-mm-edge dg-mm-edge-${Math.min(child.depth, 3)}`,
          d: path.toString(),
          style: `stroke:${paletteVar(child.branch)}`,
        }),
      )
    }
    const classes = ['dg-node', 'dg-mm-node', n.depth === 0 ? 'dg-mm-root' : `dg-mm-depth-${Math.min(n.depth, 2)}`]
    nodes.push(
      // Only ids that look like ids: a default node's id is its whole text.
      el('g', { class: classes.join(' '), 'data-id': /^[\w.:-]+$/.test(n.node.id) ? n.node.id : undefined }, [
        ...drawNode(n, colour),
        renderLabel(n.label, n.x, n.y, { className: n.depth === 0 ? 'dg-mm-root-text' : 'dg-mm-text' }),
      ]),
    )
  }

  const r = `#${id}`
  const css = [
    `${r} .dg-mm-edge{fill:none;stroke-linecap:round}`,
    `${r} .dg-mm-edge-1{stroke-width:3px}`,
    `${r} .dg-mm-edge-2{stroke-width:2px}`,
    `${r} .dg-mm-edge-3{stroke-width:1.5px}`,
    `${r} .dg-mm-shape{stroke-width:1.5px}`,
    `${r} .dg-mm-root .dg-mm-shape{fill:${v('--dg-node-fill')};stroke:${v('--dg-node-stroke')};stroke-width:2px}`,
    `${r} .dg-mm-depth-1 .dg-mm-shape{fill-opacity:0.24;stroke-width:2px}`,
    `${r} .dg-mm-depth-2 .dg-mm-shape{fill-opacity:0.1}`,
    `${r} .dg-mm-bar{stroke-width:3px;stroke-linecap:round}`,
    `${r} .dg-mm-depth-2 .dg-mm-bar{stroke-width:2px}`,
    `${r} .dg-mm-text{fill:${v('--dg-text')}}`,
    `${r} .dg-mm-depth-2 .dg-mm-text{font-size:13px}`,
    `${r} .dg-mm-root-text{fill:${v('--dg-node-text')};font-size:16px;font-weight:bold}`,
    `${r} .dg-mm-depth-1 .dg-mm-text{font-weight:bold}`,
  ].join('')

  return documentSvg({
    id,
    type: 'mindmap',
    width: maxX - minX,
    height: maxY - minY,
    title: title ?? diagram.accessibility.title ?? 'Mind map',
    description: diagram.accessibility.description,
    body: [el('g', { transform: `translate(${num(-minX)},${num(-minY)})` }, [el('g', { class: 'dg-mm-edges' }, edges), ...nodes])],
    css,
  })
}
