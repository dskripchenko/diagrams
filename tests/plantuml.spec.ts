import { describe, expect, it } from 'vitest'
import { approximateMeasurer, detect, detectSyntax, DiagramError, parse, render } from '../src'
import type { Flowchart } from '../src/diagrams/flowchart/parser'
import type { SequenceDiagram } from '../src/diagrams/sequence/parser'

const opts = { measureText: approximateMeasurer }
const uml = (body: string) => `@startuml\n${body}\n@enduml`
const seq = (body: string) => parse(uml(body)) as SequenceDiagram
const flow = (body: string) => parse(uml(body)) as Flowchart
const error = (source: string): DiagramError => {
  try {
    render(source, opts)
  } catch (e) {
    return e as DiagramError
  }
  throw new Error('rendered')
}

describe('PlantUML: the frame and detection', () => {
  it('recognises the syntax and the diagram kind', () => {
    expect(detectSyntax(uml('A -> B'))).toBe('plantuml')
    expect(detectSyntax('flowchart LR\n A --> B')).toBe('mermaid')
    expect(detect(uml('A -> B : hi'))).toBe('sequence')
    expect(detect(uml('start\n:Work;\nstop'))).toBe('flowchart')
    expect(detect(uml('[A] --> [B]'))).toBe('flowchart')
    expect(detect(uml('actor U\nU --> (Use)'))).toBe('flowchart')
    // Elements that sequence diagrams also know: deployment when other elements are there.
    expect(detect(uml('entity E\nnode N\nE --> N'))).toBe('flowchart')
    expect(detect(uml('entity E\nE -> E : self'))).toBe('sequence')
  })

  it('skips comments, styling and the shared statements', () => {
    const d = seq(`' a comment\n/' a block\ncomment '/\nskinparam monochrome true\nskinparam sequence {\n  ArrowColor red\n}\n!theme plain\ntitle Hello\nA -> B : hi`)
    expect(d.title).toBe('Hello')
    expect(d.events).toHaveLength(1)
  })

  it('explains what it cannot do', () => {
    expect(error('@startuml\nA -> B').message).toMatch(/@enduml/)
    expect(error(uml('!include common.puml\nA -> B')).hint).toMatch(/no files/)
    expect(error(uml('class A')).message).toMatch(/not supported yet/)
    expect(error(uml('start\n|Lane|\n:a;\nstop')).message).toMatch(/Swimlanes/)
    expect(error('@startmindmap\n* a\n@endmindmap').message).toMatch(/not supported yet/)
    const e = error(uml('A -> B\nwhat is this'))
    expect(e).toBeInstanceOf(DiagramError)
    expect(e.line).toBe(3)
  })
})

describe('PlantUML sequence', () => {
  it('declares every participant kind, with names, aliases and stereotypes', () => {
    const d = seq('actor A\nboundary B\ncontrol C\nentity E\ndatabase D\ncollections L\nqueue Q\nparticipant "Long name" as P <<svc>> #pink')
    expect(d.participants.map((p) => p.kind)).toEqual(['actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue', 'participant'])
    expect(d.participants[7]).toMatchObject({ id: 'P', label: 'Long name<br>«svc»' })
  })

  it('reads arrows: direction, dots, heads, both ends', () => {
    const d = seq('A -> B : a\nA --> B : b\nA ->> B : c\nB <- A : d\nA <-> B : e\nA ->x B : f\nA -[#red]> B : g')
    const m = d.events.filter((e) => e.kind === 'message')
    expect(m.map((e) => [e.from, e.to, e.line, e.head, e.bidirectional])).toEqual([
      ['A', 'B', 'solid', 'arrow', false],
      ['A', 'B', 'dotted', 'arrow', false],
      ['A', 'B', 'solid', 'open', false],
      ['A', 'B', 'solid', 'arrow', false],
      ['A', 'B', 'solid', 'arrow', true],
      ['A', 'B', 'solid', 'cross', false],
      ['A', 'B', 'solid', 'arrow', false],
    ])
  })

  it('activates with ++, returns to the caller, creates and destroys', () => {
    const d = seq('A -> B ++ : call\nB -> C ** : make\nreturn done\nA -> C !! : bye')
    const m = d.events.filter((e) => e.kind === 'message')
    expect(m[0]).toMatchObject({ activateTarget: true })
    expect(m[2]).toMatchObject({ from: 'B', to: 'A', line: 'dotted', deactivateSource: true, text: 'done' })
    expect(d.participants.find((p) => p.id === 'C')!.created).toBe(true)
    expect(d.events.some((e) => e.kind === 'destroy' && e.actor === 'C')).toBe(true)
  })

  it('reads notes, refs, blocks, dividers, delays and space', () => {
    const d = seq('A -> B : x\nnote left : beside\nnote over A, B\n  two\n  lines\nend note\nref over A : other\nalt one\nA -> B\nelse two\nB -> A\nend\npar\nA -> B\nelse\nB -> A\nend\n== Stage ==\n...\n... wait ...\n|||\n||30||')
    const kinds = d.events.map((e) => e.kind)
    expect(kinds).toContain('note')
    expect(d.events.find((e) => e.kind === 'note' && e.placement === 'over')).toMatchObject({ text: 'two<br>lines' })
    expect(d.events.find((e) => e.kind === 'note' && e.text.startsWith('ref'))).toBeTruthy()
    expect(d.events.filter((e) => e.kind === 'block-section').map((e) => e.keyword)).toEqual(['else', 'and'])
    expect(d.events.filter((e) => e.kind === 'divider')).toHaveLength(1)
    expect(d.events.filter((e) => e.kind === 'delay').map((e) => e.text)).toEqual(['', 'wait'])
    expect(d.events.filter((e) => e.kind === 'space').map((e) => e.height)).toEqual([20, 30])
  })

  it('numbers messages, boxes participants, hides the footbox', () => {
    const d = seq('hide footbox\nautonumber 10 5\nbox "Team" #LightBlue\nparticipant A\nend box\nA -> B\nA -> B\nautonumber stop\nA -> B')
    expect(d.events.filter((e) => e.kind === 'message').map((e) => e.number)).toEqual([10, 15, undefined])
    expect(d.boxes[0]).toMatchObject({ label: 'Team', color: 'LightBlue' })
    expect(d.hideFootbox).toBe(true)
    const shown = render(uml('hide footbox\nA -> B'), opts).svg
    expect(shown.match(/class="dg-actor"/g)).toHaveLength(2)
  })

  it('draws the icon kinds, dividers and delays', () => {
    const svg = render(uml('boundary B\ndatabase D\nB -> D\n== Stage ==\n... later ...'), opts).svg
    expect(svg).toContain('dg-actor-boundary')
    expect(svg).toContain('dg-actor-database')
    expect(svg).toContain('dg-divider')
    expect(svg).toContain('dg-delay-text')
  })
})

describe('PlantUML use case, component and deployment', () => {
  it('reads shorthands, keywords, aliases and stereotypes', () => {
    const c = flow(':Admin: as A\n(Sign in) as S\n[Billing] <<service>>\n() "REST" as R\nnode "K8s" as K\nA --> S')
    expect(c.nodes.get('A')).toMatchObject({ shape: 'actor', text: 'Admin' })
    expect(c.nodes.get('S')).toMatchObject({ shape: 'usecase', text: 'Sign in' })
    expect(c.nodes.get('Billing')).toMatchObject({ shape: 'component', text: 'Billing<br>«service»' })
    expect(c.nodes.get('R')).toMatchObject({ shape: 'interface', text: 'REST' })
    expect(c.nodes.get('K')).toMatchObject({ shape: 'node', text: 'K8s' })
  })

  it('nests containers and resolves elements by alias or shown name', () => {
    const c = flow('package P {\n  node N {\n    [Api] as A\n  }\n}\n[Api] --> DB\ndatabase DB')
    expect(c.subgraphs.get('P')).toMatchObject({ kind: 'folder' })
    expect(c.subgraphs.get('N')).toMatchObject({ kind: 'node', parent: 'P' })
    expect(c.nodes.get('A')!.subgraph).toBe('N')
    expect(c.edges[0]).toMatchObject({ from: 'A', to: 'DB' })
    expect(c.nodes.get('DB')!.shape).toBe('cylinder')
  })

  it('reads link lines, heads, styles, direction words and labels', () => {
    const c = flow('[A] --> [B] : calls\n[A] ..> [C]\n[A] ==> [D]\n[A] -[hidden]- [E]\n[A] --|> [F]\n[A] *-- [G]\n[A] o-- [H]\n[A] -up-> [I]\n[A] -[#red,dashed]-> [J]')
    const e = c.edges
    expect(e[0]).toMatchObject({ stroke: 'normal', end: 'arrow', text: 'calls' })
    expect(e[1]).toMatchObject({ stroke: 'dotted', end: 'arrow' })
    expect(e[2]).toMatchObject({ stroke: 'thick' })
    expect(e[3]).toMatchObject({ stroke: 'invisible' })
    expect(e[4]).toMatchObject({ end: 'triangle' })
    expect(e[5]).toMatchObject({ start: 'diamond', end: 'none' })
    expect(e[6]).toMatchObject({ start: 'diamond-open' })
    // -up->: I goes above A, so the layout sees I → A with the head at A's end reversed.
    expect(e[7]).toMatchObject({ from: 'I', to: 'A', start: 'arrow', end: 'none' })
    expect(e[8]).toMatchObject({ stroke: 'dotted' })
    expect(e[8]!.style!.shape.stroke).toBe('red')
  })

  it('attaches notes, floating and multi-line', () => {
    const c = flow('[A]\nnote right of [A] : hi\nnote "floating" as N\nN .. [A]\nnote left of [A]\n  one\n  two\nend note')
    const notes = [...c.nodes.values()].filter((n) => n.shape === 'note')
    expect(notes.map((n) => n.text)).toEqual(['hi', 'floating', 'one<br>two'])
  })

  it('does not take a malformed link for an element', () => {
    expect(error(uml('[A] --> [B] what')).message).toMatch(/not an element, a link or a note/)
  })
})

describe('PlantUML activity', () => {
  it('wires if / elseif / else into diamonds with labelled branches', () => {
    const c = flow('start\nif (a?) then (yes)\n:x;\nelseif (b?) then (sure)\n:y;\nelse (no)\n:z;\nendif\n:after;\nstop')
    const diamonds = [...c.nodes.values()].filter((n) => n.shape === 'rhombus').map((n) => n.text)
    expect(diamonds).toEqual(['a?', 'b?'])
    const labels = c.edges.map((e) => e.text).filter(Boolean)
    expect(labels).toEqual(['yes', 'sure', 'no'])
    const after = [...c.nodes.values()].find((n) => n.text === 'after')!
    expect(c.edges.filter((e) => e.to === after.id)).toHaveLength(3)
  })

  it('loops back for while and repeat', () => {
    const c = flow('start\nwhile (more?) is (yes)\n:step;\nendwhile (no)\nrepeat\n:try;\nrepeat while (again?) is (yes) not (no)\nstop')
    const more = [...c.nodes.values()].find((n) => n.text === 'more?')!
    const step = [...c.nodes.values()].find((n) => n.text === 'step')!
    expect(c.edges.some((e) => e.from === step.id && e.to === more.id)).toBe(true)
    const again = [...c.nodes.values()].find((n) => n.text === 'again?')!
    expect(c.edges.find((e) => e.from === again.id && e.text === 'yes')).toBeTruthy()
  })

  it('forks with bars, splits without, groups in partitions, colours actions', () => {
    const c = flow('start\nfork\n:a;\nfork again\n:b;\nend fork\nsplit\n:c;\nsplit again\n:d;\nend split\npartition P {\n#pink:e;\n}\nstop')
    expect([...c.nodes.values()].filter((n) => n.shape === 'fork')).toHaveLength(2)
    const e = [...c.nodes.values()].find((n) => n.text === 'e')!
    expect(e.subgraph).toBeDefined()
    expect(e.style!.shape.fill).toBe('pink')
    const d = [...c.nodes.values()].find((n) => n.text === 'd')!
    expect(c.edges.some((x) => x.from === d.id && x.to === e.id)).toBe(true)
  })

  it('reads multi-line actions, arrow labels and notes; stops loose ends', () => {
    const c = flow('start\n:line one\nline two;\n-> go;\n:next;\nnote right: hi\nkill\n:orphan;')
    expect([...c.nodes.values()].some((n) => n.text === 'line one<br>line two')).toBe(true)
    expect(c.edges.find((e) => e.text === 'go')).toBeTruthy()
    const orphan = [...c.nodes.values()].find((n) => n.text === 'orphan')!
    expect(c.edges.some((e) => e.to === orphan.id)).toBe(false)
  })
})

describe('PlantUML labels never become markup', () => {
  const payload = '<script>alert(1)</script>'
  for (const body of [`A -> B : ${payload}`, `[${payload}] --> [B]`, `start\n:${payload};\nstop`, `note over A : ${payload}`]) {
    it(body.split('\n')[0]!, () => {
      const svg = render(uml(body), opts).svg
      expect(svg).not.toMatch(/<script/i)
    })
  }
})
