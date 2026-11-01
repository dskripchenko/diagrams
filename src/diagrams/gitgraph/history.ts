/**
 * A commit graph beside a list of commits, the way history views draw one:
 * a column with a lane per line of development, one row per commit, lines
 * to the parents (merges and branch-offs curve between lanes).
 *
 *     const { svg, graph } = renderCommitGraph(commits, { rowHeight: 28 })
 *
 * `commits` are newest first (as `git log` gives them), each with its parents'
 * ids. The rows line up with the host's own list: row k is centred at
 * `k * rowHeight + rowHeight / 2`. A parent missing from the list (a history
 * cut short) leaves its line running to the bottom.
 */
import { el, PathBuilder, serialize, txt, type SvgElement } from '../../core/svg'
import { paletteVar, stylesheet, v } from '../../core/theme'
import { sanitizeId } from '../../core/document'

export interface HistoryCommit {
  id: string
  parents: readonly string[]
}

/** One line piece within a row: from a lane at the top (or the commit) to a lane at the bottom (or the commit). */
export interface CommitGraphSegment {
  row: number
  kind: 'through' | 'in' | 'out'
  /** `through`: the lane; `in`: the lane it comes from at the top; `out`: the commit's lane. */
  from: number
  /** `through`: the lane; `in`: the commit's lane; `out`: the lane it goes to at the bottom. */
  to: number
  /** The palette index of the line. */
  color: number
}

export interface CommitGraphRow {
  id: string
  lane: number
  color: number
  /** More than one parent. */
  merge: boolean
}

export interface CommitGraph {
  rows: CommitGraphRow[]
  segments: CommitGraphSegment[]
  /** The widest the graph gets, in lanes. */
  lanes: number
}

/**
 * Lanes for a list of commits, newest first. A lane holds the commit it waits
 * for (a parent of a row above); a commit takes the first lane waiting for
 * it, or a free one. Its first parent continues its lane — or joins a lane to
 * its left already waiting for that parent — and every other parent goes to
 * the lane waiting for it, or a new one. Lanes freed are reused; they never
 * shift.
 */
export function layoutCommitGraph(commits: readonly HistoryCommit[]): CommitGraph {
  const waiting: (string | null)[] = []
  const colors: number[] = []
  let nextColor = 0
  const rows: CommitGraphRow[] = []
  const segments: CommitGraphSegment[] = []
  let width = 0
  const seen = new Set<string>()
  const free = () => {
    const i = waiting.indexOf(null)
    return i < 0 ? waiting.length : i
  }
  const take = (lane: number, id: string) => {
    waiting[lane] = id
    colors[lane] = nextColor++
  }

  for (const c of commits) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    const r = rows.length
    const awaiting = waiting.flatMap((id, i) => (id === c.id ? [i] : []))
    const lane = awaiting[0] ?? free()
    if (awaiting.length === 0) take(lane, c.id)
    const color = colors[lane]!
    // Lines into the commit: its own lane from above, and others that waited for it too.
    for (const i of awaiting) {
      segments.push({ row: r, kind: 'in', from: i, to: lane, color: colors[i]! })
      if (i !== lane) waiting[i] = null
    }
    // Lanes going past.
    waiting.forEach((id, i) => {
      if (id !== null && i !== lane && !awaiting.includes(i)) segments.push({ row: r, kind: 'through', from: i, to: i, color: colors[i]! })
    })
    // Lines to the parents.
    const parents = [...new Set(c.parents)]
    waiting[lane] = null
    parents.forEach((p, k) => {
      const existing = waiting.indexOf(p)
      // The first parent keeps the lane unless a lane to the left waits for it: a branch runs
      // beside its base until the commit they share, where it bends back in.
      if (existing >= 0 && (k > 0 || existing < lane)) {
        segments.push({ row: r, kind: 'out', from: lane, to: existing, color: k === 0 ? color : colors[existing]! })
        return
      }
      if (k === 0) {
        waiting[lane] = p
        segments.push({ row: r, kind: 'out', from: lane, to: lane, color })
        return
      }
      const target = free()
      take(target, p)
      segments.push({ row: r, kind: 'out', from: lane, to: target, color: colors[target]! })
    })
    rows.push({ id: c.id, lane, color, merge: parents.length > 1 })
    width = Math.max(width, waiting.length, lane + 1)
    while (waiting.length > 0 && waiting[waiting.length - 1] === null) waiting.pop()
  }
  return { rows, segments, lanes: width }
}

export interface CommitGraphOptions {
  /** The height of a row of the host's list, in pixels. Default 28. */
  rowHeight?: number
  /** The distance between lanes. Default 14. */
  laneWidth?: number
  /** The radius of a commit's dot. Default 4. */
  radius?: number
  /** A commit to mark (the checked-out one): a ring around its dot. */
  head?: string
  /** The `id` of the `<svg>`, scoping its styles. */
  id?: string
  /** For assistive technology. Default "Commit graph". */
  title?: string
}

export interface CommitGraphResult {
  svg: string
  width: number
  height: number
  graph: CommitGraph
  /** The x of a lane's centre, for a host placing things beside the graph. */
  laneX: (lane: number) => number
}

/** The graph as an SVG column, rows `rowHeight` apart, as wide as its lanes. */
export function renderCommitGraph(commits: readonly HistoryCommit[], options: CommitGraphOptions = {}): CommitGraphResult {
  const graph = layoutCommitGraph(commits)
  const rowHeight = options.rowHeight ?? 28
  const laneWidth = options.laneWidth ?? 14
  const radius = options.radius ?? 4
  const pad = Math.max(radius + 3, laneWidth / 2)
  const laneX = (lane: number) => pad + lane * laneWidth
  const centre = (row: number) => row * rowHeight + rowHeight / 2
  const width = Math.ceil(pad * 2 + Math.max(graph.lanes - 1, 0) * laneWidth)
  const height = graph.rows.length * rowHeight
  const id = sanitizeId(options.id ?? 'dg-commits')

  const lines: SvgElement[] = []
  for (const s of graph.segments) {
    const top = s.row * rowHeight
    const mid = centre(s.row)
    const bottom = top + rowHeight
    const path = new PathBuilder()
    if (s.kind === 'through') path.moveTo(laneX(s.from), top).lineTo(laneX(s.from), bottom)
    else if (s.kind === 'in') {
      const [x1, x2] = [laneX(s.from), laneX(s.to)]
      // A merge into the commit bends near the top, then runs straight in.
      if (x1 === x2) path.moveTo(x1, top).lineTo(x2, mid)
      else path.moveTo(x1, top).curveTo(x1, top + rowHeight * 0.35, x2, mid - rowHeight * 0.2, x2, mid)
    } else {
      const [x1, x2] = [laneX(s.from), laneX(s.to)]
      if (x1 === x2) path.moveTo(x1, mid).lineTo(x2, bottom)
      else path.moveTo(x1, mid).curveTo(x1, mid + rowHeight * 0.2, x2, bottom - rowHeight * 0.35, x2, bottom)
    }
    lines.push(el('path', { class: 'dg-commit-line', d: path.toString(), style: `stroke:${paletteVar(s.color)}` }))
  }
  const dots: SvgElement[] = []
  graph.rows.forEach((row, k) => {
    const x = laneX(row.lane)
    const y = centre(k)
    const colour = paletteVar(row.color)
    if (row.id === options.head) dots.push(el('circle', { class: 'dg-commit-head', cx: x, cy: y, r: radius + 3, style: `stroke:${colour}` }))
    dots.push(
      el('circle', {
        class: row.merge ? 'dg-commit-dot dg-commit-merge' : 'dg-commit-dot',
        cx: x,
        cy: y,
        r: radius,
        'data-id': row.id,
        style: row.merge ? `stroke:${colour}` : `fill:${colour}`,
      }),
    )
  })
  const r = `#${id}`
  const css = [
    `${r} .dg-commit-line{fill:none;stroke-width:2px;stroke-linecap:round}`,
    `${r} .dg-commit-dot{stroke:${v('--dg-row-fill')};stroke-width:1.5px}`,
    `${r} .dg-commit-merge{fill:${v('--dg-row-fill')};stroke-width:2px}`,
    `${r} .dg-commit-head{fill:none;stroke-width:1.5px}`,
  ].join('')
  const titleId = `${id}-title`
  const root = el(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', id, class: 'dg dg-commit-graph', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': titleId },
    [el('title', { id: titleId }, [txt(options.title ?? 'Commit graph')]), el('style', {}, [txt(stylesheet(id, css))]), el('g', { class: 'dg-commit-lines' }, lines), el('g', { class: 'dg-commit-dots' }, dots)],
  )
  return { svg: serialize(root), width, height, graph, laneX }
}
