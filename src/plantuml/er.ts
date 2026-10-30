/**
 * PlantUML entity-relationship diagrams (Information Engineering notation),
 * read into the ER model.
 *
 *     @startuml
 *     entity Customer {
 *       * id : int <<PK>>
 *       --
 *       name : text
 *     }
 *     entity "Order" as O {
 *       * id : int <<PK>>
 *       customer_id : int <<FK>>
 *     }
 *     Customer ||--o{ O : places
 *     @enduml
 *
 * Supported: `entity Name { … }` with a quoted name and alias; attributes
 * `[*]name : type <<PK>> <<FK>> <<UK>>` (other stereotypes become the
 * comment), separators; relationships with crow's foot ends on both sides
 * (`||`, `|o`, `}|`, `}o` and their mirrors), solid (`--`) or dashed
 * (`..`) lines, direction words and labels.
 */
import { DiagramError } from '../core/errors'
import type { Statement } from '../core/scanner'
import type { AttributeKey, Cardinality, ErAttribute, ErDiagram } from '../diagrams/er/parser'
import { labelText, unquoted, type PlantUmlSource } from './source'
import { plainArrow, withoutColour } from './translate'

const LEFT: Record<string, Cardinality> = { '||': 'one', '|o': 'zero-one', '}|': 'one-many', '}o': 'zero-many', '|': 'one' }
const RIGHT: Record<string, Cardinality> = { '||': 'one', 'o|': 'zero-one', '|{': 'one-many', 'o{': 'zero-many', '|': 'one' }
const NAME = String.raw`"[^"]+"|[\p{L}\p{N}_][\p{L}\p{N}_.]*`
const RELATION = new RegExp(
  `^(${NAME})\\s*(\\|\\||\\|o|\\}\\||\\}o|\\|)([-.]+(?:\\[[^\\]]*\\])?(?:(?:up|down|left|right|u|d|l|r)(?=[-.]))?[-.]*)(\\|\\||o\\||\\|\\{|o\\{|\\|)\\s*(${NAME})\\s*(?::\\s*(.*))?$`,
  'u',
)

/** True when a diagram's statements look like PlantUML's IE notation. */
export function looksLikeEr(list: readonly Statement[]): boolean {
  return list.some((s) => RELATION.test(s.text)) || list.some((s) => /^entity\s+.*\{$/i.test(s.text))
}

export function parsePlantUmlEr(src: PlantUmlSource): ErDiagram {
  const d: ErDiagram = { type: 'er', direction: src.direction === 'LR' ? 'LR' : 'TB', entities: new Map(), relationships: [], classDefs: new Map(), accessibility: {} }
  if (src.title) d.accessibility.title = src.title
  const ids = new Map<string, string>()
  const entity = (name: string, shown?: string): string => {
    const raw = unquoted(name)
    const known = ids.get(raw)
    if (known) return known
    const id = raw.replace(/[^\p{L}\p{N}_-]/gu, '_')
    ids.set(raw, id)
    if (shown) ids.set(shown, id)
    if (!d.entities.has(id)) d.entities.set(id, { id, label: labelText(shown ?? raw), attributes: [], classes: [] })
    return id
  }

  const list = src.statements
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!
    let m: RegExpExecArray | null
    if ((m = /^entity\s+(.+?)\s*(\{)?$/i.exec(withoutColour(s.text)))) {
      let text = m[1]!.replace(/\s*<<[^>]*>>/g, '').trim()
      let shown: string | undefined
      const as = /^"([^"]+)"\s+as\s+(\S+)$/.exec(text) ?? /^(\S+)\s+as\s+"([^"]+)"$/.exec(text)
      if (as) {
        const quotedFirst = text.startsWith('"')
        shown = quotedFirst ? as[1] : as[2]
        text = quotedFirst ? as[2]! : as[1]!
      }
      const id = entity(text, shown)
      if (m[2]) {
        let j = i + 1
        for (; j < list.length && list[j]!.text !== '}'; j++) {
          const a = attribute(list[j]!.text)
          if (a) d.entities.get(id)!.attributes.push(a)
        }
        if (j >= list.length) throw new DiagramError(`Entity "${text}" is never closed`, s.line, s.column, 'Close it with "}".')
        i = j
      }
      continue
    }
    if ((m = RELATION.exec(s.text))) {
      const [, a, left, body, right, b, label] = m
      d.relationships.push({
        from: entity(a!),
        to: entity(b!),
        fromCardinality: LEFT[left!]!,
        toCardinality: RIGHT[right!]!,
        identifying: !plainArrow(body!).includes('.'),
        label: label ? labelText(label.trim()) : '',
      })
      continue
    }
    if (/^(note|hide|show)\b/i.test(s.text)) continue
    throw new DiagramError(`"${s.text}" is not an entity or a relationship`, s.line, s.column, 'entity Name { … }, A ||--o{ B : label')
  }
  return d
}

/** An attribute line: `* name : type <<PK>>`; separators give nothing. */
function attribute(line: string): ErAttribute | null {
  let t = line.trim()
  if (/^(--|\.\.|==|__)(.*(--|\.\.|==|__))?$/.test(t)) return null
  const keys: AttributeKey[] = []
  const notes: string[] = []
  t = t.replace(/\s*<<\s*([^>]*?)\s*>>/g, (_, st: string) => {
    const k = st.toUpperCase()
    if (k === 'PK' || k === 'FK' || k === 'UK') keys.push(k)
    else notes.push(st)
    return ''
  })
  t = t.replace(/^\*\s*/, '').trim()
  const m = /^(.+?)\s*:\s*(.+)$/.exec(t)
  const name = (m ? m[1]! : t).trim()
  const type = m ? m[2]!.trim() : ''
  return { type, name, keys, comment: notes.length > 0 ? notes.join(', ') : undefined }
}
