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
import { isPlantUml, parsePlantUml, PLANTUML_MODELS } from './plantuml'
import { looksLikeD2, parseD2 } from './syntax/d2'
import { isDbml, parseDbml } from './syntax/dbml'
import { isDot, parseDot } from './syntax/dot'
import { isStructurizr, parseStructurizr } from './syntax/structurizr'
import { isWardley, parseWardley, renderWardley } from './diagrams/wardley'
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
import { renderSalt } from './diagrams/salt'
import { parseJourney, renderJourney } from './diagrams/journey'
import { parseKanban, renderKanban } from './diagrams/kanban'
import { parseQuadrant, renderQuadrant } from './diagrams/quadrant'
import { parseRequirement } from './diagrams/requirement'
import { parseArchitecture } from './diagrams/architecture'
import { parseBlock, renderBlock } from './diagrams/block'
import { parseGitGraph, renderGitGraph } from './diagrams/gitgraph'
import { parseSankey, renderSankey } from './diagrams/sankey'
import { renderTiming } from './diagrams/timing'

export { DiagramError } from './core/errors'
export type { RenderOptions, RenderResult, Syntax } from './core/document'
export { parsePlantUml, plantUmlKind } from './plantuml'
export { parseDot } from './syntax/dot'
export { parseD2 } from './syntax/d2'
export { parseDbml } from './syntax/dbml'
export { parseStructurizr } from './syntax/structurizr'
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
  | 'journey'
  | 'quadrant'
  | 'kanban'
  | 'requirement'
  | 'architecture'
  | 'sankey'
  | 'gitgraph'
  | 'block'
  | 'wardley'
  // Drawn from PlantUML only.
  | 'timing'
  | 'salt'

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
  journey: { parse: parseJourney, render: renderJourney as DiagramModule['render'] },
  quadrant: { parse: parseQuadrant, render: renderQuadrant as DiagramModule['render'] },
  kanban: { parse: parseKanban, render: renderKanban as DiagramModule['render'] },
  // Drawn with the class and flowchart renderers.
  requirement: { parse: parseRequirement, render: renderClass as DiagramModule['render'] },
  architecture: { parse: parseArchitecture, render: renderFlowchart as DiagramModule['render'] },
  sankey: { parse: parseSankey, render: renderSankey as DiagramModule['render'] },
  gitgraph: { parse: parseGitGraph, render: renderGitGraph as DiagramModule['render'] },
  block: { parse: parseBlock, render: renderBlock as DiagramModule['render'] },
  wardley: { parse: parseWardley, render: renderWardley as DiagramModule['render'] },
  timing: { parse: () => plantUmlOnly('timing'), render: renderTiming as DiagramModule['render'] },
  salt: { parse: () => plantUmlOnly('salt'), render: renderSalt as DiagramModule['render'] },
}

function plantUmlOnly(type: string): never {
  throw new DiagramError(`${type} diagrams are written in PlantUML`, 0, 0, 'Start the source with @startuml.')
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
  journey: 'journey',
  quadrantChart: 'quadrant',
  kanban: 'kanban',
  requirementDiagram: 'requirement',
  'architecture-beta': 'architecture',
  'sankey-beta': 'sankey',
  sankey: 'sankey',
  gitGraph: 'gitgraph',
  'block-beta': 'block',
  block: 'block',
}

/**
 * The syntax of a source, from how it starts: `@start…` — PlantUML;
 * `digraph` or `graph name {` — DOT; `Table`, `Ref`, `Enum`, `Project` —
 * DBML; `workspace` — Structurizr; components with coordinates — a Wardley
 * map; a Mermaid keyword — Mermaid; key–value and edge statements — D2.
 * Anything else is read as Mermaid, whose error then names the keywords.
 */
export function detectSyntax(source: string): Syntax {
  if (isPlantUml(source)) return 'plantuml'
  if (isDot(source)) return 'dot'
  if (isDbml(source)) return 'dbml'
  if (isStructurizr(source)) return 'structurizr'
  if (isWardley(source)) return 'wardley'
  const head = header(source)
  if (head && KEYWORDS[head.keyword]) return 'mermaid'
  if (looksLikeD2(source)) return 'd2'
  return 'mermaid'
}

/** The other syntaxes: what each is parsed into and drawn as. */
const SYNTAXES: Record<Exclude<Syntax, 'mermaid' | 'plantuml'>, { type: DiagramType; parse: (source: string) => unknown }> = {
  dot: { type: 'flowchart', parse: parseDot },
  d2: { type: 'flowchart', parse: parseD2 },
  dbml: { type: 'er', parse: parseDbml },
  structurizr: { type: 'c4', parse: parseStructurizr },
  wardley: { type: 'wardley', parse: parseWardley },
}

/** What the model a PlantUML diagram is drawn with is called among the diagram types. */
function plantUmlType(source: string): DiagramType | null {
  try {
    return PLANTUML_MODELS[parsePlantUml(source).kind]
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
  const syntax = detectSyntax(source)
  if (syntax === 'plantuml') return plantUmlType(source)
  if (syntax !== 'mermaid') return SYNTAXES[syntax].type
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
  const syntax = options.syntax ?? detectSyntax(source)
  if (syntax === 'plantuml') return parsePlantUml(source).model
  if (syntax !== 'mermaid') return SYNTAXES[syntax].parse(source)
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
  const syntax = options.syntax ?? detectSyntax(source)
  if (syntax !== 'mermaid' && syntax !== 'plantuml') {
    const { type, parse: read } = SYNTAXES[syntax]
    return MODULES[type].render(read(source) as never, measure, id, options.title, options.today)
  }
  if (syntax === 'plantuml') {
    const { kind, model } = parsePlantUml(source)
    const mod = MODULES[PLANTUML_MODELS[kind]]
    return mod.render(model as never, measure, id, options.title, options.today)
  }
  const mod = moduleFor(source)
  const ast = mod.parse(source)
  return mod.render(ast as never, measure, id, options.title, options.today)
}
