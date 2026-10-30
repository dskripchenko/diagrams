/**
 * @dskripchenko/diagrams — diagrams from text (Mermaid and PlantUML
 * syntaxes) to SVG, with no runtime dependencies and no DOM.
 *
 *     import { render } from '@dskripchenko/diagrams'
 *     const { svg } = render('flowchart LR\n  A --> B')
 *     const { svg: uml } = render('@startuml\nAlice -> Bob : hi\n@enduml')
 */
import { DiagramError } from './core/errors'
import { hashId, sanitizeId, type RenderOptions, type RenderResult, type Syntax } from './core/document'
import { isPlantUml, parsePlantUml } from './plantuml'
import { defaultMeasurer } from './core/text'
import { header } from './core/scanner'
import { parsePie, renderPie } from './diagrams/pie'
import { parseGantt, renderGantt } from './diagrams/gantt'
import { parseFlowchart, renderFlowchart } from './diagrams/flowchart'
import { parseSequence, renderSequence } from './diagrams/sequence'
import { parseState, renderState } from './diagrams/state'
import { parseTimeline, renderTimeline } from './diagrams/timeline'
import { parseXyChart, renderXyChart } from './diagrams/xychart'
import { parseMindmap, renderMindmap } from './diagrams/mindmap'
import { parseEr, renderEr } from './diagrams/er'
import { parseClass, renderClass } from './diagrams/class'
import { parseC4, renderC4 } from './diagrams/c4'

export { DiagramError } from './core/errors'
export type { RenderOptions, RenderResult, Syntax } from './core/document'
export { parsePlantUml, plantUmlKind } from './plantuml'
export type { PlantUmlKind, ParsedPlantUml } from './plantuml'
export type { TextMeasurer, FontSpec, TextSize } from './core/text'
export { approximateMeasurer, defaultMeasurer } from './core/text'
export { VARIABLES as THEME_VARIABLES } from './core/theme'

export type DiagramType =
  | 'pie'
  | 'gantt'
  | 'flowchart'
  | 'sequence'
  | 'state'
  | 'timeline'
  | 'xychart'
  | 'mindmap'
  | 'er'
  | 'class'
  | 'c4'

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
  timeline: { parse: parseTimeline, render: renderTimeline as DiagramModule['render'] },
  xychart: { parse: parseXyChart, render: renderXyChart as DiagramModule['render'] },
  mindmap: { parse: parseMindmap, render: renderMindmap as DiagramModule['render'] },
  er: { parse: parseEr, render: renderEr as DiagramModule['render'] },
  class: { parse: parseClass, render: renderClass as DiagramModule['render'] },
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
  timeline: 'timeline',
  'xychart-beta': 'xychart',
  xychart: 'xychart',
  mindmap: 'mindmap',
  erDiagram: 'er',
  classDiagram: 'class',
  'classDiagram-v2': 'class',
  C4Context: 'c4',
  C4Container: 'c4',
  C4Component: 'c4',
  C4Dynamic: 'c4',
  C4Deployment: 'c4',
}

/** The syntax of a source: PlantUML when it starts with `@start…`, else Mermaid. */
export function detectSyntax(source: string): Syntax {
  return isPlantUml(source) ? 'plantuml' : 'mermaid'
}

/** What the model a PlantUML diagram is drawn with is called among the diagram types. */
function plantUmlType(source: string): DiagramType | null {
  try {
    return parsePlantUml(source).kind === 'sequence' ? 'sequence' : 'flowchart'
  } catch {
    return null
  }
}

/**
 * The diagram type of a source, or null: a Mermaid source declares it on its
 * first line; a PlantUML one is recognised from its statements and reported
 * as the type it is drawn as (`sequence`, or `flowchart` for use case,
 * component, deployment and activity diagrams).
 */
export function detect(source: string): DiagramType | null {
  if (isPlantUml(source)) return plantUmlType(source)
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
export function parse(source: string, options: { syntax?: Syntax } = {}): unknown {
  if ((options.syntax ?? detectSyntax(source)) === 'plantuml') return parsePlantUml(source).model
  return moduleFor(source).parse(source)
}

/**
 * Renders a diagram to an SVG string.
 *
 * @throws DiagramError when the source cannot be read; the error carries the line and column.
 */
export function render(source: string, options: RenderOptions = {}): RenderResult {
  const id = sanitizeId(options.idPrefix ?? hashId(source))
  const measure = options.measureText ?? defaultMeasurer()
  if ((options.syntax ?? detectSyntax(source)) === 'plantuml') {
    const { kind, model } = parsePlantUml(source)
    const mod = MODULES[kind === 'sequence' ? 'sequence' : 'flowchart']
    return mod.render(model as never, measure, id, options.title, options.today)
  }
  const mod = moduleFor(source)
  const ast = mod.parse(source)
  return mod.render(ast as never, measure, id, options.title, options.today)
}
