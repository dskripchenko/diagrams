/**
 * Sequence diagrams.
 *
 *     sequenceDiagram
 *         participant A as Alice
 *         actor J as John
 *         A->>+J: Hello John, how are you?
 *         J-->>-A: Great!
 *
 * Supported: participants and actors with aliases, boxes, create/destroy,
 * every Mermaid arrow, activations, notes, autonumber, and the blocks loop,
 * alt/else, opt, par/and, critical/option, break and rect.
 */
import type { RenderResult } from '../../core/document'
import type { TextMeasurer } from '../../core/text'
import { layoutSequence } from './layout'
import { parseSequence, type SequenceDiagram } from './parser'
import { renderSequenceLayout } from './render'

export { parseSequence }
export type { SequenceDiagram } from './parser'

export function renderSequence(
  diagram: SequenceDiagram,
  measure: TextMeasurer,
  id: string,
  title?: string,
): RenderResult {
  const layout = layoutSequence(diagram, measure)
  return renderSequenceLayout(
    layout,
    id,
    title ?? diagram.accessibility.title ?? diagram.title ?? 'Sequence diagram',
    diagram.accessibility.description,
  )
}
