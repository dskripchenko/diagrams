/**
 * PlantUML timing diagrams, read into the timing model.
 *
 *     @startuml
 *     robust "Web browser" as WB
 *     concise "User" as WU
 *     clock "Clock" as C with period 50
 *     @0
 *     WU is Idle
 *     WB is Idle
 *     @100
 *     WU is Waiting
 *     WB is Processing
 *     WU -> WB : request
 *     @300
 *     WB is Waiting
 *     highlight 200 to 300 : network
 *     @enduml
 *
 * Supported: robust, concise, binary and clock signals (quoted names,
 * aliases; `with period N pulse N offset N`); `X has A,B,C` for a robust
 * signal's levels, top to bottom; moments `@N` and `@+N`; `X is State`
 * (`{-}` / `{hidden}` for nothing, `high` / `low` for binary); the
 * per-signal form `@X` followed by `N is State` / `+N is State`; messages
 * `A -> B : text` and `A -> B@+N : text`; `highlight N to M #color : text`.
 */
import { DiagramError } from '../core/errors'
import { parseStyle } from '../core/style'
import type { Signal, SignalKind, TimingDiagram } from '../diagrams/timing'
import { labelText, unquoted, type PlantUmlSource } from './source'

/** True when the statements declare timing signals. */
export function looksLikeTiming(src: PlantUmlSource): boolean {
  return src.statements.some((s) => /^(robust|concise|binary|clock)\s+\S/i.test(s.text))
}

export function parsePlantUmlTiming(src: PlantUmlSource): TimingDiagram {
  const d: TimingDiagram = { type: 'timing', title: src.title ? labelText(src.title) : undefined, signals: [], messages: [], highlights: [], accessibility: {} }
  const byId = new Map<string, Signal>()
  const declaredLevels = new Set<string>()
  let now = 0
  let focus: Signal | null = null

  const signal = (name: string, line: number, column: number): Signal => {
    const s = byId.get(unquoted(name))
    if (!s) throw new DiagramError(`"${name}" is not a signal`, line, column, 'Declare it first: robust "Name" as N')
    return s
  }
  const time = (text: string, base: number): number => {
    const t = text.trim()
    return t.startsWith('+') ? base + Number(t.slice(1)) : Number(t)
  }
  const setState = (s: Signal, at: number, state: string) => {
    const st = unquoted(state.replace(/\s*:.*$/, '').trim())
    if (s.kind === 'robust' && !declaredLevels.has(s.id) && !s.states.includes(st) && !/^\{.*\}$/.test(st)) s.states.unshift(st)
    const last = s.changes[s.changes.length - 1]
    if (last && last.at > at) throw new DiagramError(`"${s.label}" changes at ${at}, before its previous change at ${last.at}`)
    if (last && last.at === at) last.state = st
    else s.changes.push({ at, state: st })
  }

  for (const st of src.statements) {
    const t = st.text
    let m: RegExpExecArray | null
    if ((m = /^(robust|concise|binary|clock)\s+("[^"]+"|\S+)(?:\s+as\s+(\S+))?(?:\s+with\s+period\s+(\d+)(?:\s+pulse\s+(\d+))?(?:\s+offset\s+(\d+))?)?(?:\s*<<.*>>)?$/i.exec(t))) {
      const kind = m[1]!.toLowerCase() as SignalKind
      const label = unquoted(m[2]!)
      const id = m[3] ?? label
      const s: Signal = { id, label: labelText(label), kind, states: [], changes: [] }
      if (kind === 'clock') {
        const period = Number(m[4] ?? 100)
        s.clock = { period, pulse: m[5] ? Number(m[5]) : period / 2, offset: m[6] ? Number(m[6]) : 0 }
      }
      byId.set(id, s)
      byId.set(label, s)
      d.signals.push(s)
      continue
    }
    if ((m = /^("[^"]+"|\S+)\s+has\s+(.+)$/i.exec(t))) {
      const s = signal(m[1]!, st.line, st.column)
      // Written top to bottom; levels are kept bottom to top.
      s.states = m[2]!.split(',').map((x) => unquoted(x.trim())).reverse()
      declaredLevels.add(s.id)
      continue
    }
    if ((m = /^@(\+?-?[\d.]+)$/.exec(t))) {
      now = time(m[1]!, now)
      focus = null
      continue
    }
    if ((m = /^@("[^"]+"|[^\s@]+)$/.exec(t))) {
      focus = signal(m[1]!, st.line, st.column)
      now = 0
      continue
    }
    if (focus && (m = /^(\+?-?[\d.]+)\s+is\s+(.+)$/i.exec(t))) {
      now = time(m[1]!, now)
      setState(focus, now, m[2]!)
      continue
    }
    if ((m = /^("[^"]+"|\S+)\s+is\s+(.+)$/i.exec(t))) {
      setState(signal(m[1]!, st.line, st.column), now, m[2]!)
      continue
    }
    if ((m = /^("[^"]+"|[^\s-]+)\s*-+>\s*("[^"]+"|[^\s@:]+)(?:@(\+?-?[\d.]+))?\s*(?::\s*(.*))?$/.exec(t))) {
      const from = signal(m[1]!, st.line, st.column)
      const to = signal(m[2]!, st.line, st.column)
      d.messages.push({ from: from.id, to: to.id, at: now, until: m[3] ? time(m[3], now) : now, text: labelText(m[4]?.trim() ?? '') })
      continue
    }
    if ((m = /^highlight\s+(\+?-?[\d.]+)\s+to\s+(\+?-?[\d.]+)\s*(#[\w;:.-]+)?\s*(?::\s*(.*))?$/i.exec(t))) {
      const raw = m[3]?.split(';')[0]?.slice(1)
      // Through the shared style rules: only a colour can come out.
      const color = raw ? parseStyle(`fill:${/^[0-9a-fA-F]{3,8}$/.test(raw) ? `#${raw}` : raw}`, st.line, st.column).shape.fill : undefined
      d.highlights.push({ from: time(m[1]!, now), to: time(m[2]!, now), text: labelText(m[4]?.trim() ?? ''), color })
      continue
    }
    if (/^(hide|show|scale|mode|manual|compact)\b/i.test(t)) continue
    throw new DiagramError(`"${t}" is not a timing diagram statement`, st.line, st.column)
  }
  if (d.signals.length === 0) throw new DiagramError('The diagram has no signals', 0, 0, 'robust "Name" as N')
  return d
}
