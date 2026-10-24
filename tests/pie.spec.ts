import { describe, expect, it } from 'vitest'
import { approximateMeasurer, detect, DiagramError, parse, render } from '../src'

const opts = { measureText: approximateMeasurer }

describe('pie', () => {
  const source = `pie showData
    title Pets adopted
    "Dogs" : 386
    "Cats" : 85.5
    "Rats" : 15`

  it('is detected', () => {
    expect(detect(source)).toBe('pie')
  })

  it('parses slices in source order', () => {
    expect(parse(source)).toMatchObject({
      showData: true,
      title: 'Pets adopted',
      slices: [
        { label: 'Dogs', value: 386 },
        { label: 'Cats', value: 85.5 },
        { label: 'Rats', value: 15 },
      ],
    })
  })

  it('renders an svg with one path per slice and the data in the legend', () => {
    const { svg, width, height } = render(source, opts)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.match(/class="dg-pie-slice"/g)).toHaveLength(3)
    expect(svg).toContain('Cats [85.5]')
    expect(width).toBeGreaterThan(260)
    expect(height).toBeGreaterThan(260)
  })

  it('is deterministic', () => {
    expect(render(source, opts).svg).toBe(render(source, opts).svg)
  })

  it('draws a single slice as a full circle', () => {
    expect(render('pie\n"All" : 1', opts).svg).toContain('<circle class="dg-pie-slice"')
  })

  it('reports the line of a bad slice', () => {
    try {
      render('pie\n"A" : 1\nnonsense', opts)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(DiagramError)
      expect((error as DiagramError).line).toBe(3)
    }
  })

  it('escapes labels', () => {
    const { svg } = render('pie\n"<script>alert(1)</script>" : 1\n"b" : 2', opts)
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
  })
})
