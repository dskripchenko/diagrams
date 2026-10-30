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
  .filter((f) => /\.(mmd|puml|dot|d2|dbml|dsl|owm)$/.test(f) && f.includes(filter))
  .map((f) => ({ name: f.replace(/\.(mmd|puml|dot|d2|dbml|dsl|owm)$/, ''), source: readFileSync(join(root, 'tests/fixtures', f), 'utf8') }))

const DARK = `
  .dark { background: #0f172a; color-scheme: dark;
    --dg-text: #e2e8f0; --dg-text-muted: #94a3b8; --dg-line: #94a3b8;
    --dg-node-fill: #1e1b4b; --dg-node-stroke: #818cf8; --dg-node-text: #e0e7ff;
    --dg-row-fill: #0f172a; --dg-row-alt-fill: #161e33;
    --dg-cluster-fill: #111827; --dg-cluster-stroke: #334155; --dg-cluster-text: #cbd5e1;
    --dg-edge-label-fill: #0f172a; --dg-note-fill: #422006; --dg-note-stroke: #ca8a04; --dg-note-text: #fef9c3;
    --dg-actor-fill: #1e1b4b; --dg-actor-stroke: #818cf8; --dg-activation-fill: #312e81;
    --dg-block-stroke: #64748b; --dg-block-label-fill: #1e293b; --dg-grid: #1f2937;
    --dg-state-start: #e2e8f0; --dg-lifeline: #475569;
    --dg-c4-person-fill: #1f5c99; --dg-c4-person-stroke: #6aa5e0; --dg-c4-system-fill: #1f6fbf; --dg-c4-system-stroke: #7bb4ee; --dg-c4-container-fill: #3b7fc0; --dg-c4-container-stroke: #93c5fd; --dg-c4-component-stroke: #bfdbfe; --dg-c4-external-fill: #5f6670; --dg-c4-external-stroke: #9ca3af; }`

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
    // Figures (actor, interface…) have their label under the outline, by design.
    for (const group of svg.querySelectorAll('.dg-node:not(.dg-node-figure)')) {
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
    // C4: every line of an element's text inside its shape; elements apart
    // from each other, inside their own boundary and outside every other one.
    const c4 = [...svg.querySelectorAll('.dg-c4-element')].map((g) => ({
      id: g.getAttribute('data-id'),
      parent: g.getAttribute('data-parent'),
      box: g.querySelector('.dg-shape').getBBox(),
      texts: [...g.querySelectorAll('text')],
    }))
    const frames = new Map(
      [...svg.querySelectorAll('.dg-c4-boundary, .dg-c4-node')].map((g) => [
        g.getAttribute('data-id'),
        { parent: g.getAttribute('data-parent'), box: g.querySelector('rect').getBBox() },
      ]),
    )
    const overlap = (a, b) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1
    const inside = (a, b) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1
    for (const e of c4) {
      for (const t of e.texts.slice(1)) {
        if (!inside(t.getBBox(), e.box)) problems.push({ id: e.id, textOutside: t.textContent })
      }
      const ancestors = new Set()
      for (let p = e.parent; p; p = frames.get(p)?.parent) ancestors.add(p)
      for (const [fid, f] of frames) {
        if (ancestors.has(fid) ? !inside(e.box, f.box) : overlap(e.box, f.box)) problems.push({ id: e.id, frame: fid })
      }
    }
    c4.forEach((a, i) => c4.slice(i + 1).forEach((b) => overlap(a.box, b.box) && problems.push({ overlap: [a.id, b.id] })))
    // C4 relations: no path through an element it does not connect or through
    // a frame title; no label over another label or over an element.
    if (c4.length > 0) {
      const shrink = (b, m) => ({ x: b.x + m, y: b.y + m, width: b.width - 2 * m, height: b.height - 2 * m })
      const within = (p, b) => p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height
      const groups = [...svg.querySelectorAll('.dg-c4-element')].map((g) => ({ id: g.getAttribute('data-id'), box: shrink(g.getBBox(), 2) }))
      const titles = [...svg.querySelectorAll('.dg-c4-frame-title')].map((g) => ({ id: g.getAttribute('data-id'), box: shrink(g.getBBox(), 1) }))
      for (const path of svg.querySelectorAll('.dg-c4-rel')) {
        const from = path.getAttribute('data-from')
        const to = path.getAttribute('data-to')
        const length = path.getTotalLength()
        const hits = new Set()
        for (let s = 0; s <= length; s += 3) {
          const p = path.getPointAtLength(s)
          for (const g of groups) if (g.id !== from && g.id !== to && within(p, g.box)) hits.add('element ' + g.id)
          for (const t of titles) if (within(p, t.box)) hits.add('title ' + t.id)
        }
        for (const h of hits) problems.push({ relation: from + '→' + to, crosses: h })
      }
      const labels = [...svg.querySelectorAll('.dg-c4-rel-label-group')].map((g) => ({
        text: g.textContent,
        box: shrink(g.querySelector('.dg-edge-label-box').getBBox(), 1),
      }))
      labels.forEach((a, i) => {
        for (const b of labels.slice(i + 1)) if (overlap(a.box, b.box)) problems.push({ labels: [a.text, b.text] })
        for (const g of groups) if (overlap(a.box, g.box)) problems.push({ label: a.text, over: g.id })
      })
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
