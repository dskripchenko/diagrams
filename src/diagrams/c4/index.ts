/**
 * C4 diagrams (`C4Context`, `C4Container`, `C4Component`, `C4Dynamic`,
 * `C4Deployment`). See parser.ts for the syntax, layout.ts for the
 * placement and render.ts for the drawing.
 */
export { parseC4 } from './parser'
export type { C4Diagram, C4Element, C4Boundary, C4Relation } from './parser'
export { renderC4 } from './render'
