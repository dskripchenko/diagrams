/**
 * Git graphs: commits on branches, merges and cherry-picks.
 *
 *     gitGraph
 *       commit
 *       branch develop
 *       checkout develop
 *       commit id: "feature" tag: "v0.1"
 *       checkout main
 *       commit type: HIGHLIGHT
 *       merge develop tag: "v1.0"
 *       cherry-pick id: "feature"
 *
 * Commits run left to right (`gitGraph TB:` — top to bottom, `BT:` — bottom
 * to top) in the order written, one lane per branch. Commit options: `id`,
 * `msg`, `tag`, `type` (NORMAL, REVERSE, HIGHLIGHT); `branch name order: n`;
 * `checkout` or `switch`; `merge branch` with the same options;
 * `cherry-pick id: "…"`.
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { DiagramError, tooLarge } from '../../core/errors'
import { statements, type Statement } from '../../core/scanner'
import { el, PathBuilder, type SvgElement } from '../../core/svg'
import { measureLabel, parseLabel, renderLabel, type TextMeasurer } from '../../core/text'
import { BASE_FONT, paletteVar, v } from '../../core/theme'
import { accessibilityStatement, type Accessibility } from '../common'

export type CommitType = 'normal' | 'reverse' | 'highlight' | 'merge' | 'cherry-pick'

export interface GitCommit {
  id: string
  /** Whether the id was written, so it is shown. */
  named: boolean
  branch: string
  parents: string[]
  type: CommitType
  tags: string[]
  message?: string
}

export interface GitBranch {
  name: string
  order: number
  /** The commit it started from; none for the first branch. */
  from?: string
}

export interface GitGraph {
  type: 'gitgraph'
  direction: 'LR' | 'TB' | 'BT'
  branches: GitBranch[]
  commits: GitCommit[]
  accessibility: Accessibility
}

const MAX_COMMITS = 500

/** `id: "x" tag: "v1" type: HIGHLIGHT msg: "…" order: 2`, values quoted or bare. */
function options(text: string, s: Statement): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /(\w+)\s*:\s*("([^"]*)"|\S+)/g
  let rest = text
  for (const m of text.matchAll(re)) {
    out[m[1]!.toLowerCase()] = m[3] ?? m[2]!
    rest = rest.replace(m[0], '')
  }
  if (rest.trim() !== '') throw new DiagramError(`"${rest.trim()}" is not an option`, s.line, s.column, 'id: "…", tag: "…", type: NORMAL|REVERSE|HIGHLIGHT, msg: "…"')
  return out
}

export function parseGitGraph(source: string): GitGraph {
  const list = statements(source)
  const head = list[0]
  const hm = head ? /^gitGraph(?:\s+(LR|TB|BT)\s*:)?\s*:?$/.exec(head.text) : null
  if (!head || !hm) throw new DiagramError('A git graph starts with "gitGraph"', head?.line ?? 1, 1)
  const g: GitGraph = { type: 'gitgraph', direction: (hm[1] as GitGraph['direction']) ?? 'LR', branches: [{ name: 'main', order: 0 }], commits: [], accessibility: {} }
  const heads = new Map<string, string | undefined>([['main', undefined]])
  const ids = new Set<string>()
  let current = 'main'
  let auto = 0
  const newId = (wanted: string | undefined, s: Statement): { id: string; named: boolean } => {
    if (wanted !== undefined) {
      if (ids.has(wanted)) throw new DiagramError(`The commit id "${wanted}" is used twice`, s.line, s.column)
      ids.add(wanted)
      return { id: wanted, named: true }
    }
    let id: string
    do id = `${auto++}`
    while (ids.has(id))
    ids.add(id)
    return { id, named: false }
  }
  const type = (t: string | undefined, s: Statement): CommitType => {
    if (!t) return 'normal'
    const k = t.toLowerCase()
    if (k === 'normal' || k === 'reverse' || k === 'highlight') return k
    throw new DiagramError(`"${t}" is not a commit type`, s.line, s.column, 'NORMAL, REVERSE, HIGHLIGHT')
  }
  const add = (c: GitCommit) => {
    g.commits.push(c)
    heads.set(c.branch, c.id)
    if (g.commits.length > MAX_COMMITS) throw tooLarge('commits', g.commits.length, MAX_COMMITS)
  }

  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const consumed = accessibilityStatement(list, i, g.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    let m: RegExpExecArray | null
    if ((m = /^commit\b\s*(.*)$/.exec(s.text))) {
      const o = options(m[1]!, s)
      const { id, named } = newId(o.id, s)
      const parent = heads.get(current)
      add({ id, named, branch: current, parents: parent ? [parent] : [], type: type(o.type, s), tags: o.tag ? [o.tag] : [], message: o.msg })
    } else if ((m = /^branch\s+("[^"]+"|\S+)\s*(.*)$/.exec(s.text))) {
      const name = m[1]!.replace(/^"|"$/g, '')
      if (heads.has(name)) throw new DiagramError(`The branch "${name}" exists already`, s.line, s.column)
      const o = options(m[2]!, s)
      g.branches.push({ name, order: o.order !== undefined ? Number(o.order) : g.branches.length, from: heads.get(current) })
      heads.set(name, heads.get(current))
      current = name
    } else if ((m = /^(?:checkout|switch)\s+("[^"]+"|\S+)$/.exec(s.text))) {
      const name = m[1]!.replace(/^"|"$/g, '')
      if (!heads.has(name)) throw new DiagramError(`"${name}" is not a branch`, s.line, s.column, `branch ${name}`)
      current = name
    } else if ((m = /^merge\s+("[^"]+"|\S+)\s*(.*)$/.exec(s.text))) {
      const name = m[1]!.replace(/^"|"$/g, '')
      if (!heads.has(name)) throw new DiagramError(`"${name}" is not a branch`, s.line, s.column)
      if (name === current) throw new DiagramError('A branch cannot merge into itself', s.line, s.column)
      const other = heads.get(name)
      const mine = heads.get(current)
      if (!other) throw new DiagramError(`"${name}" has no commits to merge`, s.line, s.column)
      if (other === mine) throw new DiagramError(`"${current}" has nothing new from "${name}"`, s.line, s.column)
      const o = options(m[2]!, s)
      const { id, named } = newId(o.id, s)
      add({ id, named, branch: current, parents: mine ? [mine, other] : [other], type: o.type ? type(o.type, s) : 'merge', tags: o.tag ? [o.tag] : [], message: o.msg })
    } else if ((m = /^cherry-pick\s+(.*)$/.exec(s.text))) {
      const o = options(m[1]!, s)
      const picked = g.commits.find((c) => c.id === o.id)
      if (!picked) throw new DiagramError(`"${o.id ?? ''}" is not a commit`, s.line, s.column, 'cherry-pick id: "…"')
      if (picked.branch === current) throw new DiagramError('A commit cannot be cherry-picked onto its own branch', s.line, s.column)
      const { id, named } = newId(undefined, s)
      const parent = heads.get(current)
      add({ id, named, branch: current, parents: parent ? [parent] : [], type: 'cherry-pick', tags: o.tag ? [o.tag] : [`cherry-pick: ${picked.id}`], message: o.msg })
    } else {
      throw new DiagramError(`"${s.text}" is not a git graph statement`, s.line, s.column, 'commit, branch, checkout, merge, cherry-pick')
    }
  }
  if (g.commits.length === 0) throw new DiagramError('The graph has no commits', 0, 0, 'commit')
  return g
}

const STEP = 54
const LANE = 52
const RADIUS = 9

export function renderGitGraph(g: GitGraph, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const branches = [...g.branches].sort((a, b) => a.order - b.order)
  const lane = new Map(branches.map((b, k) => [b.name, k]))
  const color = (name: string) => paletteVar(g.branches.findIndex((b) => b.name === name))
  const nameLabels = new Map(branches.map((b) => [b.name, measureLabel(parseLabel(b.name), { ...BASE_FONT, size: 13, weight: 'bold' }, measure)]))
  const gutter = Math.max(...[...nameLabels.values()].map((l) => l.width)) + 24
  const vertical = g.direction !== 'LR'
  const index = new Map(g.commits.map((c, k) => [c.id, k]))
  // Main axis (commit order) and cross axis (lane) to x, y.
  const along = (k: number) => (g.direction === 'BT' ? (g.commits.length - 1 - k) * STEP : k * STEP) + (vertical ? 40 : gutter + 24)
  // Tags stand above their commits (left of them, top to bottom): room for them.
  const tagRoom = g.commits.some((c) => c.tags.length > 0) ? 28 : 0
  const across = (name: string) => lane.get(name)! * LANE + (vertical ? gutter / 2 + tagRoom * 3 : 24 + tagRoom)
  const at = (c: GitCommit): [number, number] => (vertical ? [across(c.branch), along(index.get(c.id)!)] : [along(index.get(c.id)!), across(c.branch)])

  const lines: SvgElement[] = []
  const marks: SvgElement[] = []
  const texts: SvgElement[] = []
  // Branch lanes: from the first commit on them (or the one they started from) to their last.
  for (const b of branches) {
    const own = g.commits.filter((c) => c.branch === b.name)
    if (own.length === 0) continue
    const first = b.from ? index.get(b.from)! : index.get(own[0]!.id)!
    const lastK = Math.max(...g.commits.filter((c) => c.branch === b.name || c.parents.some((p) => g.commits[index.get(p)!]!.branch === b.name)).map((c) => index.get(c.id)!))
    const a = vertical ? [across(b.name), along(first)] : [along(first), across(b.name)]
    const z = vertical ? [across(b.name), along(lastK)] : [along(lastK), across(b.name)]
    lines.push(el('line', { class: 'dg-git-lane', x1: a[0], y1: a[1], x2: z[0], y2: z[1], style: `stroke:${color(b.name)}` }))
    const l = nameLabels.get(b.name)!
    const [lx, ly] = vertical ? [across(b.name), 18] : [8, across(b.name)]
    texts.push(el('rect', { class: 'dg-git-branch-box', x: vertical ? lx - l.width / 2 - 6 : lx - 4, y: ly - l.height / 2 - 3, width: l.width + 12, height: l.height + 6, rx: 4, style: `fill:${color(b.name)}` }))
    texts.push(renderLabel(l, vertical ? lx : lx + l.width / 2 + 2, ly, { className: 'dg-git-branch' }))
  }
  // Edges: a commit's link to each parent on another lane (branch-off, merge).
  for (const c of g.commits) {
    const [x2, y2] = at(c)
    for (const p of c.parents) {
      const parent = g.commits[index.get(p)!]!
      if (parent.branch === c.branch) continue
      const [x1, y1] = at(parent)
      const path = vertical
        ? new PathBuilder().moveTo(x1, y1).curveTo(x1, (y1 + y2) / 2, x2, (y1 + y2) / 2, x2, y2)
        : new PathBuilder().moveTo(x1, y1).curveTo((x1 + x2) / 2, y1, (x1 + x2) / 2, y2, x2, y2)
      lines.push(el('path', { class: 'dg-git-edge', d: path.toString(), style: `stroke:${color(c.type === 'merge' ? parent.branch : c.branch)}` }))
    }
  }
  // Branch-offs: the first commit of a branch links back to where it started.
  for (const b of branches) {
    if (!b.from) continue
    const first = g.commits.find((c) => c.branch === b.name)
    if (!first || first.parents[0] !== b.from) continue
    const origin = g.commits[index.get(b.from)!]!
    if (origin.branch === b.name) continue
    const [x1, y1] = at(origin)
    const [x2, y2] = at(first)
    const path = vertical
      ? new PathBuilder().moveTo(x1, y1).curveTo(x1, (y1 + y2) / 2, x2, (y1 + y2) / 2, x2, y2)
      : new PathBuilder().moveTo(x1, y1).curveTo((x1 + x2) / 2, y1, (x1 + x2) / 2, y2, x2, y2)
    lines.push(el('path', { class: 'dg-git-edge', d: path.toString(), style: `stroke:${color(b.name)}` }))
  }
  for (const c of g.commits) {
    const [x, y] = at(c)
    const fill = `fill:${color(c.branch)}`
    if (c.type === 'highlight') marks.push(el('rect', { class: 'dg-git-commit', x: x - RADIUS, y: y - RADIUS, width: RADIUS * 2, height: RADIUS * 2, style: fill }))
    else if (c.type === 'merge') {
      marks.push(el('circle', { class: 'dg-git-commit', cx: x, cy: y, r: RADIUS, style: fill }))
      marks.push(el('circle', { class: 'dg-git-merge', cx: x, cy: y, r: RADIUS - 4 }))
    } else if (c.type === 'cherry-pick') {
      marks.push(el('circle', { class: 'dg-git-commit dg-git-cherry', cx: x, cy: y, r: RADIUS }))
    } else {
      marks.push(el('circle', { class: 'dg-git-commit', cx: x, cy: y, r: RADIUS, style: fill }))
      if (c.type === 'reverse') marks.push(el('path', { class: 'dg-git-reverse', d: new PathBuilder().moveTo(x - 4, y - 4).lineTo(x + 4, y + 4).moveTo(x - 4, y + 4).lineTo(x + 4, y - 4).toString() }))
    }
    const caption = c.named ? c.id : c.message
    if (caption) {
      const l = measureLabel(parseLabel(caption), { ...BASE_FONT, size: 12 }, measure)
      texts.push(renderLabel(l, vertical ? x + RADIUS + 6 + l.width / 2 : x, vertical ? y : y + RADIUS + 6 + l.height / 2, { className: 'dg-git-id' }))
    }
    c.tags.forEach((tag, k) => {
      const l = measureLabel(parseLabel(tag), { ...BASE_FONT, size: 12 }, measure)
      const tx = vertical ? x - RADIUS - 10 - l.width / 2 : x
      const ty = vertical ? y + k * (l.height + 8) : y - RADIUS - 8 - l.height / 2 - k * (l.height + 8)
      texts.push(el('rect', { class: 'dg-git-tag', x: tx - l.width / 2 - 5, y: ty - l.height / 2 - 2, width: l.width + 10, height: l.height + 4, rx: 3 }))
      texts.push(renderLabel(l, tx, ty, { className: 'dg-git-tag-text' }))
    })
  }
  const lanes = branches.length * LANE
  const length = g.commits.length * STEP
  const width = vertical ? Math.max(lanes + gutter, gutter + 120) + tagRoom * 3 : gutter + 24 + length
  const height = vertical ? length + 60 : lanes + 30 + tagRoom
  const r = `#${id}`
  const css = [
    `${r} .dg-git-lane{stroke-width:3px;stroke-opacity:0.55}`,
    `${r} .dg-git-edge{fill:none;stroke-width:3px;stroke-opacity:0.55}`,
    `${r} .dg-git-commit{stroke:${v('--dg-row-fill')};stroke-width:2px}`,
    `${r} .dg-git-cherry{fill:${v('--dg-row-fill')};stroke:${v('--dg-line')};stroke-dasharray:2 2}`,
    `${r} .dg-git-merge{fill:${v('--dg-row-fill')}}`,
    `${r} .dg-git-reverse{stroke:${v('--dg-row-fill')};stroke-width:2px}`,
    `${r} .dg-git-branch-box{fill-opacity:0.18}`,
    `${r} .dg-git-branch{fill:${v('--dg-text')};font-size:13px;font-weight:bold}`,
    `${r} .dg-git-id{fill:${v('--dg-text-muted')};font-size:12px}`,
    `${r} .dg-git-tag{fill:${v('--dg-note-fill')};stroke:${v('--dg-note-stroke')};stroke-width:1px}`,
    `${r} .dg-git-tag-text{fill:${v('--dg-note-text')};font-size:12px}`,
  ].join('')
  return documentSvg({
    id,
    type: 'gitgraph',
    width,
    height,
    title: title ?? g.accessibility.title ?? 'Git graph',
    description: g.accessibility.description,
    body: [el('g', { class: 'dg-git-lines' }, lines), el('g', { class: 'dg-git-commits' }, marks), el('g', { class: 'dg-git-texts' }, texts)],
    css,
  })
}
