/**
 * PlantUML state diagrams, read into the state model through Mermaid's
 * state parser (the grammars are close).
 *
 *     @startuml
 *     [*] --> Idle
 *     state Working {
 *       [*] --> Busy
 *       Busy --> Busy : tick
 *     }
 *     Idle --> Working : start
 *     Working --> [*]
 *     @enduml
 *
 * Supported: `[*]`, transitions with any arrow (`->`, `-->`, `-right->`,
 * `-[#red]->`) and labels; `state Name`, `state "Long" as N`, `state N :
 * text`, `N : text`; composites (nested) and concurrent regions (`--`,
 * `||`); `<<choice>>`, `<<fork>>`, `<<join>>`; notes on a state, one line
 * or several; colours are accepted. History (`[H]`, `[H*]`) is drawn as a
 * state named H.
 */
import { DiagramError } from '../core/errors'
import { parseState, type StateDiagram } from '../diagrams/state/parser'
import { labelText, type PlantUmlSource } from './source'
import { plainArrow, Translation, withoutColour } from './translate'

const NAME = String.raw`\[\*\]|\[H\*?\]|"[^"]+"|[\p{L}\p{N}_][\p{L}\p{N}_.]*`
const TRANSITION = new RegExp(`^(${NAME})\\s*(-[-\\w\\[\\]#,.;:]*>|<-[-\\w\\[\\]#,.;:]*-?)\\s*(${NAME})\\s*(?::\\s*(.*))?$`, 'u')

/** A state reference as Mermaid writes it. */
function ref(name: string): string {
  if (name === '[*]') return '[*]'
  if (/^\[H\*?\]$/.test(name)) return 'H'
  return name.replace(/^"|"$/g, '').replace(/[^\p{L}\p{N}_.]/gu, '_')
}

export function parsePlantUmlState(src: PlantUmlSource): StateDiagram {
  const t = new Translation('stateDiagram-v2')
  const list = src.statements
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!
    const text = /^state\s/i.test(s.text) ? withoutColour(s.text) : s.text
    let m: RegExpExecArray | null

    if ((m = TRANSITION.exec(text))) {
      const arrow = plainArrow(m[2]!)
      const back = arrow.startsWith('<')
      const [from, to] = back ? [m[3]!, m[1]!] : [m[1]!, m[3]!]
      t.add(`${ref(from)} --> ${ref(to)}${m[4] ? ` : ${labelText(m[4].trim())}` : ''}`, s)
      continue
    }
    if (text === '||' || text === '--') {
      t.add('--', s)
      continue
    }
    if ((m = /^state\s+(.+?)\s*<<\s*(\w+)\s*>>\s*(\{)?$/i.exec(text))) {
      const kind = m[2]!.toLowerCase()
      const name = ref(m[1]!)
      t.add(['choice', 'fork', 'join'].includes(kind) ? `state ${name} <<${kind}>>` : `state ${name}${m[3] ? ' {' : ''}`, s)
      continue
    }
    if ((m = /^state\s+"([^"]+)"\s+as\s+(\S+?)\s*(\{)?$/i.exec(text))) {
      t.add(`state "${labelText(m[1]!)}" as ${ref(m[2]!)}${m[3] ? ' {' : ''}`, s)
      continue
    }
    if ((m = /^state\s+(\S+?)\s+as\s+"([^"]+)"\s*(\{)?$/i.exec(text))) {
      t.add(`state "${labelText(m[2]!)}" as ${ref(m[1]!)}${m[3] ? ' {' : ''}`, s)
      continue
    }
    if ((m = /^state\s+(\S+?)\s*:\s*(.*)$/i.exec(text))) {
      t.add(`state ${ref(m[1]!)} : ${labelText(m[2]!)}`, s)
      continue
    }
    if ((m = /^state\s+(\S+?)\s*(\{)?$/i.exec(text))) {
      t.add(`state ${ref(m[1]!)}${m[2] ? ' {' : ''}`, s)
      continue
    }
    if (text === '}') {
      t.add('}', s)
      continue
    }
    if ((m = /^note\s+(left|right|top|bottom)\s+of\s+(\S+)\s*(?::\s*(.*))?$/i.exec(text))) {
      const side = /right|bottom/i.test(m[1]!) ? 'right' : 'left'
      const body = m[3]
      if (body !== undefined) {
        t.add(`note ${side} of ${ref(m[2]!)} : ${labelText(body)}`, s)
        continue
      }
      // Several lines: Mermaid's block form, each line where it was written.
      t.add(`note ${side} of ${ref(m[2]!)}`, s)
      let j = i + 1
      for (; j < list.length && !/^end\s*note$/i.test(list[j]!.text); j++) t.add(list[j]!.text, list[j]!)
      if (j >= list.length) throw new DiagramError('This note is never closed', s.line, s.column, 'Close it with "end note".')
      t.add('end note', list[j]!)
      i = j
      continue
    }
    if (/^note\b/i.test(text)) {
      throw new DiagramError('Only notes on a state are supported here', s.line, s.column, 'note right of State : text')
    }
    if ((m = /^(\S+?)\s*:\s*(.*)$/.exec(text))) {
      t.add(`${ref(m[1]!)} : ${labelText(m[2]!)}`, s)
      continue
    }
    t.add(text, s)
  }
  const d = t.parse(parseState)
  if (src.direction === 'LR') d.direction = 'LR'
  if (src.title) d.accessibility.title = src.title
  return d
}
