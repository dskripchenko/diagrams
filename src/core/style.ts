/**
 * User styles: `style`, `classDef`, `linkStyle`.
 *
 * Mermaid passes these strings to the DOM as CSS. Here they are parsed and
 * only a fixed set of properties with validated values survives — a style
 * string must not be able to load a URL, reach outside the diagram or hide
 * the content behind something else.
 */
import { DiagramError } from './errors'

export interface UserStyle {
  /** For the shape or line. */
  shape: Record<string, string>
  /** For the text. */
  text: Record<string, string>
}

const COLOR =
  /^(#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|(rgb|rgba|hsl|hsla)\(\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*(,\s*[0-9.]+%?\s*)?\)|[a-zA-Z]{3,20})$/
const LENGTH = /^[0-9]+(\.[0-9]+)?(px|em)?$/
const DASH = /^[0-9.]+([\s,]+[0-9.]+)*$/
const OPACITY = /^(0(\.[0-9]+)?|1(\.0+)?)$/

const SHAPE_PROPS: Record<string, RegExp> = {
  fill: COLOR,
  stroke: COLOR,
  'stroke-width': LENGTH,
  'stroke-dasharray': DASH,
  opacity: OPACITY,
  'fill-opacity': OPACITY,
  'stroke-opacity': OPACITY,
}

const TEXT_PROPS: Record<string, RegExp> = {
  color: COLOR,
  'font-weight': /^(normal|bold|[1-9]00)$/,
  'font-style': /^(normal|italic)$/,
  'font-size': LENGTH,
}

/**
 * Parses `fill:#f9f,stroke:#333,stroke-width:4px`. Unknown properties are
 * an error rather than silently dropped: the author asked for something and
 * deserves to know it will not happen.
 */
export function parseStyle(source: string, line = 0, column = 0): UserStyle {
  const style: UserStyle = { shape: {}, text: {} }
  for (const part of splitDeclarations(source)) {
    const decl = part.trim()
    if (decl === '') continue
    const colon = decl.indexOf(':')
    if (colon < 0) {
      throw new DiagramError(`"${decl}" is not a style declaration`, line, column, 'Write property:value.')
    }
    const prop = decl.slice(0, colon).trim().toLowerCase()
    const value = decl.slice(colon + 1).trim().replace(/\s*!important$/, '')
    const shapeRule = SHAPE_PROPS[prop]
    const textRule = TEXT_PROPS[prop]
    if (!shapeRule && !textRule) {
      throw new DiagramError(
        `The style property "${prop}" is not supported`,
        line,
        column,
        `Supported: ${[...Object.keys(SHAPE_PROPS), ...Object.keys(TEXT_PROPS)].join(', ')}.`,
      )
    }
    const rule = (shapeRule ?? textRule)!
    if (!rule.test(value)) {
      throw new DiagramError(`"${value}" is not a valid value for ${prop}`, line, column)
    }
    if (shapeRule) style.shape[prop] = value
    else style.text[prop === 'color' ? 'fill' : prop] = value
  }
  return style
}

/** Splits on commas that are not inside parentheses (`rgb(1,2,3)`). */
function splitDeclarations(source: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if ((ch === ',' || ch === ';') && depth === 0) {
      out.push(source.slice(start, i))
      start = i + 1
    }
  }
  out.push(source.slice(start))
  return out
}

export function mergeStyles(...styles: (UserStyle | undefined)[]): UserStyle {
  const out: UserStyle = { shape: {}, text: {} }
  for (const s of styles) {
    if (!s) continue
    Object.assign(out.shape, s.shape)
    Object.assign(out.text, s.text)
  }
  return out
}

export function cssText(props: Record<string, string>): string | undefined {
  const entries = Object.entries(props)
  if (entries.length === 0) return undefined
  return entries.map(([k, value]) => `${k}:${value}`).join(';')
}

/** Link targets allowed in `click … href`: the same rule as the markdown renderer. */
export function safeHref(url: string): string | null {
  const u = url.trim()
  if (/^(https?:|mailto:)/i.test(u)) return u
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null
  if (u.startsWith('//')) return null
  return u
}
