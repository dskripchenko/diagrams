/**
 * @dskripchenko/diagrams — Mermaid-syntax diagrams to SVG, with no runtime
 * dependencies and no DOM.
 *
 *     import { render } from '@dskripchenko/diagrams'
 *     const { svg } = render('flowchart LR\n  A --> B')
 */
import { DiagramError } from './core/errors'
import { hashId, sanitizeId, type RenderOptions, type RenderResult } from './core/document'
import { defaultMeasurer } from './core/text'
import { header } from './core/scanner'
import { parsePie, renderPie } from './diagrams/pie'
import { parseGantt, renderGantt } from './diagrams/gantt'
import { parseFlowchart, renderFlowchart } from './diagrams/flowchart'
import { parseSequence, renderSequence } from './diagrams/sequence'
import { parseState, renderState } from './diagrams/state'
import { parseC4, renderC4 } from './diagrams/c4'

export { DiagramError } from './core/errors'
export type { RenderOptions, RenderResult } from './core/document'
export type { TextMeasurer, FontSpec, TextSize } from './core/text'
export { approximateMeasurer, defaultMeasurer } from './core/text'
export { VARIABLES as THEME_VARIABLES } from './core/theme'

export type DiagramType = 'pie' | 'gantt' | 'flowchart' | 'sequence' | 'state' | 'c4'

interface DiagramModule {
  parse(source: string): unknown
  render(
    ast: never,
    measure: NonNullable<RenderOptions['measureText']>,
    id: string,
    title?: string,
    today?: Date,
  ): RenderResult
}

const MODULES: Record<DiagramType, DiagramModule> = {
  pie: { parse: parsePie, render: renderPie as DiagramModule['render'] },
  // The today line only with `options.today`: otherwise output would depend on the clock.
  gantt: { parse: parseGantt, render: renderGantt as DiagramModule['render'] },
  flowchart: { parse: parseFlowchart, render: renderFlowchart as DiagramModule['render'] },
  sequence: { parse: parseSequence, render: renderSequence as DiagramModule['render'] },
  state: { parse: parseState, render: renderState as DiagramModule['render'] },
  c4: { parse: parseC4, render: renderC4 as DiagramModule['render'] },
}

const KEYWORDS: Record<string, DiagramType> = {
  pie: 'pie',
  gantt: 'gantt',
  flowchart: 'flowchart',
  graph: 'flowchart',
  'flowchart-elk': 'flowchart',
  sequenceDiagram: 'sequence',
  stateDiagram: 'state',
  'stateDiagram-v2': 'state',
  C4Context: 'c4',
  C4Container: 'c4',
  C4Component: 'c4',
  C4Dynamic: 'c4',
  C4Deployment: 'c4',
}

/** The diagram type a source declares on its first line, or null. */
export function detect(source: string): DiagramType | null {
  const head = header(source)
  if (!head) return null
  return KEYWORDS[head.keyword] ?? null
}

function moduleFor(source: string): DiagramModule {
  const head = header(source)
  if (!head) {
    throw new DiagramError('The diagram is empty', 0, 0)
  }
  const type = KEYWORDS[head.keyword]
  if (!type) {
    throw new DiagramError(
      `"${head.keyword}" is not a supported diagram type`,
      head.statement.line,
      head.statement.column,
      `Supported: ${Object.keys(KEYWORDS).join(', ')}.`,
    )
  }
  return MODULES[type]
}

/** Parses without laying out: the diagram's structure, for tools and tests. */
export function parse(source: string): unknown {
  return moduleFor(source).parse(source)
}

/**
 * Renders a diagram to an SVG string.
 *
 * @throws DiagramError when the source cannot be read; the error carries the line and column.
 */
export function render(source: string, options: RenderOptions = {}): RenderResult {
  const mod = moduleFor(source)
  const ast = mod.parse(source)
  const id = sanitizeId(options.idPrefix ?? hashId(source))
  return mod.render(ast as never, options.measureText ?? defaultMeasurer(), id, options.title, options.today)
}
