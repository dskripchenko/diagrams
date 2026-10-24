/**
 * Text: labels as data, how wide they are, and how they become SVG.
 *
 * Layout depends on the width of every label, and there is no single right
 * answer to "how wide is this string" — it depends on the font the reader's
 * browser picks. So measuring is a pluggable function: the browser measures
 * with a canvas, everything else (SSR, Node, tests) uses a table of average
 * glyph widths that is close enough for boxes to fit with their padding.
 */
import { el, txt, type SvgElement } from './svg'

export interface FontSpec {
  /** Pixels. */
  size: number
  family: string
  weight?: 'normal' | 'bold'
  style?: 'normal' | 'italic'
}

export interface TextSize {
  width: number
  height: number
}

export type TextMeasurer = (text: string, font: FontSpec) => TextSize

export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
}

export type TextLine = TextRun[]

/** A label: one or more lines, each a sequence of styled runs. */
export interface Label {
  lines: TextLine[]
}

export const LINE_HEIGHT = 1.25

// ---------------------------------------------------------------------------
// Approximate measurement
// ---------------------------------------------------------------------------

/*
 * Advance widths of Arial/Helvetica in 1/1000 em for printable ASCII (32–126).
 * The family that "sans-serif" resolves to on most systems has metrics close
 * to these; the error is a few percent, which the padding absorbs.
 */
const ASCII_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

/* Cyrillic letters that are noticeably narrower or wider than the average. */
const CYRILLIC_NARROW = new Set('гзтэсеё'.split(''))
const CYRILLIC_WIDE = new Set('жмшщюыЖМШЩЮЫФф'.split(''))

function glyphWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0
  if (code >= 32 && code <= 126) {
    return ASCII_WIDTHS[code - 32] ?? 556
  }
  if (code >= 0x0400 && code <= 0x04ff) {
    if (CYRILLIC_WIDE.has(ch)) return 800
    if (CYRILLIC_NARROW.has(ch)) return 470
    return ch === ch.toUpperCase() ? 690 : 545
  }
  if (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x1f300 && code <= 0x1faff)
  ) {
    return 1000
  }
  if (code === 0x2014 || code === 0x2026) return 1000
  if (code === 0x2013) return 556
  if (code === 0xa0) return 278
  return 600
}

/**
 * Measures with a table of glyph widths. Deterministic, which also makes it
 * the measurer for tests and snapshots.
 */
export const approximateMeasurer: TextMeasurer = (text, font) => {
  let units = 0
  for (const ch of text) {
    units += glyphWidth(ch)
  }
  let width = (units / 1000) * font.size
  if (font.weight === 'bold') {
    width *= 1.07
  }
  return { width, height: font.size * LINE_HEIGHT }
}

// ---------------------------------------------------------------------------
// Canvas measurement
// ---------------------------------------------------------------------------

interface Context2D {
  font: string
  measureText(text: string): { width: number }
}

let canvasContext: Context2D | null | undefined

function context(): Context2D | null {
  if (canvasContext !== undefined) {
    return canvasContext
  }
  canvasContext = null
  try {
    const g = globalThis as unknown as {
      OffscreenCanvas?: new (w: number, h: number) => { getContext(type: '2d'): Context2D | null }
      document?: { createElement(tag: 'canvas'): { getContext(type: '2d'): Context2D | null } }
    }
    if (typeof g.OffscreenCanvas === 'function') {
      canvasContext = new g.OffscreenCanvas(1, 1).getContext('2d')
    } else if (g.document && typeof g.document.createElement === 'function') {
      canvasContext = g.document.createElement('canvas').getContext('2d')
    }
    // jsdom has a canvas element without an implementation; it measures 0.
    if (canvasContext && canvasContext.measureText('M').width <= 0) {
      canvasContext = null
    }
  } catch {
    canvasContext = null
  }
  return canvasContext
}

export function cssFont(font: FontSpec): string {
  return `${font.style === 'italic' ? 'italic ' : ''}${font.weight === 'bold' ? 'bold ' : ''}${font.size}px ${font.family}`
}

function cached(measure: TextMeasurer): TextMeasurer {
  const cache = new Map<string, TextSize>()
  return (text, font) => {
    const key = `${cssFont(font)}\u0000${text}`
    let size = cache.get(key)
    if (!size) {
      size = measure(text, font)
      if (cache.size > 5000) cache.clear()
      cache.set(key, size)
    }
    return size
  }
}

/**
 * The best measurer the environment offers: a canvas when there is one,
 * otherwise the glyph table.
 */
export function defaultMeasurer(): TextMeasurer {
  const ctx = context()
  if (!ctx) {
    return approximateMeasurer
  }
  return cached((text, font) => {
    ctx.font = cssFont(font)
    return { width: ctx.measureText(text).width, height: font.size * LINE_HEIGHT }
  })
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  nbsp: ' ',
  semi: ';',
  colon: ':',
  num: '#',
  hash: '#',
}

/**
 * Mermaid's escapes: `#quot;`, `#35;`, `#x23;`. Decoded to characters — the
 * SVG builder escapes them again on output, so a decoded `<` stays text.
 */
export function decodeEntities(text: string): string {
  return text.replace(/#(x[0-9a-fA-F]+|[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === 'x' || body[0] === 'X') {
      const code = parseInt(body.slice(1), 16)
      return isValidCodePoint(code) ? String.fromCodePoint(code) : whole
    }
    if (/^[0-9]+$/.test(body)) {
      const code = parseInt(body, 10)
      return isValidCodePoint(code) ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
}

function isValidCodePoint(code: number): boolean {
  return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
}

const BR = /<br\s*\/?>/gi

/** Inline markdown in a run of text: `**bold**`, `*italic*` and `_italic_`. */
function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = []
  const pattern = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) runs.push({ text: text.slice(last, index) })
    if (match[2] !== undefined) {
      for (const inner of parseInline(match[2])) runs.push({ ...inner, bold: true })
    } else if (match[4] !== undefined) {
      for (const inner of parseInline(match[4])) runs.push({ ...inner, italic: true })
    }
    last = index + match[0].length
  }
  if (last < text.length) runs.push({ text: text.slice(last) })
  return runs.filter((run) => run.text.length > 0)
}

/**
 * Builds a label from source text.
 *
 * `<br>` in any spelling breaks the line — the one HTML construct understood,
 * because Mermaid diagrams use it everywhere. With `markdown`, newlines also
 * break lines and `**`/`*` style the text (Mermaid's "markdown strings").
 */
export function parseLabel(source: string, options: { markdown?: boolean } = {}): Label {
  const decoded = decodeEntities(source)
  const rawLines = options.markdown
    ? decoded.split(/\r?\n|<br\s*\/?>/i).map((line) => line.trim())
    : decoded.split(BR)
  const lines = rawLines.map((line) =>
    options.markdown ? parseInline(line) : line.length > 0 ? [{ text: line }] : [],
  )
  return { lines: lines.length > 0 ? lines : [[]] }
}

export function plainLabel(text: string): Label {
  return { lines: text.split('\n').map((line) => (line.length > 0 ? [{ text: line }] : [])) }
}

export function labelText(label: Label): string {
  return label.lines.map((line) => line.map((run) => run.text).join('')).join('\n')
}

export function isEmptyLabel(label: Label): boolean {
  return label.lines.every((line) => line.every((run) => run.text.trim() === ''))
}

function runFont(run: TextRun, font: FontSpec): FontSpec {
  return {
    ...font,
    weight: run.bold ? 'bold' : font.weight,
    style: run.italic ? 'italic' : font.style,
  }
}

function lineWidth(line: TextLine, font: FontSpec, measure: TextMeasurer): number {
  let width = 0
  for (const run of line) width += measure(run.text, runFont(run, font)).width
  return width
}

/**
 * Wraps a label to `maxWidth` at spaces. A word wider than the limit stays
 * on its own line rather than being cut — a cut word is unreadable.
 */
export function wrapLabel(label: Label, maxWidth: number, font: FontSpec, measure: TextMeasurer): Label {
  const out: TextLine[] = []
  for (const line of label.lines) {
    if (lineWidth(line, font, measure) <= maxWidth) {
      out.push(line)
      continue
    }
    // Split runs into words that keep their style, then refill lines greedily.
    const words: TextRun[][] = [[]]
    for (const run of line) {
      const parts = run.text.split(/( +)/)
      for (const part of parts) {
        if (/^ +$/.test(part)) {
          words.push([])
        } else if (part.length > 0) {
          words[words.length - 1]!.push({ ...run, text: part })
        }
      }
    }
    let current: TextLine = []
    let currentWidth = 0
    const space = measure(' ', font).width
    for (const word of words) {
      if (word.length === 0) continue
      const width = lineWidth(word, font, measure)
      if (current.length > 0 && currentWidth + space + width > maxWidth) {
        out.push(current)
        current = []
        currentWidth = 0
      }
      if (current.length > 0) {
        current.push({ ...word[0]!, text: ' ' })
        currentWidth += space
      }
      current.push(...word)
      currentWidth += width
    }
    out.push(current)
  }
  return { lines: out }
}

export interface MeasuredLabel {
  label: Label
  width: number
  height: number
  lineHeight: number
}

export function measureLabel(label: Label, font: FontSpec, measure: TextMeasurer): MeasuredLabel {
  const lineHeight = font.size * LINE_HEIGHT
  let width = 0
  for (const line of label.lines) width = Math.max(width, lineWidth(line, font, measure))
  return { label, width, height: lineHeight * label.lines.length, lineHeight }
}

export type TextAnchor = 'start' | 'middle' | 'end'

/**
 * A label as an SVG `<text>`, its block centred vertically on `y`.
 *
 * Lines are `<tspan>`s positioned absolutely rather than with `dy`, so a
 * browser that drops one line's metrics does not shift the rest.
 */
export function renderLabel(
  measured: MeasuredLabel,
  x: number,
  y: number,
  options: { anchor?: TextAnchor; className?: string; style?: string } = {},
): SvgElement {
  const { label, lineHeight } = measured
  const top = y - (lineHeight * label.lines.length) / 2
  const lines = label.lines.map((line, index) => {
    const baseline = top + lineHeight * index + lineHeight / 2
    const runs = line.map((run) =>
      run.bold || run.italic
        ? el(
            'tspan',
            {
              'font-weight': run.bold ? 'bold' : undefined,
              'font-style': run.italic ? 'italic' : undefined,
            },
            [txt(run.text)],
          )
        : txt(run.text),
    )
    // `dominant-baseline` again on each line: SVG 1.1 does not inherit it, and
    // WebKit follows 1.1 — without this every line sits a third of an em high.
    return el('tspan', { x, y: baseline, 'dominant-baseline': 'central' }, runs.length > 0 ? runs : [txt('')])
  })
  return el(
    'text',
    {
      class: options.className ?? 'dg-label',
      'text-anchor': options.anchor ?? 'middle',
      'dominant-baseline': 'central',
      style: options.style,
    },
    lines,
  )
}
