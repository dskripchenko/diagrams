// Renders every fixture in a real browser — with the canvas measurer, as a
// page would — and checks geometry jsdom cannot: every label's text must fit
// inside the shape drawn around it. Screenshots land in tests/browser/output
// for a human to look at, in the light and the dark theme.
//
//   pnpm build && node scripts/browser-check.mjs [filter]
import { readFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'tests/browser/output')
mkdirSync(out, { recursive: true })
const filter = process.argv[2] ?? ''
const fixtures = readdirSync(join(root, 'tests/fixtures'))
  .filter((f) => f.endsWith('.mmd') && f.includes(filter))
  .map((f) => ({ name: f.replace('.mmd', ''), source: readFileSync(join(root, 'tests/fixtures', f), 'utf8') }))

const DARK = `
  .dark { background: #0f172a; color-scheme: dark;
    --dg-text: #e2e8f0; --dg-text-muted: #94a3b8; --dg-line: #94a3b8;
    --dg-node-fill: #1e1b4b; --dg-node-stroke: #818cf8; --dg-node-text: #e0e7ff;
    --dg-row-fill: #0f172a; --dg-row-alt-fill: #161e33;
    --dg-cluster-fill: #111827; --dg-cluster-stroke: #334155; --dg-cluster-text: #cbd5e1;
    --dg-edge-label-fill: #0f172a; --dg-note-fill: #422006; --dg-note-stroke: #ca8a04; --dg-note-text: #fef9c3;
    --dg-actor-fill: #1e1b4b; --dg-actor-stroke: #818cf8; --dg-activation-fill: #312e81;
    --dg-block-stroke: #64748b; --dg-block-label-fill: #1e293b; --dg-grid: #1f2937;
    --dg-state-start: #e2e8f0; --dg-lifeline: #475569; }`

const html = `<!doctype html><meta charset="utf-8">
<style>body{margin:0;font-family:system-ui} .case{padding:16px;display:inline-block} ${DARK}</style>
<body><div id="root"></div>
<script type="module">
  import { render } from '/index.mjs'
  const fixtures = ${JSON.stringify(fixtures)}
  const root = document.getElementById('root')
  const results = []
  for (const f of fixtures) {
    for (const theme of ['light', 'dark']) {
      const box = document.createElement('div')
      box.className = 'case ' + theme
      box.id = f.name + '--' + theme
      try {
        box.innerHTML = render(f.source, { idPrefix: 'd-' + f.name + '-' + theme }).svg
      } catch (e) {
        results.push({ name: f.name, error: String(e) })
      }
      root.appendChild(box)
    }
  }
  await document.fonts.ready
  // Label text must fit inside its shape: the shape is the first drawn sibling.
  for (const f of fixtures) {
    const svg = document.querySelector('#' + CSS.escape(f.name + '--light') + ' svg')
    if (!svg) continue
    const problems = []
    for (const group of svg.querySelectorAll('.dg-node')) {
      const shape = group.querySelector('.dg-shape, rect, polygon, circle, path')
      const text = group.querySelector('text')
      if (!shape || !text || !text.textContent.trim()) continue
      const s = shape.getBBox()
      const t = text.getBBox()
      const slack = 1
      if (t.x < s.x - slack || t.y < s.y - slack || t.x + t.width > s.x + s.width + slack || t.y + t.height > s.y + s.height + slack) {
        problems.push({ id: group.getAttribute('data-id'), text: text.textContent, shape: [s.x, s.y, s.width, s.height].map(Math.round), label: [t.x, t.y, t.width, t.height].map(Math.round) })
      }
    }
    for (const rect of svg.querySelectorAll('.dg-edge-label-box')) {
      const text = rect.parentNode.querySelector('text')
      if (!text) continue
      const s = rect.getBBox()
      const t = text.getBBox()
      if (t.width > s.width + 1 || t.height > s.height + 1) problems.push({ edgeLabel: text.textContent, box: [s.width, s.height].map(Math.round), label: [t.width, t.height].map(Math.round) })
    }
    // Boxes of rows (entities, classes): every text inside its box, no two
    // texts overlapping, every edge ending on a box border, labels clear of boxes.
    const rowBoxes = [...svg.querySelectorAll('.dg-entity, .dg-uml-class')]
    if (rowBoxes.length > 0) {
      const boxes = rowBoxes.map((g) => ({ id: g.getAttribute('data-id'), b: g.querySelector('.dg-shape').getBBox() }))
      const overlap = (a, b, pad = 0) =>
        a.x < b.x + b.width - pad && b.x < a.x + a.width - pad && a.y < b.y + b.height - pad && b.y < a.y + a.height - pad
      for (const [i, g] of rowBoxes.entries()) {
        const s = boxes[i].b
        const texts = [...g.querySelectorAll('text')].filter((t) => t.textContent.trim()).map((t) => ({ t: t.textContent, b: t.getBBox() }))
        for (const { t, b } of texts) {
          if (b.x < s.x - 1 || b.y < s.y - 1 || b.x + b.width > s.x + s.width + 1 || b.y + b.height > s.y + s.height + 1) {
            problems.push({ box: boxes[i].id, outside: t })
          }
        }
        for (let a = 0; a < texts.length; a++)
          for (let c = a + 1; c < texts.length; c++)
            if (overlap(texts[a].b, texts[c].b, 2)) problems.push({ box: boxes[i].id, overlapping: [texts[a].t, texts[c].t] })
      }
      const onBorder = (p) =>
        boxes.some(({ b }) => {
          const inX = p.x >= b.x - 1 && p.x <= b.x + b.width + 1
          const inY = p.y >= b.y - 1 && p.y <= b.y + b.height + 1
          const nearX = Math.abs(p.x - b.x) <= 1 || Math.abs(p.x - b.x - b.width) <= 1
          const nearY = Math.abs(p.y - b.y) <= 1 || Math.abs(p.y - b.y - b.height) <= 1
          return (inX && nearY) || (inY && nearX)
        })
      for (const path of svg.querySelectorAll('.dg-edge')) {
        const nums = (path.getAttribute('d').match(/-?[0-9.]+/g) ?? []).map(Number)
        const ends = [{ x: nums[0], y: nums[1] }, { x: nums[nums.length - 2], y: nums[nums.length - 1] }]
        for (const p of ends) if (!onBorder(p)) problems.push({ edge: path.getAttribute('data-from') + '→' + path.getAttribute('data-to'), offBorder: [p.x, p.y].map(Math.round) })
      }
      for (const label of svg.querySelectorAll('.dg-edge-label-box, .dg-uml-cardinality')) {
        const lb = label.getBBox()
        for (const { id, b } of boxes) if (overlap(lb, b, 1)) problems.push({ label: label.parentNode.textContent || label.textContent, over: id })
      }
    }
    results.push({ name: f.name, problems })
  }
  window.__results = results
</script>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })
await page.route('http://check.local/**', (route) => {
  const url = new URL(route.request().url())
  if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html })
  if (url.pathname === '/index.mjs') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(root, 'dist/index.mjs')) })
  return route.fulfill({ status: 404 })
})
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://check.local/')
await page.waitForFunction(() => window.__results, null, { timeout: 30000 })
const results = await page.evaluate(() => window.__results)
for (const f of fixtures) {
  for (const theme of ['light', 'dark']) {
    const el = await page.$('#' + f.name + '--' + theme)
    if (el) await el.screenshot({ path: join(out, `${f.name}--${theme}.png`) })
  }
}
await browser.close()

let failed = errors.length > 0
for (const e of errors) console.error('page error:', e)
for (const r of results) {
  if (r.error) {
    failed = true
    console.error(`✗ ${r.name}: ${r.error}`)
  } else if (r.problems.length > 0) {
    failed = true
    console.error(`✗ ${r.name}: ${r.problems.length} problem(s): labels that do not fit or overlap, edges off their boxes`)
    for (const p of r.problems) console.error('   ', JSON.stringify(p))
  } else {
    console.log(`✓ ${r.name}`)
  }
}
process.exit(failed ? 1 : 0)
