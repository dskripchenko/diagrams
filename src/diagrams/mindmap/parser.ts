/**
 * Mind maps: a tree written as an indented outline.
 *
 *     mindmap
 *       root((Project))
 *         Goals
 *           id1[Ship 2.0]
 *           ::icon(fa fa-rocket)
 *         Risks
 *           id2))Deadline((
 *
 * A node's parent is the nearest node above it that is indented less —
 * Mermaid's rule, which tolerates uneven indentation. Every whitespace
 * character counts as one column, tabs included. There is one root: a
 * second node at the root's level is an error.
 */
import { DiagramError, tooLarge } from '../../core/errors'
import { statements, type Statement } from '../../core/scanner'
import { accessibilityStatement, type Accessibility } from '../common'

export type MindmapShape = 'default' | 'square' | 'rounded' | 'circle' | 'bang' | 'cloud' | 'hexagon'

export interface MindmapNode {
  id: string
  /** The text as written; `markdown` says whether `**` and `*` style it. */
  label: string
  markdown: boolean
  shape: MindmapShape
  /** `::icon(…)` is read and kept, but not drawn: there is no icon font to draw it with. */
  icon?: string
  /** `:::name` classes, kept for tools; Mermaid's mind maps have no classDef to apply them. */
  classes: string[]
  children: MindmapNode[]
  line: number
  column: number
}

export interface MindmapDiagram {
  type: 'mindmap'
  root: MindmapNode
  accessibility: Accessibility
}

const MAX_NODES = 500

/** Openers in the order they must be tried: longer delimiters first. */
const SHAPES: { open: string; close: string; shape: MindmapShape }[] = [
  { open: '((', close: '))', shape: 'circle' },
  { open: '))', close: '((', shape: 'bang' },
  { open: '{{', close: '}}', shape: 'hexagon' },
  { open: '(', close: ')', shape: 'rounded' },
  { open: ')', close: '(', shape: 'cloud' },
  { open: '[', close: ']', shape: 'square' },
]

/** Whether `text` opens a "`markdown string`" that does not close on the same line. */
function opensMarkdown(text: string): boolean {
  const open = text.indexOf('"`')
  return open >= 0 && text.indexOf('`"', open + 2) < 0
}

interface Parsed {
  id: string
  label: string
  markdown: boolean
  shape: MindmapShape
  icon?: string
  classes: string[]
}

/** `"text"` or "`markdown`" as the whole of `text`, or null. */
function unquoteLabel(text: string): { label: string; markdown: boolean } | null {
  const t = text.trim()
  if (t.length < 2 || !t.startsWith('"') || !t.endsWith('"')) return null
  const inner = t.slice(1, -1)
  if (inner.length >= 2 && inner.startsWith('`') && inner.endsWith('`')) {
    return { label: inner.slice(1, -1), markdown: true }
  }
  return { label: inner, markdown: false }
}

function parseNode(text: string, s: Statement, autoId: () => string): Parsed {
  let rest = text
  let icon: string | undefined
  const classes: string[] = []
  // Trailing decorations: `::icon(…)` and `:::class`, in either order.
  for (;;) {
    const iconMatch = /\s*::icon\(([^)]*)\)\s*$/.exec(rest)
    if (iconMatch && !rest.slice(0, iconMatch.index).endsWith(':')) {
      icon = iconMatch[1]!.trim()
      rest = rest.slice(0, iconMatch.index)
      continue
    }
    const classMatch = /\s*:::\s*([\w-]+(?:\s+[\w-]+)*)\s*$/.exec(rest)
    if (classMatch) {
      classes.unshift(...classMatch[1]!.split(/\s+/))
      rest = rest.slice(0, classMatch.index)
      continue
    }
    break
  }
  rest = rest.trimEnd()

  const quoted = unquoteLabel(rest)
  if (quoted) {
    // Quoted text without a shape: brackets inside it are text.
    return { id: autoId(), ...quoted, shape: 'default', icon, classes }
  }
  const start = rest.search(/[[(){}]/)
  if (start < 0) {
    return { id: rest, label: rest, markdown: false, shape: 'default', icon, classes }
  }
  const spec = SHAPES.find((candidate) => rest.startsWith(candidate.open, start))
  if (!spec) {
    throw new DiagramError(
      `"${rest[start]}" does not start a node shape`,
      s.line,
      s.column + start,
      'Shapes: [square], (rounded), ((circle)), ))bang((, )cloud(, {{hexagon}}',
    )
  }
  if (!rest.endsWith(spec.close) || rest.length < start + spec.open.length + spec.close.length) {
    throw new DiagramError(
      `The "${spec.open}" shape is not closed at the end of the line`,
      s.line,
      s.column + start,
      `End the node with "${spec.close}", or put text with brackets in quotes: id["text (note)"]`,
    )
  }
  const raw = rest.slice(start + spec.open.length, rest.length - spec.close.length)
  const { label: inner, markdown } = unquoteLabel(raw) ?? { label: raw.trim(), markdown: false }
  if (inner.trim() === '') {
    throw new DiagramError('The node has no text', s.line, s.column + start, `Write id${spec.open}text${spec.close}`)
  }
  const id = rest.slice(0, start).trim()
  return { id: id === '' ? autoId() : id, label: inner, markdown, shape: spec.shape, icon, classes }
}

export function parseMindmap(source: string): MindmapDiagram {
  const list = statements(source)
  const head = list[0]
  const m = head ? /^mindmap\b\s*(.*)$/.exec(head.text) : null
  if (!head || !m) {
    throw new DiagramError('A mind map starts with "mindmap"', head?.line ?? 1, 1)
  }
  if (m[1]!.trim() !== '') {
    throw new DiagramError(`Unexpected "${m[1]!.trim()}" after "mindmap"`, head.line, head.column + 8, 'Put the root on the next line')
  }

  const accessibility: Accessibility = {}
  let root: MindmapNode | null = null
  let last: MindmapNode | null = null
  let count = 0
  // The chain from the root to the last node, with each one's indentation.
  const stack: { node: MindmapNode; indent: number }[] = []
  const autoId = () => `node-${count}`

  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const consumed = accessibilityStatement(list, i, accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    const indent = s.column - 1
    let text = s.text
    // A markdown string may run over several lines.
    while (opensMarkdown(text)) {
      if (i + 1 >= list.length) {
        throw new DiagramError('The markdown string is not closed', s.line, s.column + text.indexOf('"`'), 'End it with `"')
      }
      i++
      text += '\n' + list[i]!.text
    }

    const decoration = /^(::icon\(([^)]*)\)|:::\s*([\w-]+(?:\s+[\w-]+)*))$/.exec(text)
    if (decoration) {
      if (!last) {
        throw new DiagramError(`"${text}" comes before any node`, s.line, s.column, 'Put it under the node it belongs to')
      }
      if (decoration[2] !== undefined) last.icon = decoration[2].trim()
      else last.classes.push(...decoration[3]!.split(/\s+/))
      continue
    }

    const parsed = parseNode(text, s, autoId)
    const node: MindmapNode = { ...parsed, children: [], line: s.line, column: s.column }
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop()
    const parent = stack[stack.length - 1]
    if (!parent) {
      if (root) {
        throw new DiagramError(
          `A mind map has one root; "${parsed.label}" is a second one`,
          s.line,
          s.column,
          `Indent it under "${root.label}" (line ${root.line})`,
        )
      }
      root = node
    } else {
      parent.node.children.push(node)
    }
    stack.push({ node, indent })
    last = node
    count++
    if (count > MAX_NODES) throw tooLarge('nodes', count, MAX_NODES)
  }
  if (!root) {
    throw new DiagramError('The mind map is empty', 0, 0, 'Add a root node on the line after "mindmap"')
  }
  return { type: 'mindmap', root, accessibility }
}
