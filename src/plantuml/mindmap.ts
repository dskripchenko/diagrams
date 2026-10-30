/**
 * PlantUML mind maps (`@startmindmap`) and work breakdown structures
 * (`@startwbs`), read into the mind map model.
 *
 *     @startmindmap
 *     * Release
 *     ** Backend
 *     *** API
 *     ** Frontend
 *     left side
 *     ** Docs
 *     @endmindmap
 *
 * Supported: depth by repeated `*`, `+` or `-` (OrgMode), or `#`; boxless
 * nodes (`*_`); colours (`*[#Orange]`), accepted; nodes over several lines
 * (`**:first` … `last;`); `left side` / `right side`, accepted (the layout
 * places branches itself). A work breakdown structure is drawn as a mind
 * map of the same tree.
 */
import { DiagramError, tooLarge } from '../core/errors'
import type { MindmapDiagram, MindmapNode } from '../diagrams/mindmap/parser'
import { labelText, type PlantUmlSource } from './source'

const NODE = /^([*+#-])\1*(?=[_[:\s])/
const MAX_NODES = 500

export function parsePlantUmlMindmap(src: PlantUmlSource): MindmapDiagram {
  const list = src.statements
  const stack: { depth: number; node: MindmapNode }[] = []
  let root: MindmapNode | null = null
  let count = 0
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!
    if (/^(left|right)\s+side$/i.test(s.text)) continue
    const m = NODE.exec(s.text)
    if (!m) throw new DiagramError(`"${s.text}" is not a node`, s.line, s.column, 'Start each node with stars: * root, ** child.')
    const depth = m[0].length
    let rest = s.text.slice(depth)
    const boxless = rest.startsWith('_')
    if (boxless) rest = rest.slice(1)
    rest = rest.replace(/^\[[^\]]*\]/, '')
    let text = rest.trim()
    // `**:first line` … `last line;`
    if (text.startsWith(':')) {
      const lines = [text.slice(1)]
      while (!lines[lines.length - 1]!.trimEnd().endsWith(';')) {
        i++
        if (i >= list.length) throw new DiagramError('This node is never closed', s.line, s.column, 'End it with ";".')
        lines.push(list[i]!.text)
      }
      lines[lines.length - 1] = lines[lines.length - 1]!.trimEnd().slice(0, -1)
      text = lines.join('<br>')
    }
    if (++count > MAX_NODES) throw tooLarge('nodes', count, MAX_NODES)
    const node: MindmapNode = {
      id: `n${count}`,
      label: labelText(text),
      markdown: false,
      shape: boxless ? 'default' : 'rounded',
      classes: [],
      children: [],
      line: s.line,
      column: s.column,
    }
    if (!root) {
      if (depth !== 1) throw new DiagramError('The first node is the root, with one star', s.line, s.column)
      root = node
      stack.push({ depth, node })
      continue
    }
    if (depth === 1) throw new DiagramError('A mind map has one root', s.line, s.column, 'Give the other top-level nodes two stars.')
    while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) stack.pop()
    const parent = stack[stack.length - 1]
    if (!parent) throw new DiagramError('This node has no parent', s.line, s.column)
    parent.node.children.push(node)
    stack.push({ depth, node })
  }
  if (!root) throw new DiagramError('The mind map is empty', 0, 0)
  return { type: 'mindmap', root, accessibility: src.title ? { title: src.title } : {} }
}
