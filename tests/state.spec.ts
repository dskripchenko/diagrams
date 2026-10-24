import { describe, expect, it } from 'vitest'
import { approximateMeasurer, DiagramError, parse, render } from '../src'
import type { StateDiagram } from '../src/diagrams/state'

const opts = { measureText: approximateMeasurer }
const p = (src: string) => parse(src) as StateDiagram

describe('state diagrams', () => {
  it('gives each scope its own start and end', () => {
    const d = p('stateDiagram-v2\n  [*] --> A\n  state A {\n    [*] --> B\n    B --> [*]\n  }\n  A --> [*]')
    const pseudo = [...d.states.values()].filter((s) => s.kind === 'start' || s.kind === 'end')
    expect(pseudo).toHaveLength(4)
    expect(d.composites.get('A')).toBeDefined()
    expect(d.states.get('B')!.parent).toBe('A')
  })

  it('reads descriptions, aliases and pseudo states', () => {
    const d = p(`stateDiagram
      state "Долгое имя" as s1
      s1 : первая строка
      s1 : вторая
      state c <<choice>>
      state f <<fork>>
      s1 --> c : проверить`)
    expect(d.states.get('s1')).toMatchObject({ name: 'Долгое имя', descriptions: ['первая строка', 'вторая'] })
    expect(d.states.get('c')!.kind).toBe('choice')
    expect(d.states.get('f')!.kind).toBe('fork')
    expect(d.transitions[0]).toMatchObject({ from: 's1', to: 'c', label: 'проверить' })
  })

  it('splits concurrent regions', () => {
    const d = p('stateDiagram-v2\n  state A {\n    x --> y\n    --\n    z --> w\n  }')
    const regions = [...d.composites.values()].filter((c) => c.region)
    expect(regions).toHaveLength(2)
    expect(d.states.get('x')!.parent).toBe(regions[0]!.id)
    expect(d.states.get('z')!.parent).toBe(regions[1]!.id)
  })

  it('reads one-line and block notes', () => {
    const d = p('stateDiagram-v2\n  A --> B\n  note right of A : кратко\n  note left of B\n    строка 1\n    строка 2\n  end note')
    expect(d.notes).toEqual([
      { target: 'A', side: 'right', text: 'кратко' },
      { target: 'B', side: 'left', text: 'строка 1\nстрока 2' },
    ])
  })

  it('reports errors with positions', () => {
    expect(() => p('stateDiagram-v2\n  state A {\n  B')).toThrow(/not closed/)
    expect(() => p('stateDiagram-v2\n  }')).toThrow(DiagramError)
    expect(() => p('stateDiagram-v2\n  note left of A\n  text')).toThrow(/note is not closed/)
    try {
      p('stateDiagram-v2\n  A --> B\n  A ==> B')
      expect.unreachable()
    } catch (e) {
      expect((e as DiagramError).line).toBe(3)
    }
  })

  it('renders every pseudo state', () => {
    const { svg } = render(
      'stateDiagram-v2\n  state c <<choice>>\n  state f <<fork>>\n  [*] --> c\n  c --> f\n  f --> A\n  A --> [*]',
      opts,
    )
    expect(svg).toContain('dg-state-start')
    expect(svg).toContain('dg-state-choice')
    expect(svg).toContain('dg-state-fork')
    expect(svg).toContain('dg-state-end')
  })
})
