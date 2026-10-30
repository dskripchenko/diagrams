/**
 * Salt: wireframes of a user interface — grids of widgets (buttons, text
 * fields, check boxes, radio buttons, drop-down lists, text), with borders,
 * tabs, trees, menus, group boxes and separators. The PlantUML reader
 * fills the model; this file lays it out on a grid and draws it.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { el, PathBuilder, type SvgElement } from '../../core/svg'
import { measureLabel, parseLabel, renderLabel, type FontSpec, type MeasuredLabel, type TextMeasurer } from '../../core/text'
import { BASE_FONT, v } from '../../core/theme'
import type { Accessibility } from '../common'

/** Grid lines: none, outer border (`+`), all (`#`), columns (`!`), rows (`-`). */
export type SaltBorder = 'none' | 'outer' | 'all' | 'columns' | 'rows'

export type SaltWidget =
  | { kind: 'text'; text: string; bold: boolean }
  | { kind: 'button'; text: string }
  | { kind: 'input'; text: string }
  | { kind: 'checkbox'; text: string; checked: boolean }
  | { kind: 'radio'; text: string; checked: boolean }
  | { kind: 'droplist'; text: string }
  | { kind: 'empty' }
  | { kind: 'separator'; style: 'dotted' | 'double' | 'dashed' | 'solid' }
  | { kind: 'grid'; border: SaltBorder; rows: SaltWidget[][]; title?: string; scroll: boolean }
  | { kind: 'tabs'; tabs: string[]; selected: number; vertical: boolean }
  | { kind: 'menu'; items: string[] }
  | { kind: 'tree'; items: { depth: number; text: string }[] }

export interface SaltDiagram {
  type: 'salt'
  root: SaltWidget
  title?: string
  accessibility: Accessibility
}

const FONT: FontSpec = { ...BASE_FONT, size: 13 }
const BOLD: FontSpec = { ...FONT, weight: 'bold' }
const GAP = 6
/** The height of a row of widgets. */
const ROW = 26
const PAD = 6

interface Sized {
  width: number
  height: number
  draw(x: number, y: number, width: number): SvgElement[]
}

const r = (n: number) => Math.round(n * 100) / 100

function size(w: SaltWidget, measure: TextMeasurer): Sized {
  const label = (text: string, font = FONT): MeasuredLabel => measureLabel(parseLabel(text || ' '), font, measure)
  const text = (l: MeasuredLabel, x: number, y: number, cls = 'dg-salt-text'): SvgElement => renderLabel(l, r(x), r(y), { anchor: 'start', className: cls })
  switch (w.kind) {
    case 'empty':
      return { width: 0, height: 0, draw: () => [] }
    case 'text': {
      const l = label(w.text, w.bold ? BOLD : FONT)
      // Rows of widgets are 26 high: text centred on the same line as a field beside it.
      const h = Math.max(ROW, l.height)
      return { width: l.width, height: h, draw: (x, y) => [text(l, x, y + h / 2, w.bold ? 'dg-salt-text dg-salt-bold' : 'dg-salt-text')] }
    }
    case 'button': {
      const l = label(w.text.trim())
      const width = l.width + 24
      return {
        width,
        height: 26,
        // A button keeps its own width; it does not stretch with its column.
        draw: (x, y) => [
          el('rect', { class: 'dg-salt-button', x: r(x), y: r(y), width: r(width), height: 26, rx: 5 }),
          renderLabel(l, r(x + width / 2), r(y + 13), { className: 'dg-salt-button-text' }),
        ],
      }
    }
    case 'input': {
      const l = label(w.text.trimEnd())
      // Trailing spaces in "Name     " make the field wider, as in PlantUML.
      const width = Math.max(60, label(w.text.replace(/ /g, ' ')).width + 16)
      return {
        width,
        height: 26,
        draw: (x, y, cell) => [
          el('rect', { class: 'dg-salt-input', x: r(x), y: r(y), width: r(Math.max(width, cell)), height: 26, rx: 2 }),
          text(l, x + 8, y + 13),
        ],
      }
    }
    case 'checkbox':
    case 'radio': {
      const l = label(w.text)
      return {
        width: 20 + l.width,
        height: ROW,
        draw: (x, y) => {
          const mark: SvgElement[] =
            w.kind === 'checkbox'
              ? [
                  el('rect', { class: 'dg-salt-box', x: r(x), y: r(y + 7), width: 12, height: 12, rx: 2 }),
                  w.checked ? el('path', { class: 'dg-salt-check', d: new PathBuilder().moveTo(r(x + 2.5), r(y + 13)).lineTo(r(x + 5.5), r(y + 16)).lineTo(r(x + 10), r(y + 10)).toString() }) : null,
                ].filter((e): e is SvgElement => e !== null)
              : [
                  el('circle', { class: 'dg-salt-box', cx: r(x + 6), cy: r(y + 13), r: 6 }),
                  ...(w.checked ? [el('circle', { class: 'dg-salt-dot', cx: r(x + 6), cy: r(y + 13), r: 3 })] : []),
                ]
          return [...mark, text(l, x + 18, y + 13)]
        },
      }
    }
    case 'droplist': {
      const l = label(w.text)
      const width = l.width + 36
      return {
        width,
        height: 26,
        draw: (x, y, cell) => {
          const wd = Math.max(width, cell)
          return [
            el('rect', { class: 'dg-salt-input', x: r(x), y: r(y), width: r(wd), height: 26, rx: 2 }),
            text(l, x + 8, y + 13),
            el('path', { class: 'dg-salt-arrow', d: new PathBuilder().moveTo(r(x + wd - 16), r(y + 10)).lineTo(r(x + wd - 8), r(y + 10)).lineTo(r(x + wd - 12), r(y + 16)).close().toString() }),
          ]
        },
      }
    }
    case 'separator':
      return { width: 0, height: 10, draw: (x, y, cell) => separator(w.style, x, y + 5, cell) }
    case 'tabs': {
      const labels = w.tabs.map((t, k) => label(t, k === w.selected ? BOLD : FONT))
      if (w.vertical) {
        const width = Math.max(...labels.map((l) => l.width)) + 20
        return {
          width,
          height: labels.length * 26,
          draw: (x, y) =>
            labels.flatMap((l, k) => [
              el('rect', { class: k === w.selected ? 'dg-salt-tab dg-salt-tab-selected' : 'dg-salt-tab', x: r(x), y: r(y + k * 26), width: r(width), height: 26 }),
              text(l, x + 10, y + k * 26 + 13),
            ]),
        }
      }
      const widths = labels.map((l) => l.width + 20)
      return {
        width: widths.reduce((a, b) => a + b, 0),
        height: 26,
        draw: (x, y, cell) => {
          let cx = x
          const out: SvgElement[] = [el('line', { class: 'dg-salt-line', x1: r(x), y1: r(y + 26), x2: r(x + Math.max(cell, widths.reduce((a, b) => a + b, 0))), y2: r(y + 26) })]
          labels.forEach((l, k) => {
            out.push(el('path', { class: k === w.selected ? 'dg-salt-tab dg-salt-tab-selected' : 'dg-salt-tab', d: new PathBuilder().moveTo(r(cx), r(y + 26)).lineTo(r(cx), r(y + 3)).lineTo(r(cx + widths[k]!), r(y + 3)).lineTo(r(cx + widths[k]!), r(y + 26)).toString() }))
            out.push(text(l, cx + 10, y + 15))
            cx += widths[k]!
          })
          return out
        },
      }
    }
    case 'menu': {
      const labels = w.items.map((t) => label(t))
      const width = labels.reduce((a, l) => a + l.width + 20, 0)
      return {
        width,
        height: 26,
        draw: (x, y, cell) => {
          const out: SvgElement[] = [el('rect', { class: 'dg-salt-menu', x: r(x), y: r(y), width: r(Math.max(width, cell)), height: 26 })]
          let cx = x
          for (const l of labels) {
            out.push(text(l, cx + 10, y + 13))
            cx += l.width + 20
          }
          return out
        },
      }
    }
    case 'tree': {
      const labels = w.items.map((i) => label(i.text))
      const width = Math.max(0, ...labels.map((l, k) => l.width + w.items[k]!.depth * 16)) + 8
      return {
        width,
        height: labels.length * 22,
        draw: (x, y) =>
          labels.flatMap((l, k) => {
            const depth = w.items[k]!.depth
            const cy = y + k * 22 + 11
            const lines: SvgElement[] = depth > 1 ? [el('path', { class: 'dg-salt-tree', d: new PathBuilder().moveTo(r(x + (depth - 2) * 16 + 6), r(cy - 11)).lineTo(r(x + (depth - 2) * 16 + 6), r(cy)).lineTo(r(x + (depth - 1) * 16 - 2), r(cy)).toString() })] : []
            return [...lines, text(l, x + (depth - 1) * 16, cy)]
          }),
      }
    }
    case 'grid':
      return gridSize(w, measure)
  }
}

function separator(style: 'dotted' | 'double' | 'dashed' | 'solid', x: number, y: number, width: number): SvgElement[] {
  if (style === 'double') {
    return [
      el('line', { class: 'dg-salt-line', x1: r(x), y1: r(y - 1.5), x2: r(x + width), y2: r(y - 1.5) }),
      el('line', { class: 'dg-salt-line', x1: r(x), y1: r(y + 1.5), x2: r(x + width), y2: r(y + 1.5) }),
    ]
  }
  return [el('line', { class: `dg-salt-line dg-salt-${style}`, x1: r(x), y1: r(y), x2: r(x + width), y2: r(y) })]
}

function gridSize(g: Extract<SaltWidget, { kind: 'grid' }>, measure: TextMeasurer): Sized {
  const cells = g.rows.map((row) => row.map((w) => size(w, measure)))
  const columns = Math.max(1, ...g.rows.map((row) => (row.length === 1 && row[0]!.kind === 'separator' ? 1 : row.length)))
  const colWidths = Array.from({ length: columns }, (_, c) => Math.max(0, ...cells.map((row, k) => (g.rows[k]!.length === 1 && g.rows[k]![0]!.kind === 'separator' ? 0 : (row[c]?.width ?? 0)))))
  const rowHeights = cells.map((row) => Math.max(0, ...row.map((c) => c.height)))
  const framed = g.border !== 'none' || g.title !== undefined
  const pad = framed ? PAD : 0
  const titleLabel = g.title ? measureLabel(parseLabel(g.title), BOLD, measure) : null
  const top = pad + (titleLabel ? titleLabel.height / 2 : 0)
  const innerWidth = colWidths.reduce((a, b) => a + b, 0) + GAP * (columns - 1)
  const innerHeight = rowHeights.reduce((a, b) => a + b, 0) + GAP * Math.max(0, rowHeights.length - 1)
  const scroll = g.scroll ? 14 : 0
  const width = Math.max(innerWidth, titleLabel ? titleLabel.width + 20 : 0) + pad * 2 + scroll
  const height = innerHeight + top + pad
  return {
    width,
    height,
    draw: (x, y, cell) => {
      const w = Math.max(width, cell)
      const out: SvgElement[] = []
      const box = { x: r(x), y: r(y + (titleLabel ? titleLabel.height / 2 : 0)), width: r(w), height: r(height - (titleLabel ? titleLabel.height / 2 : 0)) }
      if (framed) out.push(el('rect', { class: 'dg-salt-frame', ...box, rx: g.title ? 4 : 0 }))
      if (titleLabel) {
        out.push(el('rect', { class: 'dg-salt-title-bg', x: r(x + 8), y: r(y), width: r(titleLabel.width + 8), height: r(titleLabel.height) }))
        out.push(renderLabel(titleLabel, r(x + 12), r(y + titleLabel.height / 2), { anchor: 'start', className: 'dg-salt-text dg-salt-bold' }))
      }
      if (g.scroll) {
        out.push(el('rect', { class: 'dg-salt-scroll', x: r(x + w - scroll), y: box.y, width: scroll, height: box.height }))
        out.push(el('rect', { class: 'dg-salt-thumb', x: r(x + w - scroll + 3), y: r(box.y + 4), width: scroll - 6, height: r(Math.min(40, box.height / 3)), rx: 3 }))
      }
      // Extra width a wider parent gave: the last column takes it.
      const extra = w - width
      let cy = y + top
      g.rows.forEach((row, k) => {
        let cx = x + pad
        const spansAll = row.length === 1 && (row[0]!.kind === 'separator' || columns === 1)
        row.forEach((_, c) => {
          const cw = spansAll ? innerWidth + extra : colWidths[c]! + (c === columns - 1 ? extra : 0)
          out.push(...cells[k]![c]!.draw(cx, cy, cw))
          cx += colWidths[c]! + GAP
        })
        cy += rowHeights[k]! + GAP
        if (k < g.rows.length - 1 && (g.border === 'all' || g.border === 'rows')) {
          out.push(el('line', { class: 'dg-salt-grid', x1: r(x), y1: r(cy - GAP / 2), x2: r(x + w - scroll), y2: r(cy - GAP / 2) }))
        }
      })
      if (g.border === 'all' || g.border === 'columns') {
        let cx = x + pad
        for (let c = 0; c < columns - 1; c++) {
          cx += colWidths[c]! + GAP
          out.push(el('line', { class: 'dg-salt-grid', x1: r(cx - GAP / 2), y1: box.y, x2: r(cx - GAP / 2), y2: r(box.y + box.height) }))
        }
      }
      return out
    },
  }
}

export function renderSalt(d: SaltDiagram, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const root = size(d.root, measure)
  const titleLabel = d.title ? measureLabel(parseLabel(d.title), { ...BASE_FONT, size: 18, weight: 'bold' }, measure) : null
  const top = titleLabel ? titleLabel.height + 12 : 0
  const width = Math.max(root.width, titleLabel?.width ?? 0)
  const body: SvgElement[] = []
  if (titleLabel) body.push(renderLabel(titleLabel, width / 2, titleLabel.height / 2, { className: 'dg-title' }))
  body.push(el('g', { class: 'dg-salt' }, root.draw(0, top, root.width)))
  const s = `#${id}`
  const css = [
    `${s} .dg-title{fill:${v('--dg-text')};font-size:18px;font-weight:bold}`,
    `${s} .dg-salt-text{fill:${v('--dg-text')};font-size:13px}`,
    `${s} .dg-salt-bold{font-weight:bold}`,
    `${s} .dg-salt-button{fill:${v('--dg-node-fill')};stroke:${v('--dg-node-stroke')};stroke-width:1.5px}`,
    `${s} .dg-salt-button-text{fill:${v('--dg-node-text')};font-size:13px}`,
    `${s} .dg-salt-input,${s} .dg-salt-menu{fill:${v('--dg-row-fill')};stroke:${v('--dg-cluster-stroke')};stroke-width:1px}`,
    `${s} .dg-salt-box{fill:${v('--dg-row-fill')};stroke:${v('--dg-line')};stroke-width:1.2px}`,
    `${s} .dg-salt-check{fill:none;stroke:${v('--dg-node-stroke')};stroke-width:2px}`,
    `${s} .dg-salt-dot,${s} .dg-salt-arrow{fill:${v('--dg-line')}}`,
    `${s} .dg-salt-frame{fill:none;stroke:${v('--dg-line')};stroke-width:1px}`,
    `${s} .dg-salt-title-bg{fill:${v('--dg-row-fill')}}`,
    `${s} .dg-salt-grid,${s} .dg-salt-line,${s} .dg-salt-tree{fill:none;stroke:${v('--dg-cluster-stroke')};stroke-width:1px}`,
    `${s} .dg-salt-dotted{stroke-dasharray:2 3}`,
    `${s} .dg-salt-dashed{stroke-dasharray:6 4}`,
    `${s} .dg-salt-tab{fill:${v('--dg-row-alt-fill')};stroke:${v('--dg-cluster-stroke')};stroke-width:1px}`,
    `${s} .dg-salt-tab-selected{fill:${v('--dg-row-fill')}}`,
    `${s} .dg-salt-scroll{fill:${v('--dg-row-alt-fill')};stroke:${v('--dg-cluster-stroke')};stroke-width:1px}`,
    `${s} .dg-salt-thumb{fill:${v('--dg-cluster-stroke')}}`,
  ].join('')
  return documentSvg({
    id,
    type: 'salt',
    width,
    height: top + root.height,
    title: title ?? d.accessibility.title ?? d.title ?? 'Wireframe',
    description: d.accessibility.description,
    body,
    css,
  })
}
