import { describe, expect, it } from 'vitest'
import { approximateMeasurer, detect, render } from '../src'

/**
 * Every fixture renders, renders the same twice, and matches its stored
 * SVG. A changed snapshot is a decision: look at the picture, then update
 * with `vitest -u`.
 */
const fixtures = import.meta.glob('./fixtures/*.mmd', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

const opts = { measureText: approximateMeasurer }

describe('corpus', () => {
  for (const [path, source] of Object.entries(fixtures)) {
    const name = path.replace('./fixtures/', '').replace('.mmd', '')
    it(name, async () => {
      expect(detect(source)).not.toBeNull()
      const first = render(source, opts)
      expect(render(source, opts).svg).toBe(first.svg)
      expect(first.width).toBeGreaterThan(0)
      expect(first.height).toBeGreaterThan(0)
      await expect(first.svg).toMatchFileSnapshot(`./__snapshots__/${name}.svg`)
    })
  }
})

/** A label that would become markup if anything were not escaped. */
const PAYLOADS = ['<script>alert(1)</script>', '"><svg onload=alert(1)>', "'><img src=x onerror=alert(1)>", '</text><script>x</script>']

const TEMPLATES: Record<string, (p: string) => string> = {
  flowchart: (p) => `flowchart LR\n  A["${p.replace(/"/g, '#quot;')}"] -->|"${p.replace(/"/g, '#quot;')}"| B\n  subgraph S["${p.replace(/"/g, '#quot;')}"]\n  B\n  end`,
  sequence: (p) => `sequenceDiagram\n  participant A as ${p}\n  A->>B: ${p}\n  Note over A: ${p}`,
  state: (p) => `stateDiagram-v2\n  A : ${p}\n  A --> B : ${p}\n  note right of A : ${p}`,
  pie: (p) => `pie title ${p}\n  "${p.replace(/"/g, '#quot;')}" : 1\n  "b" : 2`,
  timeline: (p) => `timeline\n  title ${p}\n  section ${p}\n  ${p.replace(/:/g, '')} : ${p.replace(/:/g, '')}`,
  xychart: (p) => `xychart-beta\n  title ${p}\n  x-axis ${p.replace(/[[\]"]/g, '')} ["${p.replace(/"/g, '')}", b]\n  bar ${p.replace(/[[\]"]/g, '')} [1, 2]`,
  mindmap: (p) => `mindmap\n  root["${p.replace(/"/g, '#quot;')}"]\n    ${p.replace(/[[\](){}]/g, '')}\n    a["\`**${p.replace(/"/g, '')}**\`"]`,
  gantt: (p) => `gantt\n  title ${p}\n  dateFormat YYYY-MM-DD\n  section ${p}\n  ${p.replace(/:/g, '')} : a1, 2026-01-01, 3d`,
}

describe('labels never become markup', () => {
  for (const [type, template] of Object.entries(TEMPLATES)) {
    for (const payload of PAYLOADS) {
      it(`${type}: ${payload}`, () => {
        let svg: string
        try {
          svg = render(template(payload), opts).svg
        } catch {
          // Rejecting the input is as safe as escaping it.
          return
        }
        expect(svg).not.toMatch(/<script/i)
        expect(svg).not.toMatch(/<img/i)
        // An event handler only matters inside a tag; as escaped text it is harmless.
        expect(svg).not.toMatch(/<[^>]*\son\w+=/i)
        // Exactly one root svg element, nothing injected.
        expect(svg.match(/<svg/g)).toHaveLength(1)
      })
    }
  }

  it('drops javascript: links', () => {
    expect(() => render('flowchart LR\n  A --> B\n  click A "javascript:alert(1)"', opts)).toThrow(/not allowed/)
  })

  it('rejects style values that could load something', () => {
    expect(() => render('flowchart LR\n  A --> B\n  style A fill:url(https://example.com/x)', opts)).toThrow()
    expect(() => render('flowchart LR\n  A --> B\n  style A background-image:none', opts)).toThrow()
  })
})
