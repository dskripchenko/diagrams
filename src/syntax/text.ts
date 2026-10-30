/**
 * Helpers shared by the readers of the other text syntaxes (DBML, DOT, D2,
 * Structurizr): comments out, positions kept, quoted strings read.
 */
import type { Statement } from '../core/scanner'

/**
 * The source's lines with `//`, `#` (when `hash`) and `/* … *\/` comments
 * removed outside quotes, blank lines dropped, positions kept.
 */
export function lines(source: string, options: { hash?: boolean } = {}): Statement[] {
  const out: Statement[] = []
  let block = false
  source.replace(/\r\n?/g, '\n').split('\n').forEach((raw, index) => {
    let text = ''
    let quote: string | null = null
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]!
      if (block) {
        if (ch === '*' && raw[i + 1] === '/') {
          block = false
          i++
        }
        text += ' '
        continue
      }
      if (quote) {
        if (ch === '\\') {
          text += ch + (raw[i + 1] ?? '')
          i++
          continue
        }
        if (ch === quote) quote = null
        text += ch
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch
        text += ch
        continue
      }
      if (ch === '/' && raw[i + 1] === '/') break
      if (options.hash && ch === '#') break
      if (ch === '/' && raw[i + 1] === '*') {
        block = true
        i++
        text += '  '
        continue
      }
      text += ch
    }
    const trimmed = text.trim()
    if (trimmed) out.push({ text: trimmed, line: index + 1, column: text.length - text.trimStart().length + 1 })
  })
  return out
}

/** A quoted string's content (`'…'`, `"…"`, `` `…` ``), or the text as it is. */
export function unquoted(text: string): string {
  const t = text.trim()
  if (t.length >= 2 && /^["'`]/.test(t) && t.endsWith(t[0]!)) return t.slice(1, -1).replace(/\\(.)/g, '$1')
  return t
}

/** Splits on `sep` outside quotes, brackets and braces. */
export function split(text: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let cur = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quote) {
      if (ch === quote) quote = null
      cur += ch
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch
    else if ('[({'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth--
    if (depth === 0 && text.startsWith(sep, i)) {
      out.push(cur)
      cur = ''
      i += sep.length - 1
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim()).filter((s) => s !== '')
}
