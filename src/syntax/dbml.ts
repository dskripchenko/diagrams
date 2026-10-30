/**
 * DBML (Database Markup Language) — database schemas — read into the ER
 * model.
 *
 *     Table users {
 *       id integer [pk, increment]
 *       email varchar [unique, not null, note: 'login']
 *     }
 *     Table posts {
 *       id integer [pk]
 *       user_id integer [ref: > users.id]
 *     }
 *     Ref: posts.user_id > users.id
 *
 * Supported: `Table name [as alias] [settings] { … }` with columns
 * (`name type [pk, unique, not null, note: '…', ref: > t.c]`), `Note`,
 * `indexes { … }` (read and skipped); `Ref` in all three forms (`Ref: …`,
 * `Ref name: …`, `Ref { … }`) with `>` (many to one), `<` (one to many),
 * `-` (one to one), `<>` (many to many), composite columns `(a, b)`;
 * `Enum name { … }` (drawn as an entity listing its values); `Project`,
 * `TableGroup`, `TablePartial` and notes, read and skipped. Schema names
 * (`public.users`) are kept.
 */
import { DiagramError } from '../core/errors'
import type { Statement } from '../core/scanner'
import type { AttributeKey, Cardinality, ErDiagram, ErEntity } from '../diagrams/er/parser'
import { lines, split, unquoted } from './text'

/** True when the source starts like DBML. */
export function isDbml(source: string): boolean {
  const first = lines(source)[0]?.text ?? ''
  return /^(Table|Ref|Enum|Project|TableGroup|TablePartial)\b/i.test(first)
}

const NAME = String.raw`(?:"[^"]+"|[\w$]+)(?:\.(?:"[^"]+"|[\w$]+))?`

/** `"public"."users"` / `public.users` → `public.users`. */
function name(text: string): string {
  return text.split('.').map(unquoted).join('.')
}

/** The settings in a trailing `[…]`, as key → value (`pk` → ''). */
function settings(text: string): { rest: string; set: Map<string, string> } {
  const set = new Map<string, string>()
  const m = /\s*\[([^\]]*)\]\s*$/.exec(text)
  if (!m || text.trimEnd().endsWith(']') === false) return { rest: text, set }
  for (const part of split(m[1]!, ',')) {
    const kv = /^([\w\s]+?)\s*:\s*([\s\S]+)$/.exec(part)
    if (kv) set.set(kv[1]!.trim().toLowerCase(), unquoted(kv[2]!.trim()))
    else set.set(part.trim().toLowerCase(), '')
  }
  return { rest: text.slice(0, m.index).trim(), set }
}

interface PendingRef {
  from: { table: string; columns: string[] }
  to: { table: string; columns: string[] }
  op: string
  s: Statement
}

/** `table.column` or `table.(a, b)`, with an optional schema. */
function endpoint(text: string, s: Statement): { table: string; columns: string[] } {
  const t = text.trim()
  const comp = /^(.+)\.\(([^)]*)\)$/.exec(t)
  if (comp) return { table: name(comp[1]!), columns: comp[2]!.split(',').map((c) => unquoted(c.trim())) }
  const parts = t.split('.')
  if (parts.length < 2) throw new DiagramError(`"${t}" is not a column`, s.line, s.column, 'table.column')
  return { table: name(parts.slice(0, -1).join('.')), columns: [unquoted(parts[parts.length - 1]!)] }
}

const OPS: Record<string, [Cardinality, Cardinality]> = {
  '>': ['zero-many', 'one'],
  '<': ['one', 'zero-many'],
  '-': ['one', 'one'],
  '<>': ['zero-many', 'zero-many'],
}

export function parseDbml(source: string): ErDiagram {
  const list = lines(source)
  const d: ErDiagram = { type: 'er', direction: 'LR', entities: new Map(), relationships: [], classDefs: new Map(), accessibility: {} }
  const aliases = new Map<string, string>()
  const refs: PendingRef[] = []
  const table = (n: string) => aliases.get(n) ?? n

  const ref = (body: string, s: Statement) => {
    const m = /^(.+?)\s*(<>|>|<|-)\s*(.+?)(?:\s*\[[^\]]*\])?$/.exec(body.trim())
    if (!m) throw new DiagramError(`"${body.trim()}" is not a reference`, s.line, s.column, 'Ref: posts.user_id > users.id')
    refs.push({ from: endpoint(m[1]!, s), to: endpoint(m[3]!, s), op: m[2]!, s })
  }

  for (let i = 0; i < list.length; i++) {
    const s = list[i]!
    let m: RegExpExecArray | null
    /** The statements up to the matching `}` (one level); the index of the `}`. */
    const body = (): { inner: Statement[]; end: number } => {
      const inner: Statement[] = []
      let depth = 1
      let j = i + 1
      for (; j < list.length; j++) {
        const t = list[j]!.text
        depth += (t.match(/\{/g) ?? []).length - (t.match(/\}/g) ?? []).length
        if (depth <= 0) break
        inner.push(list[j]!)
      }
      if (j >= list.length) throw new DiagramError('A "{" is never closed', s.line, s.column, 'Close it with "}".')
      return { inner, end: j }
    }

    if ((m = new RegExp(`^Table\\s+(${NAME})(?:\\s+as\\s+(\\w+))?\\s*(\\[[^\\]]*\\])?\\s*\\{$`, 'i').exec(s.text))) {
      const id = name(m[1]!)
      if (m[2]) aliases.set(m[2], id)
      const entity: ErEntity = { id, label: id, attributes: [], classes: [] }
      d.entities.set(id, entity)
      const { inner, end } = body()
      let depth = 0
      for (const c of inner) {
        if (depth > 0) {
          depth += (c.text.match(/\{/g) ?? []).length - (c.text.match(/\}/g) ?? []).length
          continue
        }
        if (/^indexes\s*\{/i.test(c.text)) {
          depth = 1
          continue
        }
        if (/^note\s*[:{]/i.test(c.text)) continue
        const { rest, set } = settings(c.text)
        const col = /^("[^"]+"|[\w$]+)\s+(.+)$/.exec(rest)
        if (!col) throw new DiagramError(`"${c.text}" is not a column`, c.line, c.column, 'name type [pk, not null]')
        const keys: AttributeKey[] = []
        if (set.has('pk') || set.has('primary key')) keys.push('PK')
        if (set.has('ref')) keys.push('FK')
        if (set.has('unique')) keys.push('UK')
        const notes = [set.has('not null') ? 'not null' : '', set.has('increment') ? 'increment' : '', set.get('note') ?? ''].filter(Boolean)
        entity.attributes.push({ type: unquoted(col[2]!), name: unquoted(col[1]!), keys, comment: notes.length > 0 ? notes.join(', ') : undefined })
        const inline = set.get('ref')
        if (inline) {
          const r = /^(<>|>|<|-)\s*(.+)$/.exec(inline.trim())
          if (!r) throw new DiagramError(`"${inline}" is not a reference`, c.line, c.column, 'ref: > users.id')
          refs.push({ from: { table: id, columns: [unquoted(col[1]!)] }, to: endpoint(r[2]!, c), op: r[1]!, s: c })
        }
      }
      i = end
      continue
    }
    if ((m = new RegExp(`^Enum\\s+(${NAME})\\s*\\{$`, 'i').exec(s.text))) {
      const id = name(m[1]!)
      const { inner, end } = body()
      d.entities.set(id, {
        id,
        label: `«enum» ${id}`,
        attributes: inner.map((v) => {
          const { rest, set } = settings(v.text)
          return { type: '', name: unquoted(rest), keys: [], comment: set.get('note') }
        }),
        classes: [],
      })
      i = end
      continue
    }
    if ((m = /^Ref(?:\s+[\w"]+)?\s*:\s*(.+)$/i.exec(s.text))) {
      ref(m[1]!, s)
      continue
    }
    if (/^Ref(?:\s+[\w"]+)?\s*\{$/i.test(s.text)) {
      const { inner, end } = body()
      for (const r of inner) ref(r.text, r)
      i = end
      continue
    }
    if (/^(Project|TableGroup|TablePartial|Note|Records)\b[^{]*\{$/i.test(s.text)) {
      i = body().end
      continue
    }
    if (/^Note\s*:/i.test(s.text)) continue
    throw new DiagramError(`"${s.text}" is not a DBML statement`, s.line, s.column, 'Table name { … }, Ref: a.b > c.d, Enum name { … }')
  }

  for (const r of refs) {
    const from = table(r.from.table)
    const to = table(r.to.table)
    for (const t of [from, to]) if (!d.entities.has(t)) throw new DiagramError(`"${t}" is not a table`, r.s.line, r.s.column)
    // The referencing column is a foreign key.
    for (const c of r.from.columns) {
      const a = d.entities.get(from)!.attributes.find((x) => x.name === c)
      if (a && !a.keys.includes('FK')) a.keys.push('FK')
    }
    const [fc, tc] = OPS[r.op]!
    d.relationships.push({ from, to, fromCardinality: fc, toCardinality: tc, identifying: true, label: `${r.from.columns.join(', ')} → ${r.to.columns.join(', ')}` })
  }
  if (d.entities.size === 0) throw new DiagramError('The schema has no tables', 0, 0, 'Table users { id int [pk] }')
  return d
}
