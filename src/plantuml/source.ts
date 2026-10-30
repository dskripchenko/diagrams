/**
 * Reading a PlantUML source: the `@startuml … @enduml` frame, comments, and
 * the statements every PlantUML diagram shares (title, direction, styling
 * that this package takes from its themes instead).
 *
 * The result is a list of statements with their positions, like the Mermaid
 * scanner's, plus what the shared statements said; the diagram parsers never
 * see a comment, a `skinparam` or a `title`.
 */
import { DiagramError } from '../core/errors'
import type { Statement } from '../core/scanner'

/** What `@start…` opened. */
export type PlantUmlFrame = 'uml' | 'mindmap' | 'gantt' | 'salt' | 'wbs' | 'json' | 'yaml'

export interface PlantUmlSource {
  frame: PlantUmlFrame
  statements: Statement[]
  title?: string
  /** `left to right direction` / `top to bottom direction`. */
  direction?: 'LR' | 'TB'
  /** `hide footbox` (sequence). */
  hideFootbox: boolean
  /** The C4-PlantUML library included (`!include <C4/C4_Container>`): the diagram is C4 of that level. */
  c4?: 'C4Context' | 'C4Container' | 'C4Component' | 'C4Dynamic' | 'C4Deployment'
}

/** C4-PlantUML's library files and the C4 diagram each one is for. */
const C4_LIBRARIES: Record<string, NonNullable<PlantUmlSource['c4']>> = {
  c4: 'C4Context',
  c4_context: 'C4Context',
  c4_container: 'C4Container',
  c4_component: 'C4Component',
  c4_dynamic: 'C4Dynamic',
  c4_deployment: 'C4Deployment',
  c4_sequence: 'C4Dynamic',
}

/** The C4 level of a C4-PlantUML `!include`, or null for any other include. */
function c4Include(text: string): NonNullable<PlantUmlSource['c4']> | null {
  const m = /^!include(?:url)?\s+.*?\b(C4(?:_\w+)?)(?:\.puml)?\s*>?\s*$/i.exec(text)
  return m ? (C4_LIBRARIES[m[1]!.toLowerCase()] ?? null) : null
}

const FRAMES: Record<string, PlantUmlFrame> = {
  startuml: 'uml',
  startmindmap: 'mindmap',
  startgantt: 'gantt',
  startsalt: 'salt',
  startwbs: 'wbs',
  startjson: 'json',
  startyaml: 'yaml',
}

/** True when the source is PlantUML: its first non-blank line is `@start…`. */
export function isPlantUml(source: string): boolean {
  const first = source.replace(/^\uFEFF/, '').split(/\r\n?|\n/).find((l) => l.trim() !== '')
  return first !== undefined && /^\s*@start[a-z]+\b/i.test(first)
}

/** Strips a `'` comment that is not inside quotes; `''` is a comment too. */
function stripLineComment(line: string): string {
  let quote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') quote = !quote
    // A quote mark starts a comment only at the start of a statement or after spaces:
    // `it's` inside a message is text.
    if (!quote && ch === "'" && (i === 0 || /\s/.test(line[i - 1]!)) && line.slice(0, i).trim() === '') return ''
  }
  return line
}

/** Preprocessor directives a rendering library cannot honour: no files, no network. */
const UNSUPPORTED_DIRECTIVE = /^!(include|includeurl|includesub|import|define|definelong|procedure|function|unquoted|if|ifdef|ifndef|while|foreach|local|global|\$)/i

/** Statements that only style the picture: the themes do that here. */
const STYLING = /^(skinparam\b|!theme\b|!pragma\b|scale\b|(hide|remove|restore)\s+(empty\s+)?(members|methods|fields|attributes|circle|stereotype|unlinked|@unlinked|description|private|protected|package|public|\$\w+|<<[^>]*>>)|show\s|allowmixing\b|allow_mixing\b|set\s+namespaceSeparator|autoactivate\b|skin\b|newpage\b|mainframe\b)/i

export function readPlantUml(source: string): PlantUmlSource {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const out: PlantUmlSource = { frame: 'uml', statements: [], hideFootbox: false }
  let started = false
  let ended = false
  let blockComment = false
  // Blocks whose content is skipped: `skinparam x { … }`, `<style> … </style>`, legend, header, footer.
  let skipping: RegExp | null = null
  let title: string[] | null = null

  for (let index = 0; index < lines.length; index++) {
    const lineNo = index + 1
    let raw = lines[index]!

    if (blockComment) {
      const close = raw.indexOf("'/")
      if (close < 0) continue
      blockComment = false
      raw = ' '.repeat(close + 2) + raw.slice(close + 2)
    }
    // Block comments, possibly several on one line.
    for (;;) {
      const open = raw.indexOf("/'")
      if (open < 0) break
      const close = raw.indexOf("'/", open + 2)
      if (close < 0) {
        raw = raw.slice(0, open)
        blockComment = true
        break
      }
      raw = raw.slice(0, open) + ' '.repeat(close + 2 - open) + raw.slice(close + 2)
    }

    const text = stripLineComment(raw)
    const trimmed = text.trim()
    if (trimmed === '') continue
    const column = text.length - text.trimStart().length + 1

    if (!started) {
      const m = /^@(start[a-z]+)\b/i.exec(trimmed)
      if (!m) {
        throw new DiagramError('A PlantUML diagram starts with "@startuml"', lineNo, column)
      }
      const frame = FRAMES[m[1]!.toLowerCase()]
      if (!frame) {
        throw new DiagramError(`"@${m[1]}" is not a supported PlantUML diagram`, lineNo, column, `Supported: ${Object.keys(FRAMES).map((f) => `@${f}`).join(', ')}.`)
      }
      out.frame = frame
      started = true
      continue
    }
    if (/^@end[a-z]+\b/i.test(trimmed)) {
      ended = true
      break
    }

    if (skipping) {
      if (skipping.test(trimmed)) skipping = null
      continue
    }
    if (title) {
      if (/^end\s*title$/i.test(trimmed)) {
        out.title = title.join('\n')
        title = null
      } else {
        title.push(trimmed)
      }
      continue
    }

    const c4 = c4Include(trimmed)
    if (c4) {
      // The deepest level included wins: a component diagram includes the container library too.
      const order = ['C4Context', 'C4Container', 'C4Component', 'C4Deployment', 'C4Dynamic']
      if (!out.c4 || order.indexOf(c4) > order.indexOf(out.c4)) out.c4 = c4
      continue
    }
    if (UNSUPPORTED_DIRECTIVE.test(trimmed)) {
      throw new DiagramError(
        `The preprocessor directive "${trimmed.split(/\s/)[0]}" is not supported`,
        lineNo,
        column,
        'The renderer reads one source with no files or variables: write the diagram out in full.',
      )
    }
    if (/^skinparam\b[^{]*\{\s*$/i.test(trimmed)) {
      skipping = /^\}$/
      continue
    }
    if (/^<style>/i.test(trimmed)) {
      if (!/<\/style>/i.test(trimmed)) skipping = /<\/style>/i
      continue
    }
    if (/^(legend|header|footer|caption)\b/i.test(trimmed) && !/:/.test(trimmed) && /^(legend|header|footer)(\s+(left|right|center|top|bottom))*\s*$/i.test(trimmed)) {
      skipping = /^end\s*(legend|header|footer)$/i
      continue
    }
    if (/^(header|footer|caption|legend)\b/i.test(trimmed)) continue
    if (STYLING.test(trimmed)) continue
    if (/^hide\s+footbox$/i.test(trimmed)) {
      out.hideFootbox = true
      continue
    }
    if (/^left\s+to\s+right\s+direction$/i.test(trimmed)) {
      out.direction = 'LR'
      continue
    }
    if (/^top\s+to\s+bottom\s+direction$/i.test(trimmed)) {
      out.direction = 'TB'
      continue
    }
    const t = /^title(?:\s*:\s*|\s+)(.*)$/i.exec(trimmed)
    if (t) {
      out.title = t[1]!.trim().replace(/\\n/g, '\n')
      continue
    }
    if (/^title$/i.test(trimmed)) {
      title = []
      continue
    }

    out.statements.push({ text: trimmed, line: lineNo, column })
  }

  if (!started) throw new DiagramError('The diagram is empty', 0, 0)
  if (!ended) {
    throw new DiagramError('The diagram has no "@enduml"', lines.length, 0, 'End it with @enduml.')
  }
  if (blockComment) throw new DiagramError("A block comment /' … is never closed", lines.length, 0, "Close it with '/.")
  return out
}

/** PlantUML's `\n` in a label is a line break; the shared label reader breaks on `<br>`. */
export function labelText(text: string): string {
  return text.replace(/\\n/g, '<br>')
}

/** Strips one pair of double quotes. */
export function unquoted(text: string): string {
  const t = text.trim()
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t
}
