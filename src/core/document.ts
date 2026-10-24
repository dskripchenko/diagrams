/**
 * The common frame of every diagram: the root `<svg>`, its stylesheet,
 * marker definitions and accessible title.
 */
import { stylesheet } from './theme'
import { el, serialize, txt, type SvgElement } from './svg'
import type { TextMeasurer } from './text'

export interface RenderOptions {
  /** How text is measured; defaults to a canvas in the browser and a glyph table elsewhere. */
  measureText?: TextMeasurer
  /**
   * Prefix for every id inside the SVG. Must be unique on the page when the
   * same diagram is shown twice; defaults to a hash of the source.
   */
  idPrefix?: string
  /** Accessible title; defaults to the diagram's own title or its type. */
  title?: string
}

export interface RenderResult {
  svg: string
  width: number
  height: number
  type: string
}

/** FNV-1a: a short, stable id from the source. */
export function hashId(source: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `dg-${(h >>> 0).toString(36)}`
}

export function sanitizeId(prefix: string): string {
  const cleaned = prefix.replace(/[^a-zA-Z0-9_-]/g, '-')
  return /^[a-zA-Z]/.test(cleaned) ? cleaned : `dg-${cleaned}`
}

export const MARGIN = 8

export function documentSvg(input: {
  id: string
  type: string
  width: number
  height: number
  title: string
  description?: string
  defs?: SvgElement[]
  body: SvgElement[]
  css?: string
}): RenderResult {
  const width = Math.ceil(input.width + MARGIN * 2)
  const height = Math.ceil(input.height + MARGIN * 2)
  const titleId = `${input.id}-title`
  const root = el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      id: input.id,
      class: `dg dg-${input.type}`,
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-labelledby': titleId,
      style: 'max-width:100%;height:auto',
    },
    [
      el('title', { id: titleId }, [txt(input.title)]),
      input.description ? el('desc', {}, [txt(input.description)]) : null,
      el('style', {}, [txt(stylesheet(input.id, input.css))]),
      input.defs && input.defs.length > 0 ? el('defs', {}, input.defs) : null,
      el('g', { transform: `translate(${MARGIN},${MARGIN})` }, input.body),
    ],
  )
  return { svg: serialize(root), width, height, type: input.type }
}
