/**
 * Drawing a C4 diagram: the classic C4 look — persons, rounded boxes for
 * systems, containers and components, cylinders for stores and pipes for
 * queues, a grey palette for external elements, dashed boundaries, solid
 * deployment nodes, and dashed relations labelled with their technology.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { dedupe, linearPath, type Box, type Point } from '../../core/geometry'
import { markerDefs, markerId } from '../../core/markers'
import { el, num, PathBuilder, type SvgElement } from '../../core/svg'
import {
  isEmptyLabel,
  measureLabel,
  parseLabel,
  renderLabel,
  wrapLabel,
  type FontSpec,
  type MeasuredLabel,
  type TextMeasurer,
} from '../../core/text'
import { BASE_FONT, v } from '../../core/theme'
import { layoutC4, PERSON_HEAD, PERSON_HEAD_R, type Size } from './layout'
import type { C4Boundary, C4Diagram, C4Element, C4Relation, ElementStyle } from './parser'

const NAME_FONT: FontSpec = { ...BASE_FONT, size: 14, weight: 'bold' }
const SMALL_FONT: FontSpec = { ...BASE_FONT, size: 12 }
const REL_FONT: FontSpec = { ...BASE_FONT, size: 13 }
const REL_SMALL_FONT: FontSpec = { ...BASE_FONT, size: 11 }
const TITLE_FONT: FontSpec = { ...BASE_FONT, size: 18, weight: 'bold' }

/** Elements are at least this wide, as in C4-PlantUML and Mermaid: rows look even. */
const ELEMENT_WIDTH = 216
const PAD_X = 14
const PAD_Y = 14
const MIN_HEIGHT = 70
/** Height of a cylinder's cap, width of a queue's end. */
const CAP = 9
const REL_WRAP = 180
const BOUNDARY_WRAP = 320
const BADGE_R = 9
const TITLE_GAP = 14

interface ElementText {
  name: MeasuredLabel
  type: MeasuredLabel
  description?: MeasuredLabel
  /** Height of the text block. */
  height: number
}

interface RelText {
  label?: MeasuredLabel
  techn?: MeasuredLabel
  description?: MeasuredLabel
  index?: MeasuredLabel
  width: number
  height: number
}

function wrapped(text: string, width: number, font: FontSpec, measure: TextMeasurer): MeasuredLabel {
  return measureLabel(wrapLabel(parseLabel(text), width, font, measure), font, measure)
}

function typeLine(e: C4Element): string {
  const ext = e.external ? 'External ' : ''
  if (e.type) return `[${e.type}]`
  switch (e.level) {
    case 'person':
      return `[${ext}Person]`
    case 'system':
      return `[${ext}${e.external ? 'System' : 'Software System'}]`
    case 'container':
      return `[${ext}Container${e.techn ? `: ${e.techn}` : ''}]`
    case 'component':
      return `[${ext}Component${e.techn ? `: ${e.techn}` : ''}]`
  }
}

function boundaryType(b: C4Boundary): string | undefined {
  if (b.type) return `[${b.type}]`
  switch (b.kind) {
    case 'enterprise':
      return '[Enterprise]'
    case 'system':
      return '[Software System]'
    case 'container':
      return '[Container]'
    default:
      return undefined
  }
}

function cssColours(style: ElementStyle | undefined, part: 'shape' | 'text'): string | undefined {
  if (!style) return undefined
  if (part === 'text') return style.text ? `fill:${style.text}` : undefined
  const out = [style.fill ? `fill:${style.fill}` : '', style.stroke ? `stroke:${style.stroke}` : ''].filter(Boolean)
  return out.length > 0 ? out.join(';') : undefined
}

/** The outline of an element, with `dg-shape` on the part that holds the text. */
function drawElementShape(e: C4Element, box: Box, style: string | undefined): SvgElement[] {
  const left = box.x - box.width / 2
  const top = box.y - box.height / 2
  const w = box.width
  const h = box.height
  switch (e.shape) {
    case 'person': {
      const bodyTop = top + PERSON_HEAD
      // The head overlaps the shoulders a little, so the two read as one figure.
      return [
        el('rect', { class: 'dg-shape', style, x: left, y: bodyTop, width: w, height: h - PERSON_HEAD, rx: 22, ry: 22 }),
        el('circle', { class: 'dg-c4-head', style, cx: box.x, cy: top + PERSON_HEAD_R, r: PERSON_HEAD_R }),
      ]
    }
    case 'db': {
      const body = new PathBuilder()
        .moveTo(left, top + CAP)
        .arcTo(w / 2, CAP, 0, false, false, left + w, top + CAP)
        .lineTo(left + w, top + h - CAP)
        .arcTo(w / 2, CAP, 0, false, true, left, top + h - CAP)
        .close()
      const lid = new PathBuilder().moveTo(left, top + CAP).arcTo(w / 2, CAP, 0, false, true, left + w, top + CAP)
      return [
        el('path', { class: 'dg-shape', style, d: body.toString() }),
        el('path', { class: 'dg-c4-lid', style, d: lid.toString() }),
      ]
    }
    case 'queue': {
      const body = new PathBuilder()
        .moveTo(left + CAP, top)
        .lineTo(left + w - CAP, top)
        .arcTo(CAP, h / 2, 0, false, true, left + w - CAP, top + h)
        .lineTo(left + CAP, top + h)
        .arcTo(CAP, h / 2, 0, false, true, left + CAP, top)
        .close()
      const lid = new PathBuilder().moveTo(left + w - CAP, top).arcTo(CAP, h / 2, 0, false, false, left + w - CAP, top + h)
      return [
        el('path', { class: 'dg-shape', style, d: body.toString() }),
        el('path', { class: 'dg-c4-lid', style, d: lid.toString() }),
      ]
    }
    default:
      return [el('rect', { class: 'dg-shape', style, x: left, y: top, width: w, height: h, rx: 10, ry: 10 })]
  }
}

/**
 * Straight runs through every point with the corners rounded off. It passes
 * close to each point, so a label always sits on its line, and never swings
 * outside the points' hull, as a spline through them would.
 */
function throughPath(points: readonly Point[]): string {
  const pts = dedupe(points, 1)
  const path = new PathBuilder()
  if (pts.length === 0) return ''
  path.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i + 1 < pts.length; i++) {
    const prev = pts[i - 1]!
    const p = pts[i]!
    const next = pts[i + 1]!
    const d1 = Math.hypot(p.x - prev.x, p.y - prev.y)
    const d2 = Math.hypot(next.x - p.x, next.y - p.y)
    // Half of each neighbouring run at most, so two corners never overlap.
    const r = Math.min(48, d1 / 2, d2 / 2)
    const enter = { x: p.x + ((prev.x - p.x) * r) / d1, y: p.y + ((prev.y - p.y) * r) / d1 }
    const leave = { x: p.x + ((next.x - p.x) * r) / d2, y: p.y + ((next.y - p.y) * r) / d2 }
    path.lineTo(enter.x, enter.y).quadTo(p.x, p.y, leave.x, leave.y)
  }
  const last = pts[pts.length - 1]!
  path.lineTo(last.x, last.y)
  return path.toString()
}

/** Room the shape takes around its text: top, bottom and extra width. */
function shapeRoom(e: C4Element): { top: number; bottom: number; width: number; shift: number } {
  switch (e.shape) {
    case 'person':
      return { top: PERSON_HEAD + PAD_Y, bottom: PAD_Y, width: 0, shift: 0 }
    case 'db':
      return { top: CAP * 2 + PAD_Y - 2, bottom: CAP + PAD_Y - 4, width: 0, shift: 0 }
    case 'queue':
      // The visible end cap on the right takes room from the text.
      return { top: PAD_Y, bottom: PAD_Y, width: CAP * 3, shift: -CAP / 2 }
    default:
      return { top: PAD_Y, bottom: PAD_Y, width: 0, shift: 0 }
  }
}

export function renderC4(d: C4Diagram, measure: TextMeasurer, id: string, title?: string): RenderResult {
  // 1. Text and sizes.
  const elementText = new Map<string, ElementText>()
  const elementSize = new Map<string, Size>()
  for (const e of d.elements.values()) {
    const room = shapeRoom(e)
    const inner = ELEMENT_WIDTH - PAD_X * 2 - room.width
    const name = wrapped(e.label, inner, NAME_FONT, measure)
    const type = wrapped(typeLine(e), inner, SMALL_FONT, measure)
    const description = e.description ? wrapped(e.description, inner, SMALL_FONT, measure) : undefined
    const height = name.height + 2 + type.height + (description ? 8 + description.height : 0)
    elementText.set(e.id, { name, type, description, height })
    const widest = Math.max(name.width, type.width, description?.width ?? 0)
    elementSize.set(e.id, {
      width: Math.max(ELEMENT_WIDTH, widest + PAD_X * 2 + room.width),
      height: Math.max(MIN_HEIGHT + (e.shape === 'person' ? PERSON_HEAD : 0), height + room.top + room.bottom),
    })
  }

  const boundaryText = new Map<string, { name: MeasuredLabel; type?: MeasuredLabel; description?: MeasuredLabel; width: number; height: number }>()
  const boundaryLabel = new Map<string, Size>()
  for (const b of d.boundaries.values()) {
    const name = wrapped(b.label, BOUNDARY_WRAP, NAME_FONT, measure)
    const t = boundaryType(b)
    const type = t ? wrapped(t, BOUNDARY_WRAP, SMALL_FONT, measure) : undefined
    const description = b.description ? wrapped(b.description, BOUNDARY_WRAP, SMALL_FONT, measure) : undefined
    const width = Math.max(name.width, type?.width ?? 0, description?.width ?? 0)
    const height = name.height + (type ? type.height : 0) + (description ? 4 + description.height : 0)
    boundaryText.set(b.id, { name, type, description, width, height })
    // Room above the content: the text and a margin on either side of it.
    boundaryLabel.set(b.id, { width: width + 8, height: height + 14 })
  }

  const relText = new Map<number, RelText>()
  const relLabel = new Map<number, Size>()
  d.relations.forEach((r, i) => {
    if (r.hidden) return
    const label = r.label ? wrapped(r.label, REL_WRAP, REL_FONT, measure) : undefined
    const techn = r.techn ? wrapped(`[${r.techn}]`, REL_WRAP, REL_SMALL_FONT, measure) : undefined
    const description = r.description ? wrapped(r.description, REL_WRAP, REL_SMALL_FONT, measure) : undefined
    const index = r.index ? measureLabel(parseLabel(r.index), { ...REL_SMALL_FONT, weight: 'bold' }, measure) : undefined
    const parts = [label, techn, description].filter((p): p is MeasuredLabel => !!p && !isEmptyLabel(p.label))
    if (parts.length === 0 && !index) return
    const badge = index ? Math.max(BADGE_R * 2, index.width + 8) + (parts.length > 0 ? 5 : 0) : 0
    const textWidth = Math.max(0, ...parts.map((p) => p.width))
    const textHeight = parts.reduce((sum, p) => sum + p.height, 0)
    const width = badge + textWidth + 10
    const height = Math.max(textHeight, index ? BADGE_R * 2 : 0) + 6
    relText.set(i, { label, techn, description, index, width, height })
    relLabel.set(i, { width, height })
  })

  // 2. Layout.
  const placed = layoutC4({ diagram: d, elementSize, boundaryLabel, relLabel })

  // 3. Title.
  const titleText = d.title ? measureLabel(parseLabel(d.title), TITLE_FONT, measure) : undefined
  const width = Math.max(placed.width, titleText?.width ?? 0)
  const dy = titleText ? titleText.height + TITLE_GAP : 0
  const dx = (width - placed.width) / 2

  // 4. Boundaries, outermost first.
  const depth = (bid: string): number => {
    let n = 0
    let p = d.boundaries.get(bid)?.parent
    while (p !== undefined) {
      n++
      p = d.boundaries.get(p)?.parent
    }
    return n
  }
  // Titles go in a layer above the relations, with a halo in the page
  // colour: a relation leaving a frame upwards has to pass its title.
  const titleEls: SvgElement[] = []
  const boundaryEls: SvgElement[] = [...d.boundaries.values()]
    .sort((a, b) => depth(a.id) - depth(b.id))
    .map((b) => {
      const box = placed.boundaries.get(b.id)!
      const text = boundaryText.get(b.id)!
      const left = box.x - box.width / 2
      const top = box.y - box.height / 2
      const node = b.kind === 'node'
      const textStyle = cssColours(b.style, 'text')
      const x = left + 12
      let y = top + 8
      const lines: SvgElement[] = []
      const put = (m: MeasuredLabel | undefined, cls: string, gap = 0) => {
        if (!m) return
        y += gap
        lines.push(renderLabel(m, x, y + m.height / 2, { anchor: 'start', className: cls, style: textStyle }))
        y += m.height
      }
      put(text.name, 'dg-c4-boundary-name')
      put(text.type, 'dg-c4-boundary-type')
      put(text.description, 'dg-c4-boundary-type', 4)
      titleEls.push(el('g', { class: `dg-c4-frame-title dg-c4-${node ? 'node' : 'boundary'}-title`, 'data-id': b.id }, lines))
      return el('g', { class: `dg-cluster dg-c4-${node ? 'node' : 'boundary'}`, 'data-id': b.id, 'data-parent': b.parent }, [
        el('rect', {
          class: node ? 'dg-c4-node-box' : 'dg-c4-boundary-box',
          x: left,
          y: top,
          width: box.width,
          height: box.height,
          rx: node ? 6 : 10,
          style: cssColours(b.style, 'shape'),
        }),
      ])
    })

  // 5. Relations and their labels.
  const lineColours: string[] = []
  const markerFor = (colour: string | undefined, start: boolean): string => {
    if (!colour) return `url(#${markerId(id, 'arrow', start)})`
    let k = lineColours.indexOf(colour)
    if (k < 0) k = lineColours.push(colour) - 1
    return `url(#${id}-m-c4-${k}${start ? '-start' : ''})`
  }
  const relEls: SvgElement[] = []
  const labelEls: SvgElement[] = []
  d.relations.forEach((r: C4Relation, i) => {
    const route = placed.rels.get(i)
    if (!route) return
    const colour = r.style?.line
    relEls.push(
      el('path', {
        class: 'dg-edge dg-c4-rel',
        d: route.straight ? linearPath(route.points) : throughPath(route.points),
        style: colour ? `stroke:${colour}` : undefined,
        'marker-start': r.arrows !== 'end' ? markerFor(colour, true) : undefined,
        'marker-end': r.arrows !== 'start' ? markerFor(colour, false) : undefined,
        'data-from': r.from,
        'data-to': r.to,
      }),
    )
    const text = relText.get(i)
    if (!text || !route.label) return
    const { x: cx, y: cy } = route.label
    const left = cx - text.width / 2
    const top = cy - text.height / 2
    const textStyle = r.style?.text ? `fill:${r.style.text}` : undefined
    const children: SvgElement[] = [
      el('rect', { class: 'dg-edge-label-box', x: left, y: top, width: text.width, height: text.height, rx: 3 }),
    ]
    const parts = [
      [text.label, 'dg-edge-label dg-c4-rel-label'],
      [text.techn, 'dg-c4-rel-techn'],
      [text.description, 'dg-c4-rel-descr'],
    ] as const
    let badgeWidth = 0
    if (text.index) {
      badgeWidth = Math.max(BADGE_R * 2, text.index.width + 8)
    }
    const shown = parts.filter(([m]) => m && !isEmptyLabel(m.label))
    const blockHeight = shown.reduce((s, [m]) => s + m!.height, 0)
    const textX = left + 5 + (badgeWidth > 0 ? badgeWidth + (shown.length > 0 ? 5 : 0) : 0)
    const textWidth = Math.max(0, ...shown.map(([m]) => m!.width))
    let y = cy - blockHeight / 2
    for (const [m, cls] of shown) {
      children.push(renderLabel(m!, textX + textWidth / 2, y + m!.height / 2, { className: cls, style: textStyle }))
      y += m!.height
    }
    if (text.index) {
      const bx = left + 5 + badgeWidth / 2
      const firstLine = shown[0]?.[0]
      const by = firstLine ? cy - blockHeight / 2 + firstLine.lineHeight / 2 : cy
      children.push(
        el('rect', {
          class: 'dg-c4-index',
          x: bx - badgeWidth / 2,
          y: by - BADGE_R,
          width: badgeWidth,
          height: BADGE_R * 2,
          rx: BADGE_R,
          style: colour ? `fill:${colour}` : undefined,
        }),
        renderLabel(text.index, bx, by, { className: 'dg-c4-index-text' }),
      )
    }
    labelEls.push(el('g', { class: 'dg-edge-label-group dg-c4-rel-label-group' }, children))
  })

  // 6. Elements.
  const elementEls: SvgElement[] = [...d.elements.values()].map((e) => {
    const box = placed.elements.get(e.id)!
    const text = elementText.get(e.id)!
    const room = shapeRoom(e)
    const shapeStyle = cssColours(e.style, 'shape')
    const textStyle = cssColours(e.style, 'text')
    const top = box.y - box.height / 2
    // Text is centred in the room the shape leaves for it.
    const free = box.height - room.top - room.bottom
    let y = top + room.top + Math.max(0, (free - text.height) / 2)
    const x = box.x + room.shift
    const children: SvgElement[] = [...drawElementShape(e, box, shapeStyle)]
    children.push(renderLabel(text.name, x, y + text.name.height / 2, { className: 'dg-c4-name', style: textStyle }))
    y += text.name.height + 2
    children.push(renderLabel(text.type, x, y + text.type.height / 2, { className: 'dg-c4-type', style: textStyle }))
    y += text.type.height
    if (text.description) {
      y += 8
      children.push(
        renderLabel(text.description, x, y + text.description.height / 2, { className: 'dg-c4-descr', style: textStyle }),
      )
    }
    const classes = ['dg-node', 'dg-c4-element', `dg-c4-${e.level}`, `dg-c4-${e.shape}`, e.external ? 'dg-c4-external' : '']
    return el('g', { class: classes.filter(Boolean).join(' '), 'data-id': e.id, 'data-parent': e.parent }, children)
  })

  // 7. Stylesheet. Element palettes are the C4 model's own colours.
  const r = `#${id}`
  const palette = (selector: string, kind: string) =>
    `${r} ${selector} .dg-shape,${r} ${selector} .dg-c4-head,${r} ${selector} .dg-c4-lid{fill:${v(`--dg-c4-${kind}-fill`)};stroke:${v(`--dg-c4-${kind}-stroke`)}}` +
    `${r} ${selector} text{fill:${v(`--dg-c4-${kind}-text`)}}`
  const css = [
    `${r} .dg-c4-element .dg-shape,${r} .dg-c4-head,${r} .dg-c4-lid{stroke-width:1.5px}`,
    palette('.dg-c4-person', 'person'),
    palette('.dg-c4-system', 'system'),
    palette('.dg-c4-container', 'container'),
    palette('.dg-c4-component', 'component'),
    palette('.dg-c4-element.dg-c4-external', 'external'),
    `${r} .dg-c4-lid{fill:none !important}`,
    `${r} .dg-c4-name{font-weight:bold;font-size:14px}`,
    `${r} .dg-c4-type{font-size:12px;opacity:0.85}`,
    `${r} .dg-c4-descr{font-size:12px}`,
    `${r} .dg-c4-boundary-box{fill:none;stroke:var(--dg-c4-boundary-stroke, var(--dg-text-muted, #6b7280));stroke-width:1.5px;stroke-dasharray:8 5}`,
    `${r} .dg-c4-node-box{fill:${v('--dg-c4-node-fill')};stroke:var(--dg-c4-node-stroke, var(--dg-text-muted, #6b7280));stroke-width:1.25px}`,
    `${r} .dg-c4-boundary-title text{fill:var(--dg-c4-boundary-text, var(--dg-text, #1f2937))}`,
    `${r} .dg-c4-node-title text{fill:var(--dg-c4-node-text, var(--dg-text, #1f2937))}`,
    `${r} .dg-c4-frame-title text{paint-order:stroke;stroke:${v('--dg-edge-label-fill')};stroke-width:4px;stroke-linejoin:round}`,
    `${r} .dg-c4-boundary-name{font-weight:bold;font-size:14px}`,
    `${r} .dg-c4-boundary-type{font-size:12px;opacity:0.8}`,
    `${r} .dg-c4-rel{stroke-dasharray:6 4}`,
    `${r} .dg-c4-rel-label-group text{fill:${v('--dg-text')}}`,
    `${r} .dg-c4-rel-label{font-size:13px}`,
    `${r} .dg-c4-rel-label-group .dg-c4-rel-techn,${r} .dg-c4-rel-label-group .dg-c4-rel-descr{font-size:11px;fill:${v('--dg-text-muted')}}`,
    `${r} .dg-c4-rel-descr{font-style:italic}`,
    `${r} .dg-c4-index{fill:${v('--dg-line')}}`,
    `${r} .dg-c4-rel-label-group .dg-c4-index-text{font-size:11px;font-weight:bold;fill:${v('--dg-number-text')}}`,
    `${r} .dg-c4-title{font-weight:bold;font-size:18px}`,
  ].join('')

  const customMarkers = lineColours.flatMap((colour, k) =>
    [false, true].map((start) =>
      el(
        'marker',
        {
          id: `${id}-m-c4-${k}${start ? '-start' : ''}`,
          markerUnits: 'userSpaceOnUse',
          orient: 'auto',
          viewBox: '0 0 10 10',
          refX: start ? 1 : 9,
          refY: 5,
          markerWidth: 10,
          markerHeight: 10,
        },
        [
          el('path', {
            d: 'M0,0 L10,5 L0,10 z',
            transform: start ? 'translate(10,0) scale(-1,1)' : undefined,
            style: `fill:${colour};stroke:${colour}`,
            'stroke-width': 1,
          }),
        ],
      ),
    ),
  )

  const body: SvgElement[] = []
  if (titleText) {
    body.push(renderLabel(titleText, width / 2, titleText.height / 2, { className: 'dg-c4-title' }))
  }
  body.push(
    el('g', { transform: dx !== 0 || dy !== 0 ? `translate(${num(dx)},${num(dy)})` : undefined }, [
      el('g', { class: 'dg-clusters' }, boundaryEls),
      el('g', { class: 'dg-edges' }, relEls),
      el('g', { class: 'dg-c4-frame-titles' }, titleEls),
      el('g', { class: 'dg-edge-labels' }, labelEls),
      el('g', { class: 'dg-nodes' }, elementEls),
    ]),
  )

  return documentSvg({
    id,
    type: 'c4',
    width,
    height: placed.height + dy,
    title: title ?? d.accessibility.title ?? d.title ?? 'C4 diagram',
    description: d.accessibility.description,
    defs: [...markerDefs(id, ['arrow']), ...customMarkers],
    body,
    css,
  })
}
