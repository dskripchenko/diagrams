import { describe, expect, it } from 'vitest'
import { approximateMeasurer, detect, DiagramError, render } from '../src'
import { parseXyChart } from '../src/diagrams/xychart'
import { axisFormatter, decimalsFor, niceStep, ticks } from '../src/diagrams/xychart/scale'

const opts = { measureText: approximateMeasurer }

function error(source: string): DiagramError {
  try {
    parseXyChart(source)
  } catch (e) {
    expect(e).toBeInstanceOf(DiagramError)
    return e as DiagramError
  }
  throw new Error('expected a DiagramError')
}

describe('xychart scale', () => {
  it('picks steps of 1, 2, 2.5 and 5 times a power of ten', () => {
    expect(niceStep(100, 5)).toBe(20)
    expect(niceStep(7000, 7)).toBe(1000)
    expect(niceStep(1, 4)).toBe(0.25)
    expect(niceStep(0.03, 6)).toBe(0.005)
    expect(niceStep(48, 5)).toBe(10)
  })

  it('grows an automatic range to whole steps and keeps a written one', () => {
    expect(ticks(-1.2, 8.1, 6, true)).toMatchObject({ min: -2, max: 10, step: 2, values: [-2, 0, 2, 4, 6, 8, 10] })
    expect(ticks(4000, 11000, 6, false)).toMatchObject({ min: 4000, max: 11000, values: [4000, 6000, 8000, 10000] })
  })

  it('has no floating point noise in tick values', () => {
    const t = ticks(0, 0.7, 7, true)
    expect(t.values).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7])
    expect(decimalsFor(0.1)).toBe(1)
    expect(decimalsFor(2.5)).toBe(1)
    expect(decimalsFor(500)).toBe(0)
  })

  it('gives a single value room on both sides', () => {
    const t = ticks(5, 5, 5, true)
    expect(t.min).toBeLessThan(5)
    expect(t.max).toBeGreaterThan(5)
  })

  it('formats with a shared unit and decimals', () => {
    const k = axisFormatter([0, 5000, 10000, 15000], 5000)
    expect([0, 5000, 15000].map(k)).toEqual(['0', '5k', '15k'])
    const m = axisFormatter([0, 2.5e6, 5e6, 1e7], 2.5e6)
    expect(m(2.5e6)).toBe('2.5M')
    const small = axisFormatter([-0.5, 0, 0.5], 0.25)
    expect([-0.5, 0, 0.25].map(small)).toEqual(['−0.50', '0', '0.25'])
    // Below ten thousand numbers are printed in full.
    expect(axisFormatter([0, 4000, 8000], 2000)(8000)).toBe('8000')
  })
})

describe('xychart parsing', () => {
  it('is detected under both names', () => {
    expect(detect('xychart-beta\n  bar [1]')).toBe('xychart')
    expect(detect('xychart\n  bar [1]')).toBe('xychart')
  })

  it('reads titles, a categorical x axis, a y range and series', () => {
    const c = parseXyChart(`xychart-beta
      title "Sales Revenue"
      x-axis Months [jan, "feb, early", mar]
      y-axis "Revenue (in $)" 4000 --> 11000
      bar [5000, 6000, 7500]
      line "Trend" [5000, 6000.5, -.5]`)
    expect(c.title).toBe('Sales Revenue')
    expect(c.horizontal).toBe(false)
    expect(c.xAxis).toEqual({ kind: 'band', title: 'Months', categories: ['jan', 'feb, early', 'mar'] })
    expect(c.yAxis).toEqual({ kind: 'linear', title: 'Revenue (in $)', min: 4000, max: 11000 })
    expect(c.series.map((s) => [s.kind, s.title, s.values])).toEqual([
      ['bar', undefined, [5000, 6000, 7500]],
      ['line', 'Trend', [5000, 6000.5, -0.5]],
    ])
  })

  it('reads a numeric x axis, a title-only y axis, horizontal charts and bare titles', () => {
    const c = parseXyChart(`xychart-beta horizontal
      title Requests per region
      x-axis "Load" 0 --> 200
      y-axis Latency
      line [1, 2, 3]`)
    expect(c.horizontal).toBe(true)
    expect(c.title).toBe('Requests per region')
    expect(c.xAxis).toEqual({ kind: 'linear', title: 'Load', min: 0, max: 200 })
    expect(c.yAxis).toEqual({ kind: 'linear', title: 'Latency' })
    expect(parseXyChart('xychart\n  y-axis -10 --> 10\n  bar [1]').yAxis).toEqual({ kind: 'linear', title: undefined, min: -10, max: 10 })
  })

  it('reports a series that does not match the axis', () => {
    const e = error('xychart-beta\n  x-axis [a, b, c]\n  bar [1, 2]')
    expect(e).toMatchObject({ line: 3, column: 3 })
    expect(e.message).toMatch(/2 values, but the x axis has 3 categories/)
    expect(error('xychart-beta\n  line [1, 2]\n  bar [1, 2, 3]').line).toBe(3)
  })

  it('reports bad values and ranges with their column', () => {
    expect(error('xychart-beta\n  bar [1, two, 3]')).toMatchObject({ line: 2, column: 11 })
    expect(error('xychart-beta\n  y-axis "t" 10 --> 5\n  bar [1]').message).toMatch(/greater/)
    expect(error('xychart-beta\n  y-axis "t" a --> 5\n  bar [1]').message).toMatch(/not a range/)
    expect(error('xychart-beta\n  x-axis [a, , b]\n  bar [1, 2]').message).toMatch(/empty/)
    expect(error('xychart-beta\n  bar [1, 2').message).toMatch(/not closed/)
    expect(error('xychart-beta\n  y-axis [a, b]\n  bar [1, 2]').message).toMatch(/numeric/)
  })

  it('reports unknown statements, options and missing data', () => {
    expect(error('xychart-beta\n  area [1, 2]')).toMatchObject({ line: 2, column: 3 })
    expect(error('xychart-beta diagonal\n  bar [1]').line).toBe(1)
    expect(error('xychart-beta\n  title T').message).toMatch(/no data/)
    expect(error('xychart-beta\n  x-axis [a]\n  x-axis [b]\n  bar [1]').line).toBe(3)
    expect(error('xychart-beta\n  bar').hint).toMatch(/bar \[1, 2, 3\]/)
  })
})

describe('xychart rendering', () => {
  const source = `xychart-beta
    title "Quarterly results"
    x-axis [Q1, Q2, Q3, Q4]
    bar "Revenue" [4.2, 5.1, 3.8, 6.4]
    bar "Profit" [0.8, -0.6, -1.2, 1.4]
    line "Forecast" [4, 4.8, 5.2, 5.9]`

  it('draws one bar per value, a path per line and a legend for titled series', () => {
    const { svg } = render(source, opts)
    expect(svg.match(/class="dg-xy-bar"/g)).toHaveLength(8)
    expect(svg.match(/class="dg-xy-line-path"/g)).toHaveLength(1)
    expect(svg.match(/class="dg-xy-legend-item"/g)).toHaveLength(3)
    expect(svg).toContain('Forecast')
  })

  it('starts an automatic range from zero for bars and draws the negative ticks', () => {
    const { svg } = render(source, opts)
    expect(svg).toContain('>−2<')
    expect(svg).toContain('>8<')
  })

  it('does not force zero into the range of a line chart', () => {
    const { svg } = render('xychart-beta\n  line [100, 104, 103, 108]', opts)
    expect(svg).not.toMatch(/>0</)
    expect(svg).toContain('>108<')
  })

  it('clips the data with an id from the prefix', () => {
    const { svg } = render(source, { ...opts, idPrefix: 'xy-a' })
    expect(svg).toContain('<clipPath id="xy-a-plot">')
    expect(svg).toContain('clip-path="url(#xy-a-plot)"')
  })

  it('tilts category labels that do not fit their band', () => {
    const tilted = render(
      'xychart-beta\n  x-axis ["A rather long category name", b, c, d, e, f, g, h]\n  bar [1, 2, 3, 4, 5, 6, 7, 8]',
      opts,
    ).svg
    expect(tilted).toContain('rotate(-45')
    expect(render('xychart-beta\n  x-axis [a, b]\n  bar [1, 2]', opts).svg).not.toContain('rotate(-45')
  })

  it('lays a horizontal chart out sideways', () => {
    const v = render('xychart-beta\n  x-axis [a, b, c]\n  bar [1, 2, 3]', opts)
    const h = render('xychart-beta horizontal\n  x-axis [a, b, c]\n  bar [1, 2, 3]', opts)
    expect(h.svg).not.toBe(v.svg)
    expect(h.width).toBeGreaterThan(h.height)
  })

  it('numbers the points when there is no x axis', () => {
    const { svg } = render('xychart-beta\n  bar [3, 1, 2]', opts)
    expect(svg).toContain('>1<')
    expect(svg).toContain('>3<')
  })

  it('escapes labels', () => {
    const { svg } = render('xychart-beta\n  title "<script>x</script>"\n  x-axis ["<img src=x>", b]\n  bar "</text><svg>" [1, 2]', opts)
    expect(svg).not.toMatch(/<script|<img/)
    expect(svg.match(/<svg/g)).toHaveLength(1)
    expect(svg).toContain('&lt;script&gt;')
  })

  it('is deterministic', () => {
    expect(render(source, opts).svg).toBe(render(source, opts).svg)
  })
})
