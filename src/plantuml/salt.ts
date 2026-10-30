/**
 * Salt wireframes (`@startsalt`, or `salt` as the first line of a
 * `@startuml`), read into the salt model.
 *
 *     @startsalt
 *     {+
 *       Login    | "MyName   "
 *       Password | "****     "
 *       [X] Remember me | ^English^
 *       [Cancel] | [  OK   ]
 *     }
 *     @endsalt
 *
 * Supported: blocks `{ … }` nested in cells, with borders `{+` (outer), `{#`
 * (all lines), `{!` (columns), `{-` (rows); tabs `{/ <b>One | Two }`; a menu
 * bar `{* File | Edit }`; a tree `{T + root ++ child }`; a scroll pane `{S`;
 * a group box `{^"Title"`; cells split by `|`; widgets `[Button]`, `"text
 * field"`, `[X] checked` / `[] unchecked`, `(X) radio` / `() radio`,
 * `^drop-down^`, text (`<b>bold</b>`), `.` for an empty cell; separator rows
 * `..`, `==`, `~~`, `--`.
 */
import { DiagramError } from '../core/errors'
import type { Statement } from '../core/scanner'
import type { SaltBorder, SaltDiagram, SaltWidget } from '../diagrams/salt'
import { labelText, type PlantUmlSource } from './source'

const SEPARATORS: Record<string, 'dotted' | 'double' | 'dashed' | 'solid'> = { '..': 'dotted', '==': 'double', '~~': 'dashed', '--': 'solid' }

/** Creole tags and OpenIconic icons are dropped; `<b>` makes the text bold. */
function plain(text: string): { text: string; bold: boolean } {
  const bold = /<b>/i.test(text)
  return { text: labelText(text.replace(/<&[\w-]+>/g, '').replace(/<\/?[a-z][^>]*>/gi, '').trim()), bold }
}

function widget(cell: string): SaltWidget {
  const t = cell.trim()
  if (t === '' || t === '.' || t === '*') return { kind: 'empty' }
  let m: RegExpExecArray | null
  if ((m = /^\^([^^]*)\^/.exec(t))) return { kind: 'droplist', text: plain(m[1]!).text }
  if ((m = /^"(.*)"$/.exec(cell.trim()))) return { kind: 'input', text: m[1]! }
  if ((m = /^\[([Xx ]?)\]\s*(.*)$/.exec(t))) return { kind: 'checkbox', checked: /x/i.test(m[1]!), text: plain(m[2]!).text }
  if ((m = /^\(([Xx ]?)\)\s*(.*)$/.exec(t))) return { kind: 'radio', checked: /x/i.test(m[1]!), text: plain(m[2]!).text }
  if ((m = /^\[(.+)\]$/.exec(t))) return { kind: 'button', text: plain(m[1]!).text }
  const p = plain(t)
  return { kind: 'text', text: p.text, bold: p.bold }
}

class Reader {
  private pos = 0
  private readonly text: string
  /** The line each character of `text` came from. */
  private readonly lineAt: number[] = []

  constructor(private readonly list: readonly Statement[]) {
    const parts: string[] = []
    for (const s of list) {
      parts.push(s.text)
      for (let k = 0; k <= s.text.length; k++) this.lineAt.push(s.line)
    }
    this.text = parts.join('\n')
  }

  private error(message: string, hint?: string): DiagramError {
    return new DiagramError(message, this.lineAt[Math.min(this.pos, this.lineAt.length - 1)] ?? 0, 0, hint)
  }

  run(): SaltWidget {
    this.skipSpace()
    if (this.text[this.pos] !== '{') throw this.error('A wireframe starts with "{"', '{ Login | "name" }')
    this.pos++
    const root = this.block()
    this.skipSpace()
    if (this.pos < this.text.length) throw this.error('Text after the closing "}"')
    return root
  }

  private skipSpace(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos]!)) this.pos++
  }

  /** After `{`: the block's modifier, then rows of cells up to the matching `}`. */
  private block(): SaltWidget {
    const mode = /^(\^"[^"]*"|SI|S-|[+#!\-/*TS^])?/.exec(this.text.slice(this.pos))![0]
    this.pos += mode.length
    const rows: (SaltWidget | string)[][] = [[]]
    let cell = ''
    const flushCell = () => {
      const row = rows[rows.length - 1]!
      if (cell.trim() !== '' || row.length > 0 || cell.includes('"')) row.push(cell)
      cell = ''
    }
    for (;;) {
      if (this.pos >= this.text.length) throw this.error('A "{" is never closed', 'Close it with "}".')
      const ch = this.text[this.pos]!
      if (ch === '"') {
        // A text field keeps its spaces and may hold any of the separators.
        const end = this.text.indexOf('"', this.pos + 1)
        if (end < 0) throw this.error('A text field is never closed', 'End it with ".')
        cell += this.text.slice(this.pos, end + 1)
        this.pos = end + 1
        continue
      }
      if (ch === '{') {
        this.pos++
        const nested = this.block()
        cell = ''
        rows[rows.length - 1]!.push(nested)
        // The cell after a nested block ends at the next `|`, newline or `}`.
        while (this.pos < this.text.length && !/[|\n}]/.test(this.text[this.pos]!)) this.pos++
        if (this.text[this.pos] === '|') this.pos++
        continue
      }
      if (ch === '}') {
        this.pos++
        flushCell()
        break
      }
      if (ch === '|') {
        this.pos++
        flushCell()
        continue
      }
      if (ch === '\n') {
        this.pos++
        flushCell()
        rows.push([])
        continue
      }
      cell += ch
      this.pos++
    }
    const filled = rows.filter((row) => row.some((c) => typeof c !== 'string' || c.trim() !== ''))
    const texts = (row: (SaltWidget | string)[]) => row.map((c) => (typeof c === 'string' ? c.trim() : '')).filter((c) => c !== '')
    if (mode === '/') {
      if (filled.length > 1 && filled.every((row) => texts(row).length === 1)) {
        const tabs = filled.map((row) => texts(row)[0]!)
        return { kind: 'tabs', tabs: tabs.map((t) => plain(t).text), selected: Math.max(0, tabs.findIndex((t) => /<b>/i.test(t))), vertical: true }
      }
      const tabs = filled.flatMap(texts)
      return { kind: 'tabs', tabs: tabs.map((t) => plain(t).text), selected: Math.max(0, tabs.findIndex((t) => /<b>/i.test(t))), vertical: false }
    }
    if (mode === '*') return { kind: 'menu', items: texts(filled[0] ?? []).map((t) => plain(t).text) }
    if (mode === 'T') {
      return {
        kind: 'tree',
        items: filled.map((row) => {
          const first = texts(row)[0] ?? ''
          const m = /^(\++)\s*(.*)$/.exec(first)
          return { depth: m ? m[1]!.length : 1, text: plain(m ? m[2]! : first).text }
        }),
      }
    }
    const border: SaltBorder = mode === '+' ? 'outer' : mode === '#' ? 'all' : mode === '!' ? 'columns' : mode === '-' ? 'rows' : 'none'
    const title = mode.startsWith('^') ? plain(mode.slice(2, -1)).text || undefined : undefined
    return {
      kind: 'grid',
      border: title !== undefined || mode === '^' ? 'outer' : border,
      title,
      scroll: mode.startsWith('S'),
      rows: filled.map((row) => {
        if (row.length === 1 && typeof row[0] === 'string' && SEPARATORS[row[0].trim()]) return [{ kind: 'separator', style: SEPARATORS[row[0].trim()]! }]
        return row.map((c) => (typeof c === 'string' ? widget(c) : c))
      }),
    }
  }
}

/** True when a `@startuml` holds a wireframe: its first statement is `salt`. */
export function looksLikeSalt(src: PlantUmlSource): boolean {
  return /^salt$/i.test(src.statements[0]?.text ?? '')
}

export function parsePlantUmlSalt(src: PlantUmlSource): SaltDiagram {
  const list = looksLikeSalt(src) ? src.statements.slice(1) : src.statements
  if (list.length === 0) throw new DiagramError('The wireframe is empty', 0, 0, '{ Login | "name" }')
  return { type: 'salt', root: new Reader(list).run(), title: src.title ? labelText(src.title) : undefined, accessibility: {} }
}
