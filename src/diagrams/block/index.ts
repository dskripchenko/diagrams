/**
 * Block diagrams (`block-beta`): blocks placed by hand on a grid, with
 * arrows between them.
 *
 *     block-beta
 *       columns 3
 *       front["Frontend"]:3
 *       api("API") space db[("Database")]
 *       block:workers:3
 *         columns 2
 *         w1 w2
 *       end
 *       front --> api
 *       api -- "SQL" --> db
 *
 * Blocks fill the rows left to right (`columns N`, one row when none is
 * given); `id:2` spans two columns; `space` / `space:2` leaves cells empty;
 * `block:id:span … end` nests a grid of its own (`block:id["Title"]`). Shapes
 * are the flowchart's: `[…]`, `(…)`, `([…])`, `[[…]]`, `[(…)]`, `((…))`,
 * `{…}`, `{{…}}`, `>…]`, `[/…/]`, `[\…\]`, `[/…\]`, `[\…/]`. Arrows:
 * `-->`, `---`, `-.->`, `==>`, with `-- "text" -->` labels; `style`,
 * `classDef`, `class`.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { DiagramError, tooLarge } from '../../core/errors'
import type { Box, Point } from '../../core/geometry'
import { markerDefs, markerId } from '../../core/markers'
import { statements, unquote, type Statement } from '../../core/scanner'
import { drawShape, intersectShape, shapeSize, type ShapeKind } from '../../core/shapes'
import { cssText, mergeStyles, parseStyle, type UserStyle } from '../../core/style'
import { el, type SvgElement } from '../../core/svg'
import { measureLabel, parseLabel, renderLabel, type MeasuredLabel, type TextMeasurer } from '../../core/text'
import { BASE_FONT, v } from '../../core/theme'
import { accessibilityStatement, type Accessibility } from '../common'

export type BlockItem =
  | { kind: 'block'; id: string; label: string; shape: ShapeKind; span: number; classes: string[]; style?: UserStyle }
  | { kind: 'space'; span: number }
  | { kind: 'group'; id: string; label?: string; span: number; columns?: number; items: BlockItem[]; classes: string[]; style?: UserStyle }

export interface BlockEdge {
  from: string
  to: string
  text?: string
  stroke: 'normal' | 'dotted' | 'thick'
  arrow: boolean
}

export interface BlockDiagram {
  type: 'block'
  columns?: number
  items: BlockItem[]
  edges: BlockEdge[]
  classDefs: Map<string, UserStyle>
  accessibility: Accessibility
}

const MAX_BLOCKS = 500

/** Openers, longest first, with their closer and shape. */
const SHAPES: [string, string, ShapeKind][] = [
  ['(((', ')))', 'doublecircle'],
  ['((', '))', 'circle'],
  ['([', '])', 'stadium'],
  ['[[', ']]', 'subroutine'],
  ['[(', ')]', 'cylinder'],
  ['{{', '}}', 'hexagon'],
  ['[/', '/]', 'parallelogram'],
  ['[\\', '\\]', 'parallelogram-alt'],
  ['[/', '\\]', 'trapezoid'],
  ['[\\', '/]', 'trapezoid-alt'],
  ['>', ']', 'asymmetric'],
  ['[', ']', 'rect'],
  ['(', ')', 'round'],
  ['{', '}', 'rhombus'],
]

const ID = String.raw`[\p{L}\p{N}_][\p{L}\p{N}_-]*`
const EDGE = new RegExp(`^(${ID})\\s*(?:(--|-\\.|==)\\s*"([^"]*)"\\s*)?(-->|---|-\\.->|-\\.-|==>|===)\\s*(${ID})$`, 'u')

/** Splits a line of blocks on spaces outside brackets and quotes. */
function tokens(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote = false
  let cur = ''
  for (const ch of text) {
    if (ch === '"') quote = !quote
    if (!quote) {
      if ('[({'.includes(ch)) depth++
      else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1)
      if (ch === ' ' && depth === 0) {
        if (cur) out.push(cur)
        cur = ''
        continue
      }
    }
    cur += ch
  }
  if (cur) out.push(cur)
  return out
}

function block(token: string, s: Statement): BlockItem {
  let m = /^space(?::(\d+))?$/.exec(token)
  if (m) return { kind: 'space', span: m[1] ? Number(m[1]) : 1 }
  m = new RegExp(`^(${ID})(.*?)(?::(\\d+))?(?::::([\\w-]+))?$`, 'u').exec(token)
  if (!m) throw new DiagramError(`"${token}" is not a block`, s.line, s.column)
  const [, id, rest, span, cls] = m
  let shape: ShapeKind = 'rect'
  let label = id!
  if (rest) {
    const found = SHAPES.find(([open, close]) => rest.startsWith(open) && rest.endsWith(close) && rest.length >= open.length + close.length)
    if (!found) throw new DiagramError(`"${rest}" is not a block shape`, s.line, s.column, 'a["text"], b("text"), c(("text")), d[("text")]')
    shape = found[2]
    label = unquote(rest.slice(found[0].length, rest.length - found[1].length))
  }
  return { kind: 'block', id: id!, label, shape, span: span ? Number(span) : 1, classes: cls ? [cls] : [] }
}

export function parseBlock(source: string): BlockDiagram {
  const list = statements(source)
  const head = list[0]
  if (!head || !/^block(-beta)?$/.test(head.text)) throw new DiagramError('A block diagram starts with "block-beta"', head?.line ?? 1, 1)
  const d: BlockDiagram = { type: 'block', items: [], edges: [], classDefs: new Map(), accessibility: {} }
  const stack: { items: BlockItem[]; group?: Extract<BlockItem, { kind: 'group' }>; line: number }[] = [{ items: d.items, line: head.line }]
  const ids = new Map<string, BlockItem>()
  const styles: { ids: string[]; style?: UserStyle; cls?: string; s: Statement }[] = []
  let count = 0
  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const consumed = accessibilityStatement(list, i, d.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    const top = stack[stack.length - 1]!
    let m: RegExpExecArray | null
    if ((m = /^columns\s+(\d+|auto)$/.exec(s.text))) {
      const n = m[1] === 'auto' ? undefined : Number(m[1])
      if (top.group) top.group.columns = n
      else d.columns = n
      continue
    }
    if ((m = new RegExp(`^block(?::(${ID}))?(?:\\["([^"]*)"\\])?(?::(\\d+))?$`, 'u').exec(s.text))) {
      const id = m[1] ?? `block${++count}`
      const group: Extract<BlockItem, { kind: 'group' }> = { kind: 'group', id, label: m[2], span: m[3] ? Number(m[3]) : 1, items: [], classes: [] }
      top.items.push(group)
      ids.set(id, group)
      stack.push({ items: group.items, group, line: s.line })
      continue
    }
    if (s.text === 'end') {
      if (stack.length === 1) throw new DiagramError('"end" without a block to close', s.line, s.column)
      stack.pop()
      continue
    }
    if ((m = EDGE.exec(s.text))) {
      const arrowToken = m[4]!
      d.edges.push({
        from: m[1]!,
        to: m[5]!,
        text: m[3],
        stroke: arrowToken.includes('.') ? 'dotted' : arrowToken.startsWith('=') ? 'thick' : 'normal',
        arrow: arrowToken.endsWith('>'),
      })
      continue
    }
    if ((m = /^classDef\s+([\w,-]+)\s+(.+)$/.exec(s.text))) {
      const style = parseStyle(m[2]!, s.line, s.column)
      for (const n of m[1]!.split(',')) d.classDefs.set(n.trim(), style)
      continue
    }
    if ((m = /^class\s+(.+?)\s+([\w-]+)$/.exec(s.text))) {
      styles.push({ ids: m[1]!.split(',').map((x) => x.trim()), cls: m[2], s })
      continue
    }
    if ((m = /^style\s+(\S+)\s+(.+)$/.exec(s.text))) {
      styles.push({ ids: [m[1]!], style: parseStyle(m[2]!, s.line, s.column), s })
      continue
    }
    for (const token of tokens(s.text)) {
      const item = block(token, s)
      if (item.kind === 'block') {
        if (ids.has(item.id)) throw new DiagramError(`The block "${item.id}" is declared twice`, s.line, s.column)
        ids.set(item.id, item)
      }
      top.items.push(item)
      if (++count > MAX_BLOCKS) throw tooLarge('blocks', count, MAX_BLOCKS)
    }
  }
  if (stack.length > 1) throw new DiagramError('A block is never closed', stack[stack.length - 1]!.line, 0, 'Close it with "end".')
  for (const e of d.edges) {
    for (const id of [e.from, e.to]) if (!ids.has(id)) throw new DiagramError(`"${id}" is not a block`)
  }
  for (const st of styles) {
    for (const id of st.ids) {
      const item = ids.get(id)
      if (!item || item.kind === 'space') throw new DiagramError(`"${id}" is not a block`, st.s.line, st.s.column)
      if (st.cls) item.classes.push(st.cls)
      if (st.style) item.style = st.style
    }
  }
  return d
}

const GAP = 16
const PAD = 12

interface Placed {
  width: number
  height: number
  /** Draws at the top-left corner, in a cell `width` wide; records block boxes. */
  draw(x: number, y: number, width: number, height: number): SvgElement[]
}

export function renderBlock(d: BlockDiagram, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const boxes = new Map<string, { box: Box; shape: ShapeKind }>()
  const style = (item: { classes: string[]; style?: UserStyle }) => mergeStyles(d.classDefs.get('default'), ...item.classes.map((c) => d.classDefs.get(c)), item.style)

  const placeItem = (item: BlockItem): Placed => {
    if (item.kind === 'space') return { width: 0, height: 0, draw: () => [] }
    if (item.kind === 'block') {
      const l: MeasuredLabel = measureLabel(parseLabel(item.label), BASE_FONT, measure)
      const size = shapeSize(item.shape, l.width, Math.max(l.height, BASE_FONT.size * 1.25))
      return {
        width: size.width,
        height: size.height,
        draw: (x, y, w, h) => {
          const box = { x: x + w / 2, y: y + h / 2, width: Math.max(size.width, w), height: size.height }
          boxes.set(item.id, { box, shape: item.shape })
          const st = style(item)
          return [
            el('g', { class: 'dg-node', 'data-id': item.id }, [
              drawShape(item.shape, box, { style: cssText(st.shape) }),
              renderLabel(l, box.x, box.y, { style: cssText(st.text) }),
            ]),
          ]
        },
      }
    }
    return grid(item.items, item.columns, item)
  }

  const grid = (items: BlockItem[], columns: number | undefined, group?: Extract<BlockItem, { kind: 'group' }>): Placed => {
    const cols = Math.max(1, columns ?? items.reduce((a, it) => a + it.span, 0))
    // Row-major placement: an item goes to the next free cells of its span.
    const cells: { item: BlockItem; row: number; col: number; placed: Placed }[] = []
    let row = 0
    let col = 0
    for (const item of items) {
      const span = Math.min(item.span, cols)
      if (col + span > cols) {
        row++
        col = 0
      }
      cells.push({ item, row, col, placed: placeItem(item) })
      col += span
      if (col >= cols) {
        row++
        col = 0
      }
    }
    const rows = cells.length > 0 ? Math.max(...cells.map((c) => c.row)) + 1 : 0
    const colWidth = Math.max(60, ...cells.map((c) => (c.placed.width - GAP * (Math.min(c.item.span, cols) - 1)) / Math.min(c.item.span, cols)))
    const rowHeights = Array.from({ length: rows }, (_, r) => Math.max(0, ...cells.filter((c) => c.row === r).map((c) => c.placed.height)))
    const titleLabel = group?.label ? measureLabel(parseLabel(group.label), { ...BASE_FONT, weight: 'bold' }, measure) : null
    const pad = group ? PAD : 0
    const top = pad + (titleLabel ? titleLabel.height + 4 : 0)
    const width = cols * colWidth + (cols - 1) * GAP + pad * 2
    const height = rowHeights.reduce((a, b) => a + b, 0) + Math.max(0, rows - 1) * GAP + top + pad
    return {
      width,
      height,
      draw: (x, y, w) => {
        const out: SvgElement[] = []
        // A group stretched by its parent's cell gives its columns the extra width.
        const cw = (w - pad * 2 - (cols - 1) * GAP) / cols
        if (group) {
          boxes.set(group.id, { box: { x: x + w / 2, y: y + height / 2, width: w, height }, shape: 'rect' })
          const st = style(group)
          out.push(el('rect', { class: 'dg-block-group', x, y, width: w, height, rx: 6, style: cssText(st.shape) }))
          if (titleLabel) out.push(renderLabel(titleLabel, x + w / 2, y + pad + titleLabel.height / 2, { className: 'dg-block-group-title' }))
        }
        const rowTop = (r: number) => y + top + rowHeights.slice(0, r).reduce((a, b) => a + b, 0) + r * GAP
        for (const c of cells) {
          const span = Math.min(c.item.span, cols)
          const cx = x + pad + c.col * (cw + GAP)
          out.push(...c.placed.draw(cx, rowTop(c.row), cw * span + GAP * (span - 1), rowHeights[c.row]!))
        }
        return out
      },
    }
  }

  const root = grid(d.items, d.columns)
  const body = root.draw(0, 0, root.width, root.height)
  const edges: SvgElement[] = []
  const labels: SvgElement[] = []
  for (const e of d.edges) {
    const a = boxes.get(e.from)
    const b = boxes.get(e.to)
    if (!a || !b) continue
    const p1: Point = intersectShape(a.shape, a.box, b.box)
    const p2: Point = intersectShape(b.shape, b.box, a.box)
    edges.push(
      el('line', {
        class: `dg-edge${e.stroke === 'dotted' ? ' dg-edge-dotted' : e.stroke === 'thick' ? ' dg-edge-thick' : ''}`,
        x1: r(p1.x),
        y1: r(p1.y),
        x2: r(p2.x),
        y2: r(p2.y),
        'marker-end': e.arrow ? `url(#${markerId(id, 'arrow')})` : undefined,
      }),
    )
    if (e.text) {
      const l = measureLabel(parseLabel(e.text), BASE_FONT, measure)
      const mx = (p1.x + p2.x) / 2
      const my = (p1.y + p2.y) / 2
      labels.push(el('g', { class: 'dg-edge-label-group' }, [
        el('rect', { class: 'dg-edge-label-box', x: r(mx - l.width / 2 - 4), y: r(my - l.height / 2 - 2), width: r(l.width + 8), height: r(l.height + 4), rx: 3 }),
        renderLabel(l, r(mx), r(my), { className: 'dg-edge-label' }),
      ]))
    }
  }
  const s = `#${id}`
  const css = [
    `${s} .dg-block-group{fill:${v('--dg-cluster-fill')};stroke:${v('--dg-cluster-stroke')};stroke-width:1px}`,
    `${s} .dg-block-group-title{fill:${v('--dg-cluster-text')};font-weight:bold}`,
    `${s} .dg-edge-label-group text{fill:${v('--dg-text')}}`,
  ].join('')
  return documentSvg({
    id,
    type: 'block',
    width: root.width,
    height: root.height,
    title: title ?? d.accessibility.title ?? 'Block diagram',
    description: d.accessibility.description,
    defs: d.edges.some((e) => e.arrow) ? markerDefs(id, ['arrow']) : [],
    body: [el('g', { class: 'dg-blocks' }, body), el('g', { class: 'dg-edges' }, edges), el('g', { class: 'dg-edge-labels' }, labels)],
    css,
  })
}

function r(n: number): number {
  return Math.round(n * 100) / 100
}
