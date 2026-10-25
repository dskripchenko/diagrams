import { describe, expect, it } from 'vitest'
import { approximateMeasurer, detect, DiagramError, parse, render } from '../src'
import { parseTimeline } from '../src/diagrams/timeline'

const opts = { measureText: approximateMeasurer }

function error(source: string): DiagramError {
  try {
    parseTimeline(source)
  } catch (e) {
    expect(e).toBeInstanceOf(DiagramError)
    return e as DiagramError
  }
  throw new Error('expected a DiagramError')
}

describe('timeline parsing', () => {
  it('is detected', () => {
    expect(detect('timeline\n  2024 : A')).toBe('timeline')
  })

  it('reads periods, several events per line and continuation lines', () => {
    const d = parseTimeline(`timeline
      title History of social media
      %% a comment
      2002 : LinkedIn
      2004 : Facebook : Google
           : Orkut
      2005`)
    expect(d.title).toBe('History of social media')
    expect(d.periods).toEqual([
      { label: '2002', events: ['LinkedIn'], section: null, line: 4 },
      { label: '2004', events: ['Facebook', 'Google', 'Orkut'], section: null, line: 5 },
      { label: '2005', events: [], section: null, line: 7 },
    ])
  })

  it('keeps colons that are not followed by a space', () => {
    const d = parseTimeline('timeline\n  10:30 : Stand-up at 10:30 : Lunch')
    expect(d.periods[0]).toMatchObject({ label: '10:30', events: ['Stand-up at 10:30', 'Lunch'] })
  })

  it('groups periods into sections', () => {
    const d = parseTimeline(`timeline
      Before : x
      section 17th-20th century
        Industry 1.0 : Machinery
        Industry 2.0 : Electricity
      section Empty
      section 21st century
        Industry 3.0 : Computers`)
    expect(d.sections.map((s) => s.label)).toEqual(['17th-20th century', 'Empty', '21st century'])
    expect(d.periods.map((p) => p.section)).toEqual([null, 0, 0, 2])
  })

  it('reads accessibility statements', () => {
    expect(parse('timeline\n  accTitle: Releases\n  accDescr: What shipped when\n  2024 : A')).toMatchObject({
      accessibility: { title: 'Releases', description: 'What shipped when' },
    })
  })

  it('reports events without a period', () => {
    expect(error('timeline\n  title T\n  : orphan')).toMatchObject({ line: 3, column: 3 })
  })

  it('reports an empty event with its column', () => {
    expect(error('timeline\n  2024 : a :  : b')).toMatchObject({ line: 2, column: 12 })
    expect(error('timeline\n  2024 :').line).toBe(2)
  })

  it('reports unsupported options and empty timelines', () => {
    expect(error('timeline TD\n  2024 : a').message).toMatch(/Vertical timelines/)
    expect(error('timeline sideways\n  2024 : a').line).toBe(1)
    expect(error('timeline\n  title Only a title').message).toMatch(/no time periods/)
    expect(error('timeline\n  section').hint).toMatch(/section/)
  })
})

describe('timeline rendering', () => {
  const source = `timeline
    title Industrial revolution
    section 17th-20th century
      Industry 1.0 : Machinery, Water power, Steam <br>power
      Industry 2.0 : Electricity
    section 21st century
      Industry 3.0 : Electronics : Computers`

  it('draws a section header per section and a box per period and event', () => {
    const { svg } = render(source, opts)
    expect(svg.match(/class="dg-node dg-tl-section"/g)).toHaveLength(2)
    expect(svg.match(/class="dg-node dg-tl-period"/g)).toHaveLength(3)
    expect(svg.match(/class="dg-node dg-tl-event"/g)).toHaveLength(4)
    expect(svg).toContain('Industrial revolution')
  })

  it('colours by section with sections and by period without', () => {
    const { svg } = render(source, opts)
    expect(svg).toContain('var(--dg-pie-1')
    expect(svg).toContain('var(--dg-pie-2')
    expect(svg).not.toContain('var(--dg-pie-3')
    const plain = render('timeline\n  a : x\n  b : y\n  c : z', opts).svg
    expect(plain).toContain('var(--dg-pie-3')
    expect(plain).toContain('dg-tl-solid')
  })

  it('escapes labels', () => {
    const { svg } = render('timeline\n  title <b>t</b>\n  <script>x</script> : "><img src=x onerror=alert(1)>', opts)
    expect(svg).not.toMatch(/<script|<img|<b>/)
    expect(svg).toContain('&lt;script&gt;')
  })

  it('is deterministic and uses the id prefix', () => {
    const a = render(source, { ...opts, idPrefix: 'tl-one' })
    expect(a.svg).toBe(render(source, { ...opts, idPrefix: 'tl-one' }).svg)
    expect(a.svg).toContain('id="tl-one"')
    expect(a.svg).toContain('#tl-one .dg-tl-axis')
  })

  it('widens the picture for a title longer than the columns', () => {
    const narrow = render('timeline\n  2024 : a', opts)
    const wide = render(`timeline\n  title ${'A very long title '.repeat(4)}\n  2024 : a`, opts)
    expect(wide.width).toBeGreaterThan(narrow.width + 200)
  })
})
