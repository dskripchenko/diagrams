/**
 * The entity relationship grammar (`erDiagram`): entities with attribute
 * blocks, relationships with crow's foot cardinalities in symbols or words,
 * aliases, direction, classes and styles.
 */
import { DiagramError } from '../../core/errors'
import { statements, type Statement } from '../../core/scanner'
import { parseStyle, type UserStyle } from '../../core/style'
import type { Direction } from '../../layout/layered/types'
import { accessibilityStatement, type Accessibility } from '../common'

/** How many rows of one entity relate to one row of the other. */
export type Cardinality = 'one' | 'zero-one' | 'one-many' | 'zero-many'

export type AttributeKey = 'PK' | 'FK' | 'UK'

export interface ErAttribute {
  type: string
  name: string
  keys: AttributeKey[]
  comment?: string
}

export interface ErEntity {
  id: string
  /** What the box shows: the alias from `ID["Alias"]`, or the id. */
  label: string
  attributes: ErAttribute[]
  classes: string[]
  style?: UserStyle
}

export interface ErRelationship {
  from: string
  to: string
  /** Cardinality at the `from` entity, written on the left of the line. */
  fromCardinality: Cardinality
  toCardinality: Cardinality
  /** `--` (identifying, solid) or `..` (non-identifying, dashed). */
  identifying: boolean
  label: string
}

export interface ErDiagram {
  type: 'er'
  direction: Direction
  entities: Map<string, ErEntity>
  relationships: ErRelationship[]
  classDefs: Map<string, UserStyle>
  accessibility: Accessibility
}

const DIRECTIONS: Record<string, Direction> = { TB: 'TB', TD: 'TB', BT: 'BT', LR: 'LR', RL: 'RL' }

/** An entity name: a word with inner hyphens (`LINE-ITEM`), or any text in quotes. */
const ENTITY = '(?:"[^"]*"|[\\p{L}_][\\p{L}\\p{N}_]*(?:-[\\p{L}\\p{N}_]+)*)'

const LEFT: Record<string, Cardinality> = { '||': 'one', '|o': 'zero-one', '}|': 'one-many', '}o': 'zero-many' }
const RIGHT: Record<string, Cardinality> = { '||': 'one', 'o|': 'zero-one', '|{': 'one-many', 'o{': 'zero-many' }
const LINES: Record<string, boolean> = { '--': true, '..': false, '.-': false, '-.': false }

/** Mermaid's word forms of the cardinalities, `CAR 1 to zero or more DRIVER`. */
const WORDS: [string, Cardinality][] = [
  ['only one', 'one'],
  ['zero or one', 'zero-one'],
  ['one or zero', 'zero-one'],
  ['one or more', 'one-many'],
  ['one or many', 'one-many'],
  ['many(1)', 'one-many'],
  ['1+', 'one-many'],
  ['zero or more', 'zero-many'],
  ['zero or many', 'zero-many'],
  ['many(0)', 'zero-many'],
  ['0+', 'zero-many'],
  ['1', 'one'],
]
const WORD = `(${WORDS.map(([w]) => w.replace(/[()+]/g, (c) => `\\${c}`).replace(/ /g, '\\s+')).join('|')})`

const SYMBOLIC = new RegExp(
  `^(${ENTITY})\\s*(\\|\\||\\|o|\\}\\||\\}o)(--|\\.\\.|\\.-|-\\.)(\\|\\||o\\||\\|\\{|o\\{)\\s*(${ENTITY})\\s*(?::\\s*(.*))?$`,
  'u',
)
const WORDY = new RegExp(`^(${ENTITY})\\s+${WORD}\\s+(to|optionally\\s+to)\\s+${WORD}\\s+(${ENTITY})\\s*(?::\\s*(.*))?$`, 'iu')
const DECLARATION = new RegExp(`^(${ENTITY})(?:\\[\\s*("[^"]*"|[^\\]"]*?)\\s*\\])?(?::::([\\w-]+))?\\s*(\\{\\s*\\}?)?$`, 'u')

function wordCardinality(word: string): Cardinality {
  const w = word.toLowerCase().replace(/\s+/g, ' ')
  return WORDS.find(([k]) => k === w)![1]
}

function name(raw: string): string {
  return raw.startsWith('"') ? raw.slice(1, -1) : raw
}

function labelOf(raw: string | undefined): string {
  const t = (raw ?? '').trim()
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t
}

/** `type name [PK, FK] ["comment"]` inside an entity block. */
function parseAttribute(s: Statement): ErAttribute {
  const m = /^(\S+)\s+(\S+)(.*)$/u.exec(s.text)
  if (!m) {
    throw new DiagramError(`"${s.text}" is not an attribute`, s.line, s.column, 'Write a type and a name: string firstName.')
  }
  const [, type, attrName, rest] = m as unknown as [string, string, string, string]
  if (!/^[\p{L}_*][\p{L}\p{N}_\-[\]().,~]*$/u.test(type)) {
    throw new DiagramError(`"${type}" is not an attribute type`, s.line, s.column)
  }
  const nameColumn = s.column + s.text.indexOf(attrName, type.length)
  if (!/^\*?[\p{L}_][\p{L}\p{N}_\-[\]().]*$/u.test(attrName)) {
    throw new DiagramError(`"${attrName}" is not an attribute name`, s.line, nameColumn)
  }
  const restColumn = nameColumn + attrName.length
  const tail = /^\s*((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*)?\s*(?:"([^"]*)")?\s*$/.exec(rest)
  if (!tail) {
    const at = restColumn + (rest.length - rest.trimStart().length)
    throw new DiagramError(
      `"${rest.trim()}" is not a key or a comment`,
      s.line,
      at,
      'After the name come keys (PK, FK, UK, comma-separated) and a "comment" in double quotes.',
    )
  }
  const keys = tail[1] ? [...new Set(tail[1].split(',').map((k) => k.trim() as AttributeKey))] : []
  return { type, name: attrName, keys, comment: tail[2] }
}

export function parseEr(source: string): ErDiagram {
  const list = statements(source)
  const head = list[0]
  if (!head || head.text !== 'erDiagram') {
    throw new DiagramError('An entity relationship diagram starts with "erDiagram"', head?.line ?? 1, head?.column ?? 1)
  }
  const d: ErDiagram = {
    type: 'er',
    direction: 'TB',
    entities: new Map(),
    relationships: [],
    classDefs: new Map(),
    accessibility: {},
  }
  const pendingClasses: { ids: string[]; cls: string; s: Statement }[] = []
  const pendingStyles: { id: string; style: UserStyle; s: Statement }[] = []

  const touch = (raw: string): ErEntity => {
    const id = name(raw)
    let entity = d.entities.get(id)
    if (!entity) {
      entity = { id, label: id, attributes: [], classes: [] }
      d.entities.set(id, entity)
    }
    return entity
  }

  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const text = s.text
    const consumed = accessibilityStatement(list, i, d.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }

    let m = /^direction\s+(\w+)$/.exec(text)
    if (m) {
      const dir = DIRECTIONS[m[1]!.toUpperCase()]
      if (!dir) throw new DiagramError(`"${m[1]}" is not a direction`, s.line, s.column + 10, 'Use TB, BT, LR or RL.')
      d.direction = dir
      continue
    }
    m = /^classDef\s+([\w,-]+)\s+(.+)$/.exec(text)
    if (m) {
      const style = parseStyle(m[2]!, s.line, s.column)
      for (const cls of m[1]!.split(',')) d.classDefs.set(cls.trim(), style)
      continue
    }
    m = /^class\s+(.+?)\s+([\w-]+)$/.exec(text)
    if (m) {
      pendingClasses.push({ ids: m[1]!.split(',').map((x) => name(x.trim())), cls: m[2]!, s })
      continue
    }
    m = /^style\s+("[^"]*"|\S+)\s+(.+)$/.exec(text)
    if (m) {
      pendingStyles.push({ id: name(m[1]!), style: parseStyle(m[2]!, s.line, s.column), s })
      continue
    }

    m = SYMBOLIC.exec(text)
    if (m) {
      d.relationships.push({
        from: touch(m[1]!).id,
        fromCardinality: LEFT[m[2]!]!,
        identifying: LINES[m[3]!]!,
        toCardinality: RIGHT[m[4]!]!,
        to: touch(m[5]!).id,
        label: labelOf(m[6]),
      })
      continue
    }
    m = WORDY.exec(text)
    if (m) {
      d.relationships.push({
        from: touch(m[1]!).id,
        fromCardinality: wordCardinality(m[2]!),
        identifying: m[3]!.toLowerCase() === 'to',
        toCardinality: wordCardinality(m[4]!),
        to: touch(m[5]!).id,
        label: labelOf(m[6]),
      })
      continue
    }

    m = DECLARATION.exec(text)
    if (m) {
      const entity = touch(m[1]!)
      if (m[2] !== undefined && m[2] !== '') entity.label = name(m[2])
      if (m[3]) entity.classes.push(m[3])
      const block = m[4]
      if (block !== undefined && !block.endsWith('}')) {
        // An attribute block, up to the closing brace.
        let j = i + 1
        for (; j < list.length && list[j]!.text !== '}'; j++) entity.attributes.push(parseAttribute(list[j]!))
        if (j >= list.length) {
          throw new DiagramError(`The attributes of "${entity.id}" are not closed`, s.line, s.column, 'Add "}" on its own line.')
        }
        i = j
      }
      continue
    }

    // Something that looks like a relationship but whose ends are not cardinalities.
    const rel = new RegExp(`^(${ENTITY})\\s*([|}{o.\\-=<>]{2,})`, 'u').exec(text)
    if (rel) {
      throw new DiagramError(
        `"${rel[2]}" is not a relationship`,
        s.line,
        s.column + text.indexOf(rel[2]!, rel[1]!.length),
        'Write a cardinality on each side of -- or ..: ||, |o, }|, }o on the left; ||, o|, |{, o{ on the right.',
      )
    }
    if (text === '}') throw new DiagramError('"}" without an open entity', s.line, s.column)
    throw new DiagramError(`"${text}" is not an entity relationship statement`, s.line, s.column)
  }

  for (const c of pendingClasses) {
    for (const id of c.ids) {
      const target = d.entities.get(id)
      if (!target) throw new DiagramError(`class refers to an unknown entity "${id}"`, c.s.line, c.s.column)
      target.classes.push(c.cls)
    }
  }
  for (const st of pendingStyles) {
    const target = d.entities.get(st.id)
    if (!target) throw new DiagramError(`style refers to an unknown entity "${st.id}"`, st.s.line, st.s.column)
    target.style = st.style
  }
  return d
}
