/**
 * Sequence diagrams: geometry to SVG.
 *
 * Painted back to front: participant boxes and `rect` backgrounds, then
 * lifelines, block frames, activations, messages and notes, and the actors
 * last so nothing is drawn across a participant's name.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { markerDefs, markerId, type MarkerKind } from '../../core/markers'
import { el, PathBuilder, txt, type SvgElement } from '../../core/svg'
import { v } from '../../core/theme'
import { renderLabel } from '../../core/text'
import {
  ACTIVATION_WIDTH,
  FIGURE_HEIGHT,
  TAB_HEIGHT,
  type ActorGeom,
  type FrameGeom,
  type MessageGeom,
  type SequenceLayout,
} from './layout'

const NUMBER_RADIUS = 9

function markerFor(head: MessageGeom['head']): MarkerKind | null {
  switch (head) {
    case 'arrow':
      return 'arrow'
    case 'open':
      return 'open-arrow'
    case 'cross':
      return 'cross'
    default:
      return null
  }
}

/** The UML robustness and storage icons, drawn in the figure's space above the name. */
function icon(a: ActorGeom): SvgElement[] {
  const cx = a.x
  const top = a.top
  const cls = 'dg-actor-figure'
  switch (a.kind) {
    case 'boundary':
      return [
        el('path', { class: `${cls} dg-actor-limbs`, d: new PathBuilder().moveTo(cx - 16, top + 5).lineTo(cx - 16, top + 29).moveTo(cx - 16, top + 17).lineTo(cx - 7, top + 17).toString() }),
        el('circle', { class: cls, cx: cx + 5, cy: top + 17, r: 12 }),
      ]
    case 'control':
      return [
        el('circle', { class: cls, cx, cy: top + 19, r: 12 }),
        el('path', { class: `${cls} dg-actor-limbs`, d: new PathBuilder().moveTo(cx + 5, top + 3).lineTo(cx - 1, top + 7).lineTo(cx + 5, top + 11).toString() }),
      ]
    case 'entity':
      return [
        el('circle', { class: cls, cx, cy: top + 15, r: 12 }),
        el('line', { class: cls, x1: cx - 12, y1: top + 30, x2: cx + 12, y2: top + 30 }),
      ]
    case 'database': {
      const l = cx - 14
      const w = 28
      const t = top + 2
      const h = 30
      const ry = 5
      return [
        el('path', {
          class: cls,
          d: new PathBuilder().moveTo(l, t + ry).arcTo(w / 2, ry, 0, false, false, l + w, t + ry).lineTo(l + w, t + h - ry).arcTo(w / 2, ry, 0, false, true, l, t + h - ry).close().toString(),
        }),
        el('path', { class: `${cls} dg-actor-limbs`, d: new PathBuilder().moveTo(l, t + ry).arcTo(w / 2, ry, 0, false, true, l + w, t + ry).toString() }),
      ]
    }
    case 'collections':
      return [
        el('rect', { class: cls, x: cx - 10, y: top + 4, width: 26, height: 20 }),
        el('rect', { class: cls, x: cx - 16, y: top + 10, width: 26, height: 20 }),
      ]
    case 'queue': {
      const l = cx - 20
      const w = 40
      const t = top + 6
      const h = 22
      const rx = 5
      return [
        el('path', {
          class: cls,
          d: new PathBuilder().moveTo(l + rx, t).lineTo(l + w - rx, t).arcTo(rx, h / 2, 0, false, true, l + w - rx, t + h).lineTo(l + rx, t + h).arcTo(rx, h / 2, 0, false, true, l + rx, t).close().toString(),
        }),
        el('path', { class: `${cls} dg-actor-limbs`, d: new PathBuilder().moveTo(l + w - rx, t).arcTo(rx, h / 2, 0, false, false, l + w - rx, t + h).toString() }),
      ]
    }
    default:
      return []
  }
}

function actor(a: ActorGeom): SvgElement {
  if (a.kind !== 'actor' && a.kind !== 'participant') {
    return el('g', { class: `dg-actor dg-actor-${a.kind}` }, [
      ...icon(a),
      renderLabel(a.label, a.x, a.top + FIGURE_HEIGHT + 4 + a.label.height / 2, { className: 'dg-actor-label' }),
    ])
  }
  if (a.kind === 'actor') {
    // A stick figure on top, the name under it.
    const cx = a.x
    const top = a.top
    const head = 7
    const neck = top + head * 2
    const hips = neck + 13
    const feet = top + FIGURE_HEIGHT
    const figure = new PathBuilder()
      .moveTo(cx, neck)
      .lineTo(cx, hips)
      .moveTo(cx - 12, neck + 5)
      .lineTo(cx + 12, neck + 5)
      .moveTo(cx, hips)
      .lineTo(cx - 10, feet)
      .moveTo(cx, hips)
      .lineTo(cx + 10, feet)
    return el('g', { class: 'dg-actor' }, [
      el('circle', { class: 'dg-actor-figure', cx, cy: top + head, r: head }),
      el('path', { class: 'dg-actor-figure dg-actor-limbs', d: figure.toString() }),
      renderLabel(a.label, cx, feet + 4 + a.label.height / 2, { className: 'dg-actor-label' }),
    ])
  }
  return el('g', { class: 'dg-actor' }, [
    el('rect', {
      class: 'dg-actor-box',
      x: a.x - a.width / 2,
      y: a.top,
      width: a.width,
      height: a.height,
      rx: 4,
      ry: 4,
    }),
    renderLabel(a.label, a.x, a.top + a.height / 2, { className: 'dg-actor-label' }),
  ])
}

/** A block's outline and section rules: drawn under the activation bars. */
function frame(f: FrameGeom): SvgElement {
  const parts: SvgElement[] = [
    el('rect', { class: 'dg-block', x: f.left, y: f.top, width: f.right - f.left, height: f.bottom - f.top }),
  ]
  for (const section of f.sections) {
    parts.push(el('line', { class: 'dg-block-sep', x1: f.left, y1: section.y, x2: f.right, y2: section.y }))
  }
  return el('g', { class: `dg-frame dg-frame-${f.block}` }, parts)
}

/**
 * A block's tab and guard texts: drawn over the activation bars, which would
 * otherwise cut through a label like "loop" that sits on a lifeline.
 */
function frameLabels(f: FrameGeom): SvgElement {
  const parts: (SvgElement | null)[] = []
  if (f.tab) {
    const w = f.tabWidth
    const tab = [
      [f.left, f.top],
      [f.left + w, f.top],
      [f.left + w, f.top + TAB_HEIGHT - 6],
      [f.left + w - 6, f.top + TAB_HEIGHT],
      [f.left, f.top + TAB_HEIGHT],
    ]
      .map(([x, y]) => `${Math.round(x! * 100) / 100},${Math.round(y! * 100) / 100}`)
      .join(' ')
    parts.push(
      el('polygon', { class: 'dg-block-tab', points: tab }),
      renderLabel(f.tab, f.left + w / 2, f.top + TAB_HEIGHT / 2, { className: 'dg-block-label' }),
    )
  }
  if (f.guard) {
    parts.push(
      renderLabel(f.guard, f.left + f.tabWidth + 8, f.top + Math.max(TAB_HEIGHT, f.guard.height) / 2, {
        anchor: 'start',
        className: 'dg-block-guard',
      }),
    )
  }
  for (const section of f.sections) {
    if (section.guard) {
      parts.push(
        renderLabel(section.guard, (f.left + f.right) / 2, section.y + 4 + section.guard.height / 2, {
          className: 'dg-block-guard',
        }),
      )
    }
  }
  return el('g', { class: `dg-frame-labels dg-frame-${f.block}` }, parts.filter((p): p is SvgElement => !!p))
}

function message(m: MessageGeom, prefix: string): SvgElement {
  const kind = markerFor(m.head)
  const end = kind ? `url(#${markerId(prefix, kind)})` : undefined
  const start = kind && m.bidirectional ? `url(#${markerId(prefix, kind, true)})` : undefined
  const cls = `dg-message${m.line === 'dotted' ? ' dg-message-dotted' : ''}`
  const parts: (SvgElement | null)[] = []
  if (m.self) {
    const path = new PathBuilder()
      .moveTo(m.x1, m.y)
      .lineTo(m.loopRight, m.y)
      .lineTo(m.loopRight, m.y2)
      .lineTo(m.x2, m.y2)
    parts.push(el('path', { class: cls, d: path.toString(), 'marker-end': end, 'marker-start': start }))
  } else {
    parts.push(el('line', { class: cls, x1: m.x1, y1: m.y, x2: m.x2, y2: m.y, 'marker-end': end, 'marker-start': start }))
  }
  if (m.label) {
    parts.push(renderLabel(m.label, m.labelX, m.labelY, { anchor: m.anchor, className: 'dg-message-text' }))
  }
  if (m.number !== undefined) {
    parts.push(
      el('circle', { class: 'dg-number', cx: m.x1, cy: m.y, r: NUMBER_RADIUS }),
      el('text', { class: 'dg-number-text', x: m.x1, y: m.y, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, [
        txt(String(m.number)),
      ]),
    )
  }
  return el('g', { class: 'dg-message-group' }, parts)
}

export function renderSequenceLayout(
  layout: SequenceLayout,
  id: string,
  title: string,
  description?: string,
): RenderResult {
  const markers = new Set<MarkerKind>()
  for (const m of layout.messages) {
    const kind = markerFor(m.head)
    if (kind) markers.add(kind)
  }

  const content: SvgElement[] = [
    el(
      'g',
      { class: 'dg-groups' },
      layout.groups.map((g) =>
        el('g', { class: 'dg-group' }, [
          el('rect', {
            class: 'dg-group-box',
            x: g.left,
            y: g.top,
            width: g.right - g.left,
            height: g.bottom - g.top,
            rx: 4,
            style: g.color ? `fill:${g.color}` : undefined,
          }),
          g.label ? renderLabel(g.label, (g.left + g.right) / 2, g.top + 4 + g.label.height / 2, { className: 'dg-group-label' }) : null,
        ]),
      ),
    ),
    el(
      'g',
      { class: 'dg-rects' },
      layout.rects.map((r) =>
        el('rect', {
          class: 'dg-rect',
          x: r.left,
          y: r.top,
          width: r.right - r.left,
          height: r.bottom - r.top,
          style: r.color ? `fill:${r.color}` : undefined,
        }),
      ),
    ),
    el(
      'g',
      { class: 'dg-lifelines' },
      layout.lifelines
        .filter((l) => l.y2 > l.y1)
        .map((l) => el('line', { class: 'dg-lifeline', x1: l.x, y1: l.y1, x2: l.x, y2: l.y2 })),
    ),
    el('g', { class: 'dg-frames' }, layout.frames.map(frame)),
    el(
      'g',
      { class: 'dg-activations' },
      layout.activations.map((a) =>
        el('rect', { class: 'dg-activation', x: a.left, y: a.top, width: ACTIVATION_WIDTH, height: a.bottom - a.top }),
      ),
    ),
    el('g', { class: 'dg-frame-label-layer' }, layout.frames.map(frameLabels)),
    el('g', { class: 'dg-messages' }, layout.messages.map((m) => message(m, id))),
    el(
      'g',
      { class: 'dg-notes' },
      layout.notes.map((n) =>
        el('g', { class: 'dg-note-group' }, [
          el('rect', { class: 'dg-note', x: n.left, y: n.top, width: n.width, height: n.height, rx: 2 }),
          renderLabel(n.label, n.left + n.width / 2, n.top + n.height / 2, { className: 'dg-note-text' }),
        ]),
      ),
    ),
    el(
      'g',
      { class: 'dg-crosses' },
      layout.crosses.map((c) =>
        el('path', {
          class: 'dg-destroy',
          d: new PathBuilder()
            .moveTo(c.x - 9, c.y - 9)
            .lineTo(c.x + 9, c.y + 9)
            .moveTo(c.x - 9, c.y + 9)
            .lineTo(c.x + 9, c.y - 9)
            .toString(),
        }),
      ),
    ),
    el('g', { class: 'dg-actors' }, layout.actors.map(actor)),
  ]
  // Only when used: diagrams without them render byte for byte as before.
  if (layout.dividers.length > 0) {
    content.push(el(
      'g',
      { class: 'dg-dividers' },
      layout.dividers.map((d) => {
        const mid = (layout.span.left + layout.span.right) / 2
        const w = (d.label?.width ?? 0) + 20
        const h = (d.label?.height ?? 0) + 8
        return el('g', { class: 'dg-divider' }, [
          el('line', { class: 'dg-divider-line', x1: layout.span.left, y1: d.y - 1.5, x2: layout.span.right, y2: d.y - 1.5 }),
          el('line', { class: 'dg-divider-line', x1: layout.span.left, y1: d.y + 1.5, x2: layout.span.right, y2: d.y + 1.5 }),
          d.label ? el('rect', { class: 'dg-divider-box', x: mid - w / 2, y: d.y - h / 2, width: w, height: h, rx: 3 }) : null,
          d.label ? renderLabel(d.label, mid, d.y, { className: 'dg-divider-text' }) : null,
        ])
      }),
    ))
  }
  if (layout.delays.some((d) => d.label)) {
    content.push(el(
      'g',
      { class: 'dg-delays' },
      layout.delays.filter((d) => d.label).map((d) =>
        renderLabel(d.label!, (layout.span.left + layout.span.right) / 2, d.y, { className: 'dg-delay-text' }),
      ),
    ))
  }

  const body: SvgElement[] = []
  if (layout.title) {
    body.push(renderLabel(layout.title.label, layout.title.x, layout.title.y, { className: 'dg-title' }))
  }
  body.push(el('g', { transform: `translate(${Math.round(layout.offsetX * 100) / 100},0)` }, content))

  const r = `#${id}`
  const css = [
    `${r} .dg-title{fill:${v('--dg-text')};font-size:18px;font-weight:bold}`,
    `${r} .dg-actor-box{fill:${v('--dg-actor-fill')};stroke:${v('--dg-actor-stroke')};stroke-width:1.5px}`,
    `${r} .dg-actor-figure{fill:${v('--dg-actor-fill')};stroke:${v('--dg-actor-stroke')};stroke-width:1.5px}`,
    `${r} .dg-actor-limbs{fill:none}`,
    `${r} .dg-actor-label{fill:${v('--dg-text')}}`,
    `${r} .dg-lifeline{stroke:${v('--dg-lifeline')};stroke-width:1px;stroke-dasharray:4 3}`,
    `${r} .dg-activation{fill:${v('--dg-activation-fill')};stroke:${v('--dg-actor-stroke')};stroke-width:1px}`,
    `${r} .dg-message{fill:none;stroke:${v('--dg-line')};stroke-width:1.5px}`,
    `${r} .dg-message-dotted{stroke-dasharray:4 3}`,
    `${r} .dg-message-text{fill:${v('--dg-text')}}`,
    `${r} .dg-number{fill:${v('--dg-line')}}`,
    `${r} .dg-number-text{fill:${v('--dg-number-text')};font-size:11px;font-weight:bold}`,
    `${r} .dg-note{fill:${v('--dg-note-fill')};stroke:${v('--dg-note-stroke')};stroke-width:1px}`,
    `${r} .dg-note-text{fill:${v('--dg-note-text')}}`,
    `${r} .dg-block{fill:none;stroke:${v('--dg-block-stroke')};stroke-width:1.5px}`,
    `${r} .dg-block-tab{fill:${v('--dg-block-label-fill')};stroke:${v('--dg-block-stroke')};stroke-width:1px}`,
    `${r} .dg-block-label{fill:${v('--dg-text')};font-size:13px;font-weight:bold}`,
    `${r} .dg-block-guard{fill:${v('--dg-text-muted')};font-size:13px}`,
    `${r} .dg-block-sep{stroke:${v('--dg-block-stroke')};stroke-width:1px;stroke-dasharray:4 3}`,
    `${r} .dg-rect{fill:${v('--dg-rect-fill')}}`,
    `${r} .dg-group-box{fill:none;stroke:${v('--dg-cluster-stroke')};stroke-width:1px}`,
    `${r} .dg-group-label{fill:${v('--dg-cluster-text')};font-weight:600}`,
    `${r} .dg-destroy{fill:none;stroke:${v('--dg-line')};stroke-width:2px}`,
    ...(layout.dividers.length > 0
      ? [
          `${r} .dg-divider-line{stroke:${v('--dg-block-stroke')};stroke-width:1px}`,
          `${r} .dg-divider-box{fill:${v('--dg-block-label-fill')};stroke:${v('--dg-block-stroke')};stroke-width:1px}`,
          `${r} .dg-divider-text{fill:${v('--dg-text')};font-size:13px;font-weight:bold}`,
        ]
      : []),
    ...(layout.delays.some((d) => d.label) ? [`${r} .dg-delay-text{fill:${v('--dg-text-muted')};font-size:13px;font-style:italic}`] : []),
  ].join('')

  return documentSvg({
    id,
    type: 'sequence',
    width: layout.width,
    height: layout.height,
    title,
    description,
    defs: markerDefs(id, markers),
    body,
    css,
  })
}
