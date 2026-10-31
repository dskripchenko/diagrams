/**
 * Colours and type as CSS custom properties.
 *
 * Every visible colour in every diagram is a `var(--dg-…, default)`, so a host
 * restyles all diagrams on a page with a few declarations — and a dark theme
 * is the same declarations with other values. Nothing here is inline per
 * element except what the diagram's own source asked for (`style`, `classDef`).
 */
import type { FontSpec } from './text'

export const FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export const BASE_FONT: FontSpec = { size: 14, family: FONT_FAMILY }

/** Variable name → light-theme default. The documented theming surface. */
export const VARIABLES: Readonly<Record<string, string>> = {
  '--dg-font-family': FONT_FAMILY,
  '--dg-text': '#1f2937',
  '--dg-text-muted': '#6b7280',
  '--dg-background': 'transparent',
  '--dg-line': '#64748b',
  '--dg-node-fill': '#eef2ff',
  '--dg-node-stroke': '#6366f1',
  '--dg-node-text': '#1e1b4b',
  '--dg-row-fill': '#ffffff',
  '--dg-row-alt-fill': '#f5f7ff',
  '--dg-cluster-fill': '#f8fafc',
  '--dg-cluster-stroke': '#cbd5e1',
  '--dg-cluster-text': '#334155',
  '--dg-edge-label-fill': '#ffffff',
  '--dg-note-fill': '#fef9c3',
  '--dg-note-stroke': '#ca8a04',
  '--dg-note-text': '#422006',
  '--dg-actor-fill': '#eef2ff',
  '--dg-actor-stroke': '#6366f1',
  '--dg-activation-fill': '#e0e7ff',
  '--dg-block-stroke': '#94a3b8',
  '--dg-block-label-fill': '#e2e8f0',
  '--dg-grid': '#e5e7eb',
  '--dg-task-fill': '#818cf8',
  '--dg-task-stroke': '#4f46e5',
  '--dg-task-done-fill': '#cbd5e1',
  '--dg-task-done-stroke': '#64748b',
  '--dg-task-active-fill': '#c7d2fe',
  '--dg-task-crit-fill': '#f87171',
  '--dg-task-crit-stroke': '#b91c1c',
  '--dg-task-text': '#ffffff',
  '--dg-task-text-dark': '#1f2937',
  '--dg-exclude-fill': 'rgba(148, 163, 184, 0.18)',
  '--dg-today': '#ef4444',
  '--dg-section-fill-0': 'rgba(99, 102, 241, 0.06)',
  '--dg-section-fill-1': 'rgba(100, 116, 139, 0.06)',
  '--dg-state-start': '#1f2937',
  '--dg-lifeline': '#94a3b8',
  '--dg-number-text': '#ffffff',
  '--dg-rect-fill': 'rgba(148, 163, 184, 0.12)',
  '--dg-pie-stroke': '#ffffff',
  '--dg-journey-face': '#fde68a',
  '--dg-journey-face-sad': '#fecaca',
  '--dg-journey-face-happy': '#bbf7d0',
  '--dg-quadrant-1': 'rgba(99, 102, 241, 0.12)',
  '--dg-quadrant-2': 'rgba(14, 165, 233, 0.10)',
  '--dg-quadrant-3': 'rgba(148, 163, 184, 0.12)',
  '--dg-quadrant-4': 'rgba(16, 185, 129, 0.10)',
  '--dg-pie-text': '#ffffff',
  // C4: the C4 model's own palette, legible in light and dark pages alike.
  '--dg-c4-person-fill': '#08427b',
  '--dg-c4-person-stroke': '#052e56',
  '--dg-c4-person-text': '#ffffff',
  '--dg-c4-system-fill': '#1168bd',
  '--dg-c4-system-stroke': '#0b4884',
  '--dg-c4-system-text': '#ffffff',
  '--dg-c4-container-fill': '#438dd5',
  '--dg-c4-container-stroke': '#2e6295',
  '--dg-c4-container-text': '#ffffff',
  '--dg-c4-component-fill': '#85bbf0',
  '--dg-c4-component-stroke': '#5d82a8',
  '--dg-c4-component-text': '#0b2540',
  '--dg-c4-external-fill': '#7b7b7b',
  '--dg-c4-external-stroke': '#5c5c5c',
  '--dg-c4-external-text': '#ffffff',
  '--dg-c4-boundary-stroke': '#6b7280',
  '--dg-c4-boundary-text': '#1f2937',
  '--dg-c4-node-fill': 'rgba(148, 163, 184, 0.08)',
  '--dg-c4-node-stroke': '#6b7280',
  '--dg-c4-node-text': '#1f2937',
}

/** Slice colours for pie charts, cycled. */
export const PALETTE = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#06b6d4',
  '#8b5cf6',
  '#84cc16',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#64748b',
  '#a855f7',
]

export function paletteVar(index: number): string {
  const i = index % PALETTE.length
  return `var(--dg-pie-${i + 1}, ${PALETTE[i]})`
}

export function v(name: keyof typeof VARIABLES | string): string {
  const fallback = VARIABLES[name]
  return fallback === undefined ? `var(${name})` : `var(${name}, ${fallback})`
}

/**
 * The stylesheet embedded in each SVG, scoped to its root id so two diagrams
 * on one page cannot restyle each other.
 */
export function stylesheet(rootId: string, extra = ''): string {
  const r = `#${rootId}`
  return [
    `${r}{font-family:${v('--dg-font-family')};font-size:${BASE_FONT.size}px;color:${v('--dg-text')}}`,
    `${r} text{fill:${v('--dg-text')}}`,
    `${r} .dg-label{fill:${v('--dg-node-text')}}`,
    `${r} .dg-node .dg-shape{fill:${v('--dg-node-fill')};stroke:${v('--dg-node-stroke')};stroke-width:1.5px}`,
    `${r} .dg-cluster-box{fill:${v('--dg-cluster-fill')};stroke:${v('--dg-cluster-stroke')};stroke-width:1px}`,
    `${r} .dg-cluster-label{fill:${v('--dg-cluster-text')};font-weight:600}`,
    `${r} .dg-cluster-title .dg-cluster-label{stroke:${v('--dg-cluster-fill')};stroke-width:4px;stroke-linejoin:round;paint-order:stroke}`,
    `${r} .dg-edge{fill:none;stroke:${v('--dg-line')};stroke-width:1.5px}`,
    `${r} .dg-edge-thick{stroke-width:3.5px}`,
    `${r} .dg-edge-dotted{stroke-dasharray:3 3}`,
    `${r} .dg-marker{fill:${v('--dg-line')};stroke:${v('--dg-line')}}`,
    `${r} .dg-edge-label-box{fill:${v('--dg-edge-label-fill')};opacity:0.9}`,
    `${r} .dg-edge-label{fill:${v('--dg-text')}}`,
    `${r} .dg-muted{fill:${v('--dg-text-muted')}}`,
    `${r} a{cursor:pointer}`,
    extra,
  ]
    .filter(Boolean)
    .join('')
}
