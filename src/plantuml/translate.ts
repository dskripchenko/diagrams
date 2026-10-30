/**
 * PlantUML class and state diagrams are close to Mermaid's: the statements
 * are rewritten into Mermaid's and read by its parsers, which already know
 * every rule of those diagrams. An error from the Mermaid parser is moved
 * back to the PlantUML statement it came from.
 */
import { DiagramError } from '../core/errors'
import type { Statement } from '../core/scanner'

export class Translation {
  private readonly lines: { text: string; from: Statement | null }[]

  constructor(header: string) {
    this.lines = [{ text: header, from: null }]
  }

  /** Adds a Mermaid line written for a PlantUML statement. */
  add(text: string, from: Statement): void {
    this.lines.push({ text, from })
  }

  get source(): string {
    return this.lines.map((l) => l.text).join('\n')
  }

  /** Runs a Mermaid parser on the translation; its errors point at the PlantUML source. */
  parse<T>(parser: (source: string) => T): T {
    try {
      return parser(this.source)
    } catch (e) {
      if (!(e instanceof DiagramError)) throw e
      const from = e.line > 0 ? this.lines[e.line - 1]?.from : null
      const message = e.message.replace(/ \(line \d+(, column \d+)?\)$/, '')
      throw new DiagramError(message, from?.line ?? 0, from?.column ?? 0, e.hint)
    }
  }
}

/**
 * A declaration's colour or style suffix (`#pink`, `#pink;line:red`,
 * `##[dashed]blue`) removed, before an optional `{`. Only for declarations:
 * in a label, `#1` is text.
 */
export function withoutColour(text: string): string {
  return text.replace(/\s+##?(?:\[[^\]]*\])?[\w;:,.#-]*(?=\s*\{?\s*$)/, '')
}

/** A link's arrow with PlantUML's direction words and styles taken out: `-up->` → `-->`. */
export function plainArrow(arrow: string): string {
  return arrow
    .replace(/\[[^\]]*\]/g, '')
    .replace(/(up|down|left|right|le|ri|do|u|d|l|r)(?=[-.])/gi, '')
}
