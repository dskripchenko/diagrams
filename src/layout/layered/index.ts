/**
 * Layered ("Sugiyama") layout with clusters.
 *
 *   1. Clusters get invisible top and bottom border nodes, tied to their
 *      members, so a cluster occupies a contiguous band of ranks with room
 *      for its title.
 *   2. Cycles are broken by reversing edges.
 *   3. Ranks by network simplex. Every real edge's minimum length is doubled
 *      so that the middle rank of each edge is free for its label.
 *   4. Long edges are split into chains of dummy nodes, one per rank.
 *   5. Ranks are ordered to reduce crossings, keeping clusters contiguous.
 *   6. Coordinates: priority method, then clusters pushed apart as blocks.
 *   7. Everything is computed top-to-bottom and turned at the end for
 *      BT, LR and RL.
 */
import { DiagramError, tooLarge } from '../../core/errors'
import type { Box, Point } from '../../core/geometry'
import { Graph, type WNode } from './graph'
import { order, type ClusterParents } from './order'
import { clusterFrames, position, type Spacing } from './position'
import { rank, removeCycles } from './rank'
import type { EdgeRoute, LayoutInput, LayoutResult } from './types'

export type * from './types'

export const MAX_NODES = 500
export const MAX_EDGES = 2000

const SELF_LOOP = 22

export function layout(input: LayoutInput): LayoutResult {
  const direction = input.direction ?? 'TB'
  const horizontal = direction === 'LR' || direction === 'RL'
  const spacing: Spacing = {
    nodeSep: input.nodeSep ?? 50,
    rankSep: input.rankSep ?? 50,
    edgeSep: input.edgeSep ?? 20,
    clusterPadding: input.clusterPadding ?? 12,
  }
  if (input.nodes.length > MAX_NODES) throw tooLarge('nodes', input.nodes.length, MAX_NODES)
  if (input.edges.length > MAX_EDGES) throw tooLarge('edges', input.edges.length, MAX_EDGES)

  // Sizes in the top-to-bottom frame: horizontal layouts swap width and height.
  const dims = (w: number, h: number) => (horizontal ? { width: h, height: w } : { width: w, height: h })

  const g = new Graph()
  const clusters = new Map((input.clusters ?? []).map((c) => [c.id, c]))
  const parents = new Map<string, string | null>()
  for (const c of clusters.values()) {
    if (c.parent !== undefined && !clusters.has(c.parent)) {
      throw new DiagramError(`Cluster "${c.id}" is inside an unknown cluster "${c.parent}"`)
    }
    parents.set(c.id, c.parent ?? null)
  }
  for (const c of clusters.keys()) {
    // A cluster that contains itself would make every walk up the tree endless.
    let p = parents.get(c) ?? null
    let steps = 0
    while (p !== null) {
      if (p === c || ++steps > clusters.size) throw new DiagramError(`Cluster "${c}" contains itself`)
      p = parents.get(p) ?? null
    }
  }

  // Self loops are drawn beside their node; the node reserves the room.
  const selfLoops = input.edges.filter((e) => e.from === e.to && !clusters.has(e.from))
  const loopRoom = new Map<string, number>()
  for (const e of selfLoops) {
    const labelRoom = e.label ? (horizontal ? e.label.height : e.label.width) + 6 : 0
    loopRoom.set(e.from, Math.max(loopRoom.get(e.from) ?? 0, SELF_LOOP + labelRoom))
  }

  for (const n of input.nodes) {
    if (g.nodes.has(n.id)) continue
    const d = dims(n.width, n.height)
    const room = loopRoom.get(n.id) ?? 0
    if (n.cluster !== undefined && !clusters.has(n.cluster)) {
      throw new DiagramError(`Node "${n.id}" is inside an unknown cluster "${n.cluster}"`)
    }
    g.addNode({ id: n.id, width: d.width + room * 2, height: d.height, cluster: n.cluster ?? null })
  }

  // 1. Cluster borders.
  const top = (c: string) => `\u0000top:${c}`
  const bottom = (c: string) => `\u0000bottom:${c}`
  const titleRoom = new Map<string, number>()
  for (const c of clusters.values()) {
    const label = c.label ?? { width: 0, height: 0 }
    const titleHeight = label.height > 0 ? label.height + 6 : 0
    titleRoom.set(c.id, titleHeight)
    // The title sits at the top of the final drawing: the top border for TB,
    // the bottom one for BT (it ends up on top), and the frame's left side
    // for LR/RL (handled when the frames are measured).
    const titled = direction === 'TB' ? 'top' : direction === 'BT' ? 'bottom' : null
    g.addNode({
      id: top(c.id),
      width: titled === 'top' ? label.width + 2 * spacing.clusterPadding : 0,
      height: titled === 'top' ? titleHeight : 0,
      cluster: c.id,
      dummy: 'border-top',
    })
    g.addNode({
      id: bottom(c.id),
      width: titled === 'bottom' ? label.width + 2 * spacing.clusterPadding : 0,
      height: titled === 'bottom' ? titleHeight : 0,
      cluster: c.id,
      dummy: 'border-bottom',
    })
  }
  let structuralId = 0
  const structural = (v: string, w: string) =>
    g.addEdge({ id: `\u0000s${structuralId++}`, v, w, minlen: 1, weight: 1, original: '', reversed: false, structural: true })
  for (const c of clusters.keys()) {
    const directNodes = [...g.nodes.values()].filter((n) => n.cluster === c && !n.dummy)
    const directClusters = [...clusters.values()].filter((k) => (k.parent ?? null) === c)
    for (const n of directNodes) {
      structural(top(c), n.id)
      structural(n.id, bottom(c))
    }
    for (const k of directClusters) {
      structural(top(c), top(k.id))
      structural(bottom(k.id), bottom(c))
    }
    if (directNodes.length === 0 && directClusters.length === 0) structural(top(c), bottom(c))
  }

  // Real edges. An end that is a cluster attaches to its border.
  const endpoint = (id: string, asSource: boolean): string => {
    if (clusters.has(id)) return asSource ? bottom(id) : top(id)
    if (!g.nodes.has(id)) throw new DiagramError(`Edge refers to an unknown node "${id}"`)
    return id
  }
  const labels = new Map<string, { width: number; height: number }>()
  for (const e of input.edges) {
    if (e.from === e.to && !clusters.has(e.from)) continue
    const v = endpoint(e.from, true)
    const w = endpoint(e.to, false)
    if (v === w) continue
    if (e.label) labels.set(e.id, dims(e.label.width, e.label.height))
    g.addEdge({
      id: e.id,
      v,
      w,
      minlen: Math.max(1, e.minlen ?? 1) * 2,
      weight: e.weight ?? 1,
      original: e.id,
      reversed: false,
    })
  }

  // 2–3. Cycles and ranks.
  removeCycles(g)
  rank(g)
  pullBordersTight(g, clusters.keys(), top, bottom)

  // Structural edges have done their job for ranking. The short ones stay to
  // guide ordering; long ones would only confuse it.
  for (const e of g.edges.slice()) {
    if (e.structural && g.node(e.w).rank - g.node(e.v).rank !== 1) g.removeEdge(e)
  }

  // 4. Dummy chains, with the label on the middle rank.
  const chains = new Map<string, string[]>()
  let dummyId = 0
  const clusterOfEnd = (id: string): string | null => {
    const n = g.node(id)
    // A border stands for the cluster from the outside: the edge belongs to the parent.
    if (n.dummy === 'border-top' || n.dummy === 'border-bottom') return parents.get(n.cluster!) ?? null
    return n.cluster
  }
  for (const e of g.edges.slice()) {
    if (e.structural) continue
    const v = g.node(e.v)
    const w = g.node(e.w)
    const owner = commonCluster(clusterOfEnd(v.id), clusterOfEnd(w.id), parents)
    const chain = [v.id]
    const span = w.rank - v.rank
    const label = labels.get(e.original)
    const labelRank = v.rank + Math.floor(span / 2)
    g.removeEdge(e)
    let prev = v.id
    for (let r = v.rank + 1; r < w.rank; r++) {
      const isLabel = !!label && r === labelRank
      const d = g.addNode({
        id: `\u0000d${dummyId++}`,
        width: isLabel ? label.width : 0,
        height: isLabel ? label.height : 0,
        cluster: owner,
        dummy: isLabel ? 'label' : 'edge',
        edge: e.original,
      })
      d.rank = r
      g.addEdge({ id: `${e.id}#${r}`, v: prev, w: d.id, minlen: 1, weight: e.weight, original: e.original, reversed: e.reversed })
      chain.push(d.id)
      prev = d.id
    }
    g.addEdge({ id: `${e.id}#end`, v: prev, w: w.id, minlen: 1, weight: e.weight, original: e.original, reversed: e.reversed })
    chain.push(w.id)
    chains.set(e.original, e.reversed ? chain.reverse() : chain)
  }

  // Clusters must be present in every rank they span, or something else
  // could be ordered into the middle of their frame.
  addSpines(g, clusters.keys(), parents, top, bottom)

  // 5–6. Order and coordinates.
  const layers = order(g, parents as ClusterParents)
  position(g, layers, parents as ClusterParents, spacing)

  // Frames.
  const frames = clusterFrames(g, parents as ClusterParents, spacing.clusterPadding)
  const clusterBoxes = new Map<string, Box>()
  const descendants = new Map<string, WNode[]>()
  for (const n of g.nodes.values()) {
    let c = n.cluster
    while (c !== null) {
      const list = descendants.get(c) ?? []
      list.push(n)
      descendants.set(c, list)
      c = parents.get(c) ?? null
    }
  }
  // Inner frames first, so a parent's bottom can include its children's padding.
  const depth = (c: string): number => {
    let d = 0
    let p = parents.get(c) ?? null
    while (p !== null) {
      d++
      p = parents.get(p) ?? null
    }
    return d
  }
  const byDepth = [...clusters.keys()].sort((a, b) => depth(b) - depth(a))
  const vertical = new Map<string, { top: number; bottom: number }>()
  for (const c of byDepth) {
    let t = Infinity
    let b = -Infinity
    for (const n of descendants.get(c) ?? []) {
      t = Math.min(t, n.y - n.height / 2)
      b = Math.max(b, n.y + n.height / 2)
    }
    for (const k of clusters.values()) {
      if ((k.parent ?? null) !== c) continue
      const inner = vertical.get(k.id)
      if (inner) {
        t = Math.min(t, inner.top)
        b = Math.max(b, inner.bottom)
      }
    }
    const pad = spacing.clusterPadding
    vertical.set(c, { top: t - (direction === 'TB' ? 0 : pad), bottom: b + (direction === 'BT' ? 0 : pad) })
  }
  for (const c of clusters.keys()) {
    const f = frames.get(c)!
    const v = vertical.get(c)!
    let left = f.left
    if (horizontal) left -= titleRoom.get(c) ?? 0
    clusterBoxes.set(c, { x: (left + f.right) / 2, y: (v.top + v.bottom) / 2, width: f.right - left, height: v.bottom - v.top })
  }

  // Overall size in the top-to-bottom frame.
  let maxX = 0
  let maxY = 0
  let minX = 0
  let minY = 0
  for (const n of g.nodes.values()) {
    maxX = Math.max(maxX, n.x + n.width / 2)
    maxY = Math.max(maxY, n.y + n.height / 2)
  }
  for (const b of clusterBoxes.values()) {
    minX = Math.min(minX, b.x - b.width / 2)
    minY = Math.min(minY, b.y - b.height / 2)
    maxX = Math.max(maxX, b.x + b.width / 2)
    maxY = Math.max(maxY, b.y + b.height / 2)
  }

  // 7. Back to the requested direction.
  const W = maxX - minX
  const H = maxY - minY
  const turn = (p: Point): Point => {
    const x = p.x - minX
    const y = p.y - minY
    switch (direction) {
      case 'BT':
        return { x, y: H - y }
      case 'LR':
        return { x: y, y: x }
      case 'RL':
        return { x: H - y, y: x }
      default:
        return { x, y }
    }
  }
  const turnBox = (b: Box): Box => {
    const c = turn(b)
    return horizontal ? { x: c.x, y: c.y, width: b.height, height: b.width } : { ...c, width: b.width, height: b.height }
  }

  const nodes = new Map<string, Box>()
  for (const n of input.nodes) {
    const w = g.node(n.id)
    const c = turn(w)
    nodes.set(n.id, { x: c.x, y: c.y, width: n.width, height: n.height })
  }
  const clustersOut = new Map<string, Box>()
  for (const [id, b] of clusterBoxes) clustersOut.set(id, turnBox(b))

  const edges = new Map<string, EdgeRoute>()
  for (const e of input.edges) {
    if (e.from === e.to && !clusters.has(e.from)) {
      edges.set(e.id, selfLoopRoute(nodes.get(e.from)!, direction, e.label))
      continue
    }
    const chain = chains.get(e.id)
    if (!chain) {
      edges.set(e.id, { points: [] })
      continue
    }
    const inner = chain.slice(1, -1).map((id) => g.node(id))
    const route: EdgeRoute = { points: inner.map((n) => turn(n)) }
    const labelNode = inner.find((n) => n.dummy === 'label')
    if (labelNode) route.label = turn(labelNode)
    edges.set(e.id, route)
  }

  const width = horizontal ? H : W
  const height = horizontal ? W : H
  return { width, height, nodes, clusters: clustersOut, edges }
}

/** The innermost cluster containing both, or null. */
function commonCluster(a: string | null, b: string | null, parents: ReadonlyMap<string, string | null>): string | null {
  const chainOf = (c: string | null) => {
    const out: (string | null)[] = []
    while (c !== null) {
      out.push(c)
      c = parents.get(c) ?? null
    }
    return out
  }
  const ca = new Set(chainOf(a))
  for (const c of chainOf(b)) if (ca.has(c)) return c
  return null
}

/**
 * Network simplex leaves a border node anywhere its zero-cost slack allows;
 * pull each top border down to just above the cluster and each bottom one
 * up to just below it, so frames are no taller than their content.
 */
function pullBordersTight(
  g: Graph,
  clusterIds: Iterable<string>,
  top: (c: string) => string,
  bottom: (c: string) => string,
): void {
  // Innermost first: a parent's border depends on its children's.
  const ids = [...clusterIds]
  for (let pass = 0; pass < ids.length + 1; pass++) {
    let changed = false
    for (const c of ids) {
      const t = g.node(top(c))
      const b = g.node(bottom(c))
      const below = g.out(t.id).map((e) => g.node(e.w).rank)
      const above = g.in(b.id).map((e) => g.node(e.v).rank)
      const incoming = g.in(t.id).map((e) => g.node(e.v).rank + e.minlen)
      const outgoing = g.out(b.id).map((e) => g.node(e.w).rank - e.minlen)
      if (below.length > 0) {
        const want = Math.min(...below) - 1
        const limit = incoming.length > 0 ? Math.max(...incoming) : -Infinity
        const r = Math.max(want, limit)
        if (r !== t.rank && r <= Math.min(...below) - 1) {
          t.rank = r
          changed = true
        }
      }
      if (above.length > 0) {
        const want = Math.max(...above) + 1
        const limit = outgoing.length > 0 ? Math.min(...outgoing) : Infinity
        const r = Math.min(want, limit)
        if (r !== b.rank && r >= Math.max(...above) + 1) {
          b.rank = r
          changed = true
        }
      }
    }
    if (!changed) break
  }
}

function addSpines(
  g: Graph,
  clusterIds: Iterable<string>,
  parents: ReadonlyMap<string, string | null>,
  top: (c: string) => string,
  bottom: (c: string) => string,
): void {
  const present = new Map<string, Set<number>>()
  for (const n of g.nodes.values()) {
    let c = n.cluster
    while (c !== null) {
      let set = present.get(c)
      if (!set) present.set(c, (set = new Set()))
      set.add(n.rank)
      c = parents.get(c) ?? null
    }
  }
  let id = 0
  for (const c of clusterIds) {
    const from = g.node(top(c)).rank
    const to = g.node(bottom(c)).rank
    const set = present.get(c) ?? new Set()
    for (let r = from + 1; r < to; r++) {
      if (set.has(r)) continue
      const s = g.addNode({ id: `\u0000spine${id++}`, width: 0, height: 0, cluster: c, dummy: 'spine' })
      s.rank = r
      // Mark the rank as present for every ancestor too.
      let p: string | null = c
      while (p !== null) {
        let ps = present.get(p)
        if (!ps) present.set(p, (ps = new Set()))
        ps.add(r)
        p = parents.get(p) ?? null
      }
    }
  }
}

/** A loop on the side of the node that faces away from the flow. */
function selfLoopRoute(box: Box, direction: string, label?: { width: number; height: number }): EdgeRoute {
  const horizontal = direction === 'LR' || direction === 'RL'
  const d = SELF_LOOP
  if (!horizontal) {
    const xr = box.x + box.width / 2
    const y0 = box.y - box.height / 4
    const y1 = box.y + box.height / 4
    return {
      selfLoop: true,
      points: [
        { x: xr, y: y0 },
        { x: xr + d, y: y0 - 4 },
        { x: xr + d, y: y1 + 4 },
        { x: xr, y: y1 },
      ],
      label: label ? { x: xr + d + 4 + label.width / 2, y: box.y } : undefined,
    }
  }
  const yb = box.y + box.height / 2
  const x0 = box.x - box.width / 4
  const x1 = box.x + box.width / 4
  return {
    selfLoop: true,
    points: [
      { x: x0, y: yb },
      { x: x0 - 4, y: yb + d },
      { x: x1 + 4, y: yb + d },
      { x: x1, y: yb },
    ],
    label: label ? { x: box.x, y: yb + d + 4 + label.height / 2 } : undefined,
  }
}
