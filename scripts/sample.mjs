// Renders a .mmd file to SVG next to it in tests/browser/output (for eyeballing).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename } from 'node:path'
const { render, approximateMeasurer } = await import('../dist/index.mjs')
mkdirSync('tests/browser/output', { recursive: true })
for (const file of process.argv.slice(2)) {
  let svg; try { ({ svg } = render(readFileSync(file, "utf8"), { measureText: approximateMeasurer })) } catch (e) { console.error(file, e.message); continue }
  writeFileSync(`tests/browser/output/${basename(file, '.mmd')}.svg`, svg)
}
