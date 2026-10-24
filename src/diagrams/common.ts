/**
 * Statements every diagram type accepts the same way.
 */
import type { Statement } from '../core/scanner'

export interface Accessibility {
  title?: string
  description?: string
}

/**
 * Handles `accTitle: …`, `accDescr: …` and `accDescr { … }`. Returns how
 * many statements it consumed (0 when the statement is something else).
 */
export function accessibilityStatement(
  list: readonly Statement[],
  index: number,
  into: Accessibility,
): number {
  const s = list[index]!
  let m = /^accTitle\s*:\s*(.*)$/.exec(s.text)
  if (m) {
    into.title = m[1]!.trim()
    return 1
  }
  m = /^accDescr\s*:\s*(.*)$/.exec(s.text)
  if (m) {
    into.description = m[1]!.trim()
    return 1
  }
  m = /^accDescr\s*\{\s*(.*)$/.exec(s.text)
  if (m) {
    const parts: string[] = []
    let rest = m[1]!
    let i = index
    for (;;) {
      const close = rest.indexOf('}')
      if (close >= 0) {
        parts.push(rest.slice(0, close))
        break
      }
      parts.push(rest)
      i++
      if (i >= list.length) break
      rest = list[i]!.text
    }
    into.description = parts.map((p) => p.trim()).filter(Boolean).join(' ')
    return i - index + 1
  }
  return 0
}
