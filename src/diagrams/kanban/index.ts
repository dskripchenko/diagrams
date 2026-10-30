/**
 * Kanban boards: columns of cards.
 *
 *     kanban
 *       todo[To do]
 *         t1[Write the docs]
 *         t2[Release notes]@{ assigned: 'anna', ticket: DOC-12, priority: 'High' }
 *       doing[In progress]
 *         t3[Tests]
 *       done[Done]
 *
 * A column is a line indented less than the cards under it. A card is
 * `id[Text]`, `[Text]` or plain text, with optional metadata: `assigned`,
 * `ticket`, `priority` (`Very High`, `High`, `Low`, `Very Low`).
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { DiagramError } from '../../core/errors'
import { statements } from '../../core/scanner'
import { el, type SvgElement } from '../../core/svg'
import { measureLabel, parseLabel, renderLabel, wrapLabel, type TextMeasurer } from '../../core/text'
import { BASE_FONT, v } from '../../core/theme'
import { accessibilityStatement, type Accessibility } from '../common'

export type KanbanPriority = 'very-high' | 'high' | 'low' | 'very-low'

export interface KanbanCard {
  id: string
  text: string
  assigned?: string
  ticket?: string
  priority?: KanbanPriority
}

export interface KanbanColumn {
  id: string
  title: string
  cards: KanbanCard[]
}

export interface KanbanBoard {
  type: 'kanban'
  columns: KanbanColumn[]
  accessibility: Accessibility
}

/** `id[Text]`, `[Text]`, or text. */
function item(text: string): { id: string; text: string } {
  const m = /^([\w-]*)\[(.*)\]$/.exec(text.trim())
  if (m) return { id: m[1] || m[2]!, text: m[2]!.replace(/^"|"$/g, '') }
  return { id: text.trim(), text: text.trim() }
}

export function parseKanban(source: string): KanbanBoard {
  const list = statements(source)
  const head = list[0]
  if (!head || head.text !== 'kanban') throw new DiagramError('A kanban board starts with "kanban"', head?.line ?? 1, 1)
  const d: KanbanBoard = { type: 'kanban', columns: [], accessibility: {} }
  let columnIndent = -1
  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const consumed = accessibilityStatement(list, i, d.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    let text = s.text
    let meta: string | undefined
    const at = text.indexOf('@{')
    if (at >= 0) {
      if (!text.trimEnd().endsWith('}')) throw new DiagramError('The metadata is not closed', s.line, s.column + at, "@{ assigned: 'anna', priority: 'High' }")
      meta = text.slice(at + 2, text.lastIndexOf('}'))
      text = text.slice(0, at)
    }
    if (columnIndent < 0) columnIndent = s.column
    if (s.column <= columnIndent) {
      if (meta) throw new DiagramError('A column has no metadata', s.line, s.column)
      const c = item(text)
      d.columns.push({ id: c.id, title: c.text, cards: [] })
      columnIndent = s.column
      continue
    }
    const column = d.columns[d.columns.length - 1]
    if (!column) throw new DiagramError('A card belongs under a column', s.line, s.column)
    const c = item(text)
    const card: KanbanCard = { id: c.id, text: c.text }
    for (const part of (meta ?? '').split(',')) {
      const m = /^\s*(\w+)\s*:\s*['"]?(.*?)['"]?\s*$/.exec(part)
      if (!m) continue
      const key = m[1]!.toLowerCase()
      if (key === 'assigned') card.assigned = m[2]
      else if (key === 'ticket') card.ticket = m[2]
      else if (key === 'priority') {
        const p = m[2]!.toLowerCase().replace(/\s+/g, '-')
        if (!['very-high', 'high', 'low', 'very-low'].includes(p)) throw new DiagramError(`"${m[2]}" is not a priority`, s.line, s.column, 'Very High, High, Low, Very Low')
        card.priority = p as KanbanPriority
      } else throw new DiagramError(`"${key}" is not card metadata`, s.line, s.column, 'assigned, ticket, priority')
    }
    column.cards.push(card)
  }
  if (d.columns.length === 0) throw new DiagramError('The board has no columns', 0, 0, 'todo[To do]\n  t1[A card]')
  return d
}

const COLUMN_WIDTH = 200
const GAP = 14

export function renderKanban(d: KanbanBoard, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const small = { ...BASE_FONT, size: 12 }
  const bold = { ...BASE_FONT, weight: 'bold' as const }
  // First the sizes, so every lane can reach the tallest one.
  const columns = d.columns.map((column) => {
    const titleLabel = measureLabel(wrapLabel(parseLabel(column.title), COLUMN_WIDTH - 20, bold, measure), bold, measure)
    let y = titleLabel.height + 22
    const cards = column.cards.map((card) => {
      const text = measureLabel(wrapLabel(parseLabel(card.text), COLUMN_WIDTH - 36, BASE_FONT, measure), BASE_FONT, measure)
      const h = text.height + 20 + (card.ticket || card.assigned ? 20 : 0)
      const placed = { card, text, y, h }
      y += h + 8
      return placed
    })
    return { column, titleLabel, cards, height: Math.max(y + 4, 80) }
  })
  const height = Math.max(...columns.map((c) => c.height))
  const body: SvgElement[] = columns.map(({ column, titleLabel, cards }, k) => {
    const x = k * (COLUMN_WIDTH + GAP)
    return el('g', { class: 'dg-kanban-column', 'data-id': column.id }, [
      el('rect', { class: 'dg-kanban-lane', x, y: 0, width: COLUMN_WIDTH, height, rx: 6 }),
      renderLabel(titleLabel, x + COLUMN_WIDTH / 2, 11 + titleLabel.height / 2, { className: 'dg-kanban-title' }),
      ...cards.map(({ card, text, y, h }) => {
        const parts: SvgElement[] = [
          el('rect', { class: 'dg-kanban-card', x: x + 8, y, width: COLUMN_WIDTH - 16, height: h, rx: 5 }),
          renderLabel(text, x + 22, y + 10 + text.height / 2, { anchor: 'start', className: 'dg-kanban-text' }),
        ]
        if (card.priority) parts.push(el('rect', { class: `dg-kanban-priority dg-kanban-${card.priority}`, x: x + 8, y, width: 5, height: h, rx: 2 }))
        if (card.ticket) parts.push(renderLabel(measureLabel(parseLabel(card.ticket), small, measure), x + 22, y + h - 12, { anchor: 'start', className: 'dg-kanban-meta' }))
        if (card.assigned) parts.push(renderLabel(measureLabel(parseLabel(card.assigned), small, measure), x + COLUMN_WIDTH - 18, y + h - 12, { anchor: 'end', className: 'dg-kanban-meta' }))
        return el('g', { class: 'dg-kanban-item', 'data-id': card.id }, parts)
      }),
    ])
  })
  const r = `#${id}`
  const css = [
    `${r} .dg-kanban-lane{fill:${v('--dg-cluster-fill')};stroke:${v('--dg-cluster-stroke')};stroke-width:1px}`,
    `${r} .dg-kanban-title{fill:${v('--dg-cluster-text')};font-weight:bold}`,
    `${r} .dg-kanban-card{fill:${v('--dg-row-fill')};stroke:${v('--dg-node-stroke')};stroke-width:1px}`,
    `${r} .dg-kanban-text{fill:${v('--dg-text')}}`,
    `${r} .dg-kanban-meta{fill:${v('--dg-text-muted')};font-size:12px}`,
    `${r} .dg-kanban-very-high{fill:${v('--dg-task-crit-stroke')}}`,
    `${r} .dg-kanban-high{fill:${v('--dg-task-crit-fill')}}`,
    `${r} .dg-kanban-low{fill:${v('--dg-task-active-fill')}}`,
    `${r} .dg-kanban-very-low{fill:${v('--dg-grid')}}`,
  ].join('')
  return documentSvg({
    id,
    type: 'kanban',
    width: d.columns.length * (COLUMN_WIDTH + GAP) - GAP,
    height,
    title: title ?? d.accessibility.title ?? 'Kanban board',
    description: d.accessibility.description,
    body,
    css,
  })
}
