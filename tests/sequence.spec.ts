import { describe, expect, it } from 'vitest'
import { approximateMeasurer, detect, DiagramError, parse, render } from '../src'
import type { SequenceDiagram } from '../src/diagrams/sequence'
import activations from './fixtures/sequence-activations.mmd?raw'
import basic from './fixtures/sequence-basic.mmd?raw'
import blocks from './fixtures/sequence-blocks.mmd?raw'
import boxes from './fixtures/sequence-boxes.mmd?raw'

const opts = { measureText: approximateMeasurer }

const FIXTURES: Record<string, string> = {
  'sequence-basic': basic,
  'sequence-activations': activations,
  'sequence-blocks': blocks,
  'sequence-boxes': boxes,
}

function fixture(name: string): string {
  return FIXTURES[name]!
}

function errorOf(source: string): DiagramError {
  try {
    render(source, opts)
  } catch (error) {
    expect(error).toBeInstanceOf(DiagramError)
    return error as DiagramError
  }
  throw new Error('expected a DiagramError')
}

const seq = (body: string) => `sequenceDiagram\n${body}`

describe('sequence: parsing', () => {
  it('is detected', () => {
    expect(detect('sequenceDiagram\n  A->>B: hi')).toBe('sequence')
  })

  it('reads every arrow kind', () => {
    const d = parse(
      seq(
        [
          'A->B: a',
          'A-->B: b',
          'A->>B: c',
          'A-->>B: d',
          'A-xB: e',
          'A--xB: f',
          'A-)B: g',
          'A--)B: h',
          'A<<->>B: i',
          'A<<-->>B: j',
        ].join('\n'),
      ),
    ) as SequenceDiagram
    const arrows = d.events.map((e) => (e.kind === 'message' ? [e.line, e.head, e.bidirectional] : null))
    expect(arrows).toEqual([
      ['solid', 'none', false],
      ['dotted', 'none', false],
      ['solid', 'arrow', false],
      ['dotted', 'arrow', false],
      ['solid', 'cross', false],
      ['dotted', 'cross', false],
      ['solid', 'open', false],
      ['dotted', 'open', false],
      ['solid', 'arrow', true],
      ['dotted', 'arrow', true],
    ])
  })

  it('declares participants implicitly, in order of appearance, with aliases', () => {
    const d = parse(seq('participant B as Bob\nactor A as "Alice"\nC->>B: x\nB->>A: y')) as SequenceDiagram
    expect(d.participants.map((p) => [p.id, p.label, p.kind])).toEqual([
      ['B', 'Bob', 'participant'],
      ['A', 'Alice', 'actor'],
      ['C', 'C', 'participant'],
    ])
  })

  it('keeps hyphens in names apart from arrows', () => {
    const d = parse(seq('participant Web-xyz\nWeb-xyz->>DB: q')) as SequenceDiagram
    const m = d.events[0]!
    expect(m.kind === 'message' && [m.from, m.to]).toEqual(['Web-xyz', 'DB'])
  })

  it('numbers messages with autonumber, start and step', () => {
    const d = parse(seq('autonumber 10 5\nA->>B: a\nB->>A: b\nautonumber off\nA->>B: c')) as SequenceDiagram
    expect(d.events.map((e) => (e.kind === 'message' ? e.number : null))).toEqual([10, 15, undefined])
  })

  it('reads notes, blocks, boxes, create and destroy', () => {
    const d = parse(fixture('sequence-boxes')) as SequenceDiagram
    expect(d.boxes).toEqual([
      { label: 'Frontend', color: 'Lavender' },
      { label: 'Backend', color: 'rgb(240, 248, 255)' },
    ])
    expect(d.participants.find((p) => p.id === 'P')).toMatchObject({ created: true, label: 'Payment' })
    expect(d.events.some((e) => e.kind === 'destroy' && e.actor === 'P')).toBe(true)
  })

  it('tells a box label from a box colour', () => {
    const d = parse(seq('box Team Alpha\nparticipant A\nend\nA->>A: x')) as SequenceDiagram
    expect(d.boxes[0]).toEqual({ label: 'Team Alpha', color: undefined })
  })

  it('splits statements on semicolons but not inside entities', () => {
    const d = parse(seq('A->>B: one#59; still one; B->>A: two')) as SequenceDiagram
    expect(d.events).toHaveLength(2)
    const first = d.events[0]!
    expect(first.kind === 'message' && first.text).toBe('one#59; still one')
  })
})

describe('sequence: errors', () => {
  it('points at an unknown arrow', () => {
    const e = errorOf(seq('A->>B: ok\nAlice-->>>Bob: hi'))
    expect(e.line).toBe(3)
    expect(e.column).toBeGreaterThan(5)
    expect(e.message).toContain('known arrow')
  })

  it('rejects a line that is no statement at all', () => {
    const e = errorOf(seq('A->>B: ok\nA=>>B: hi'))
    expect(e.line).toBe(3)
    expect(e.column).toBe(1)
  })

  it('reports an unclosed block at the line that opened it', () => {
    const e = errorOf(seq('A->>B: a\nloop forever\nA->>B: b'))
    expect(e.line).toBe(3)
    expect(e.message).toContain('never closed')
  })

  it('rejects end without a block', () => {
    const e = errorOf(seq('A->>B: a\nend'))
    expect(e.line).toBe(3)
  })

  it('rejects else outside alt', () => {
    const e = errorOf(seq('loop x\nA->>B: a\nelse y\nend'))
    expect(e.line).toBe(4)
    expect(e.message).toContain('alt')
  })

  it('rejects deactivating a participant that is not active', () => {
    const e = errorOf(seq('A->>+B: a\nB-->>-A: b\nB-->>-A: c'))
    expect(e.line).toBe(4)
    expect(e.message).toContain('not active')
    expect(errorOf(seq('A->>B: a\ndeactivate B')).line).toBe(3)
  })

  it('rejects an unsafe rect colour', () => {
    expect(errorOf(seq('rect url(#x)\nA->>B: a\nend')).line).toBe(2)
  })

  it('rejects using a participant after it was destroyed', () => {
    const e = errorOf(seq('A->>B: a\ndestroy B\nA-xB: bye\nB->>A: again'))
    expect(e.line).toBe(5)
  })

  it('rejects creating a participant that exists', () => {
    expect(errorOf(seq('A->>B: a\ncreate participant B\nA->>B: b')).line).toBe(3)
  })
})

describe('sequence: rendering', () => {
  const fixtures = ['sequence-basic', 'sequence-activations', 'sequence-blocks', 'sequence-boxes']

  it.each(fixtures)('renders %s deterministically', (name) => {
    const source = fixture(name)
    const a = render(source, opts)
    expect(a.type).toBe('sequence')
    expect(a.svg.startsWith('<svg')).toBe(true)
    expect(a.svg).toBe(render(source, opts).svg)
  })

  it('draws actors top and bottom, and one lifeline per participant', () => {
    const { svg } = render(seq('participant A\nparticipant B\nA->>B: hi'), opts)
    expect(svg.match(/class="dg-actor-box"/g)).toHaveLength(4)
    expect(svg.match(/class="dg-lifeline"/g)).toHaveLength(2)
  })

  it('draws an activation box per activation', () => {
    const { svg } = render(fixture('sequence-activations'), opts)
    expect(svg.match(/class="dg-activation"/g)).toHaveLength(3)
  })

  it('draws frames with their keyword and separators', () => {
    const { svg } = render(fixture('sequence-blocks'), opts)
    for (const kind of ['loop', 'alt', 'par', 'critical', 'opt', 'break']) {
      expect(svg).toContain(`dg-frame-${kind}`)
    }
    expect(svg.match(/class="dg-block-sep"/g)).toHaveLength(4)
    expect(svg).toContain('class="dg-rect"')
  })

  it('ends a destroyed lifeline with a cross and no bottom box', () => {
    const { svg } = render(seq('A->>B: a\ndestroy B\nA-xB: bye'), opts)
    expect(svg).toContain('class="dg-destroy"')
    expect(svg.match(/class="dg-actor-box"/g)).toHaveLength(3)
  })

  it('widens the gap for a long message', () => {
    const short = render(seq('A->>B: hi'), opts).width
    const long = render(seq(`A->>B: ${'a very long message '.repeat(5)}`), opts).width
    expect(long).toBeGreaterThan(short + 200)
  })

  it('escapes labels everywhere', () => {
    const evil = '<script>alert(1)</script>'
    const { svg } = render(
      seq(
        `participant A as ${evil}\nA->>B: ${evil}\nNote over A,B: ${evil}\nloop ${evil}\nA->>B: x\nend\nbox ${evil}\nparticipant C\nend\nB->>C: y`,
      ),
      opts,
    )
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
  })

  it('uses only defined markers', () => {
    const { svg } = render(fixture('sequence-basic'), opts)
    const used = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1])
    for (const id of used) expect(svg).toContain(`id="${id}"`)
  })
})
