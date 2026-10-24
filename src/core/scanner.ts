/**
 * Line-oriented scanning shared by the parsers.
 *
 * Every Mermaid grammar this package reads is line based: one statement per
 * line (or several separated by `;`). The scanner hands out statements with
 * their source position, so a parser can report "line 7, column 12" without
 * tracking offsets itself.
 */
import { DiagramError } from './errors'

export interface Statement {
  /** The statement text, trimmed. */
  text: string
  /** 1-based line. */
  line: number
  /** 1-based column of the first character of `text`. */
  column: number
}

/** Strips a `%%` comment that is not inside quotes. */
function stripComment(line: string): string {
  let quote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') quote = !quote
    if (!quote && ch === '%' && line[i + 1] === '%') {
      return line.slice(0, i)
    }
  }
  return line
}

export interface ScanOptions {
  /** Split statements on `;` outside quotes and brackets (flowchart does, others do not). */
  semicolons?: boolean
}

/**
 * Splits a source into statements: comments and blank lines dropped,
 * directives (`%%{ … }%%`) dropped, positions kept.
 */
export function statements(source: string, options: ScanOptions = {}): Statement[] {
  const out: Statement[] = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let inDirective = false
  lines.forEach((raw, index) => {
    const lineNo = index + 1
    if (inDirective) {
      if (raw.includes('}%%')) inDirective = false
      return
    }
    const trimmedStart = raw.trimStart()
    if (trimmedStart.startsWith('%%{')) {
      if (!raw.includes('}%%')) inDirective = true
      return
    }
    const line = stripComment(raw)
    const pieces = options.semicolons ? splitSemicolons(line) : [{ text: line, offset: 0 }]
    for (const piece of pieces) {
      const leading = piece.text.length - piece.text.trimStart().length
      const text = piece.text.trim()
      if (text.length === 0) continue
      out.push({ text, line: lineNo, column: piece.offset + leading + 1 })
    }
  })
  return out
}

function splitSemicolons(line: string): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = []
  let depth = 0
  let quote = false
  let start = 0
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') quote = !quote
    if (quote) continue
    if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1)
    else if (ch === ';' && depth === 0) {
      out.push({ text: line.slice(start, i), offset: start })
      start = i + 1
    }
  }
  out.push({ text: line.slice(start), offset: start })
  return out
}

/**
 * Reads the header line (`flowchart LR`, `pie showData`) and returns the
 * keyword, the rest of the line and the statements after it.
 */
export function header(source: string): { keyword: string; rest: string; statement: Statement } | null {
  const first = statements(source)[0]
  if (!first) return null
  const match = /^([A-Za-z][\w-]*)\s*(.*)$/.exec(first.text)
  if (!match) return null
  return { keyword: match[1]!, rest: match[2]!.trim(), statement: first }
}

/** A cursor over one statement, for parsers that tokenise within a line. */
export class Cursor {
  pos = 0

  constructor(
    readonly statement: Statement,
    readonly text = statement.text,
  ) {}

  get done(): boolean {
    return this.pos >= this.text.length
  }

  peek(offset = 0): string {
    return this.text[this.pos + offset] ?? ''
  }

  rest(): string {
    return this.text.slice(this.pos)
  }

  skipSpaces(): void {
    while (!this.done && /\s/.test(this.text[this.pos]!)) this.pos++
  }

  startsWith(token: string): boolean {
    return this.text.startsWith(token, this.pos)
  }

  /** Consumes `token` when it is next. */
  eat(token: string): boolean {
    if (this.startsWith(token)) {
      this.pos += token.length
      return true
    }
    return false
  }

  /** Consumes a match of `pattern` (which must be sticky-safe: no `^` needed). */
  match(pattern: RegExp): RegExpExecArray | null {
    const sticky = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'y')
    sticky.lastIndex = this.pos
    const result = sticky.exec(this.text)
    if (result) this.pos += result[0].length
    return result
  }

  column(at = this.pos): number {
    return this.statement.column + at
  }

  error(message: string, hint?: string, at = this.pos): DiagramError {
    return new DiagramError(message, this.statement.line, this.column(at), hint)
  }
}

/** Removes surrounding double quotes, if any. */
export function unquote(text: string): string {
  const t = text.trim()
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1)
  }
  return t
}
