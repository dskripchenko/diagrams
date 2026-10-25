/**
 * Ordering nodes within ranks to reduce crossings.
 *
 * The barycenter heuristic with alternating sweeps, keeping the best order
 * seen. Clusters complicate it in one way: a cluster's nodes must sit next to
 * each other in every rank, and two sibling clusters must keep the same
 * left-to-right order in every rank — otherwise their frames would overlap.
 * Both are enforced by sorting hierarchically (a cluster is sorted as one
 * block among its siblings) and by a canonical order of sibling clusters that
 * every rank follows.
 */
import type { Graph, WNode } from './graph'

export type ClusterParents = ReadonlyMap<string, string | null>

/** The clusters containing a node, outermost first. */
function chain(cluster: string | null, parents: ClusterParents): string[] {
  const out: string[] = []
  let c = cluster
  while (c) {
    out.unshift(c)
    c = parents.get(c) ?? null
  }
  return out
}

export function buildLayers(g: Graph): WNode[][] {
  const layers: WNode[][] = []
  for (const n of g.nodes.values()) {
    ;(layers[n.rank] ??= []).push(n)
  }
  for (let i = 0; i < layers.length; i++) layers[i] ??= []
  return layers
}

/** Initial order: depth-first from the top, so connected nodes start close. */
function initialOrder(g: Graph, layers: WNode[][]): void {
  const visited = new Set<string>()
  const next = layers.map(() => 0)
  const ordered: WNode[] = [...g.nodes.values()].sort((a, b) => a.rank - b.rank)
  for (const start of ordered) {
    if (visited.has(start.id)) continue
    const stack = [start]
    while (stack.length > 0) {
      const n = stack.pop()!
      if (visited.has(n.id)) continue
      visited.add(n.id)
      n.order = next[n.rank]!++
      const succ = g.out(n.id).map((e) => g.node(e.w))
      for (let i = succ.length - 1; i >= 0; i--) {
        if (!visited.has(succ[i]!.id)) stack.push(succ[i]!)
      }
    }
  }
  for (const layer of layers) layer.sort((a, b) => a.order - b.order)
}

interface Group {
  cluster: string | null
  nodes: WNode[]
  children: Map<string, Group>
  /** Items in their current order: nodes and child cluster ids. */
  items: (WNode | string)[]
}

/**
 * Sorts one layer by `key`, keeping clusters contiguous and sibling clusters
 * in their canonical order. Ties keep their current order, or are reversed
 * with `biasRight`.
 */
function sortLayer(
  layer: WNode[],
  key: Map<string, number>,
  parents: ClusterParents,
  canonical: Map<string, number>,
  biasRight = false,
): WNode[] {
  const root: Group = { cluster: null, nodes: [], children: new Map(), items: [] }
  for (const n of layer) {
    let group = root
    for (const c of chain(n.cluster, parents)) {
      let child = group.children.get(c)
      if (!child) {
        child = { cluster: c, nodes: [], children: new Map(), items: [] }
        group.children.set(c, child)
        group.items.push(c)
      }
      group = child
    }
    group.nodes.push(n)
    group.items.push(n)
  }

  const groupKey = new Map<Group, number>()
  const keyOf = (group: Group): number => {
    const cached = groupKey.get(group)
    if (cached !== undefined) return cached
    let sum = 0
    let count = 0
    const walk = (g: Group) => {
      for (const n of g.nodes) {
        sum += key.get(n.id)!
        count++
      }
      for (const c of g.children.values()) walk(c)
    }
    walk(group)
    const value = count > 0 ? sum / count : 0
    groupKey.set(group, value)
    return value
  }

  const flatten = (group: Group): WNode[] => {
    const indexed = group.items.map((item, index) => ({
      item,
      index,
      k: typeof item === 'string' ? keyOf(group.children.get(item)!) : key.get(item.id)!,
    }))
    indexed.sort((a, b) => a.k - b.k || (biasRight ? b.index - a.index : a.index - b.index))
    // Sibling clusters take the slots clusters landed in, in canonical order.
    const slots = indexed.flatMap((entry, i) => (typeof entry.item === 'string' ? [i] : []))
    const clusters = slots
      .map((i) => indexed[i]!.item as string)
      .sort((a, b) => (canonical.get(a) ?? 0) - (canonical.get(b) ?? 0))
    slots.forEach((slot, i) => {
      indexed[slot]!.item = clusters[i]!
    })
    const out: WNode[] = []
    for (const entry of indexed) {
      if (typeof entry.item === 'string') out.push(...flatten(group.children.get(entry.item)!))
      else out.push(entry.item)
    }
    return out
  }

  return flatten(root)
}

/** Crossings between two adjacent layers (Barth, Jünger and Mutzel's accumulator tree). */
function crossingsBetween(g: Graph, upper: WNode[], lower: WNode[]): number {
  const pos = new Map(lower.map((n, i) => [n.id, i]))
  const targets: { u: number; l: number; w: number }[] = []
  upper.forEach((n, ui) => {
    for (const e of g.out(n.id)) {
      const l = pos.get(e.w)
      if (l !== undefined) targets.push({ u: ui, l, w: e.weight || 1 })
    }
  })
  targets.sort((a, b) => a.u - b.u || a.l - b.l)
  let first = 1
  while (first < lower.length) first <<= 1
  const tree = new Array<number>(2 * first - 1).fill(0)
  first -= 1
  let crossings = 0
  for (const t of targets) {
    let index = t.l + first
    tree[index]! += t.w
    let weightSum = 0
    while (index > 0) {
      if (index % 2) weightSum += tree[index + 1]!
      index = (index - 1) >> 1
      tree[index]! += t.w
    }
    crossings += t.w * weightSum
  }
  return crossings
}

/**
 * Edges that pass through a cluster they do not belong to: from the left of
 * its block in one rank to the right of it in the next, or back. Counted as
 * crossings, since that is what the reader sees — a line across a frame.
 */
function frameCrossingsBetween(g: Graph, upper: WNode[], lower: WNode[], parents: ClusterParents): number {
  const ranges = (layer: WNode[]) => {
    const out = new Map<string, { from: number; to: number }>()
    layer.forEach((n, i) => {
      for (const c of chain(n.cluster, parents)) {
        const r = out.get(c)
        if (r) r.to = i
        else out.set(c, { from: i, to: i })
      }
    })
    return out
  }
  const up = ranges(upper)
  const down = ranges(lower)
  if (up.size === 0 || down.size === 0) return 0
  const pos = new Map(lower.map((n, i) => [n.id, i]))
  let count = 0
  upper.forEach((n, ui) => {
    for (const e of g.out(n.id)) {
      const li = pos.get(e.w)
      if (li === undefined) continue
      for (const [c, a] of up) {
        const b = down.get(c)
        if (!b) continue
        if ((ui < a.from && li > b.to) || (ui > a.to && li < b.from)) count += 2
      }
    }
  })
  return count
}

export function totalCrossings(g: Graph, layers: WNode[][], parents: ClusterParents = new Map()): number {
  let total = 0
  for (let i = 0; i + 1 < layers.length; i++) {
    total += crossingsBetween(g, layers[i]!, layers[i + 1]!)
    if (parents.size > 0) total += frameCrossingsBetween(g, layers[i]!, layers[i + 1]!, parents)
  }
  return total
}

function canonicalClusterOrder(layers: WNode[][], parents: ClusterParents): Map<string, number> {
  const sum = new Map<string, number>()
  const count = new Map<string, number>()
  for (const layer of layers) {
    layer.forEach((n, i) => {
      const relative = layer.length > 1 ? i / (layer.length - 1) : 0.5
      for (const c of chain(n.cluster, parents)) {
        sum.set(c, (sum.get(c) ?? 0) + relative)
        count.set(c, (count.get(c) ?? 0) + 1)
      }
    })
  }
  const out = new Map<string, number>()
  for (const [c, s] of sum) out.set(c, s / count.get(c)!)
  return out
}

/**
 * Transpose: swaps neighbours in a layer while that removes crossings with
 * the layers above and below. The barycenter sweeps settle in local minima
 * a single swap gets out of — typically a node with one edge that ties with
 * a node pulled two ways. Only nodes in the same cluster are swapped, so
 * clusters stay contiguous.
 */
function transpose(g: Graph, layers: WNode[][]): void {
  // Crossings between the edges of u and those of v, with u left of v: only
  // these change when the two swap. Frame crossings cannot change — both
  // are in the same cluster, and no other cluster's block can sit between them.
  const pairs = (us: { order: number; w: number }[], vs: { order: number; w: number }[]): number => {
    let c = 0
    for (const a of us) for (const b of vs) if (a.order > b.order) c += a.w * b.w
    return c
  }
  const ends = (n: WNode) => ({
    up: g.in(n.id).map((e) => ({ order: g.node(e.v).order, w: e.weight || 1 })),
    down: g.out(n.id).map((e) => ({ order: g.node(e.w).order, w: e.weight || 1 })),
  })
  const cost = (u: ReturnType<typeof ends>, v: ReturnType<typeof ends>) => pairs(u.up, v.up) + pairs(u.down, v.down)
  for (let round = 0; round < 8; round++) {
    let improved = false
    for (const layer of layers) {
      if (layer.length < 2) continue
      for (let j = 0; j + 1 < layer.length; j++) {
        const a = layer[j]!
        const b = layer[j + 1]!
        if (a.cluster !== b.cluster) continue
        const ea = ends(a)
        const eb = ends(b)
        if (cost(eb, ea) < cost(ea, eb)) {
          layer[j] = b
          layer[j + 1] = a
          improved = true
        }
      }
      layer.forEach((n, k) => (n.order = k))
    }
    if (!improved) break
  }
}

/**
 * Orders every layer in place and sets `node.order`.
 * Returns the layers, each in its final order. With `refine`, every sweep
 * is followed by a transpose pass.
 */
export function order(g: Graph, parents: ClusterParents, iterations = 24, refine = false): WNode[][] {
  const layers = buildLayers(g)
  initialOrder(g, layers)

  let canonical = canonicalClusterOrder(layers, parents)
  // Make the starting point respect the cluster constraints too.
  for (let i = 0; i < layers.length; i++) {
    const key = new Map(layers[i]!.map((n, j) => [n.id, j]))
    layers[i] = sortLayer(layers[i]!, key, parents, canonical)
  }
  const assign = (ls: WNode[][]) => ls.forEach((layer) => layer.forEach((n, i) => (n.order = i)))
  assign(layers)
  if (refine) transpose(g, layers)

  let best = layers.map((l) => l.slice())
  let bestCrossings = totalCrossings(g, layers, parents)
  let sinceImprovement = 0

  for (let it = 0; it < iterations && bestCrossings > 0 && sinceImprovement < 4; it++) {
    const down = it % 2 === 0
    // Refined: every other pair of sweeps breaks ties the other way, which
    // gets out of the minima where two nodes pull equally (as dagre does).
    const biasRight = refine && it % 4 >= 2
    const range = down
      ? Array.from({ length: layers.length - 1 }, (_, i) => i + 1)
      : Array.from({ length: layers.length - 1 }, (_, i) => layers.length - 2 - i)
    // The layer the sweep starts from is not re-sorted by neighbours, but it
    // must follow the current canonical cluster order like the rest.
    const fixed = down ? 0 : layers.length - 1
    const identity = new Map(layers[fixed]!.map((n, j) => [n.id, j]))
    layers[fixed] = sortLayer(layers[fixed]!, identity, parents, canonical)
    layers[fixed]!.forEach((n, j) => (n.order = j))
    for (const i of range) {
      const layer = layers[i]!
      const key = new Map<string, number>()
      for (const n of layer) {
        const neighbours = down
          ? g.in(n.id).map((e) => ({ order: g.node(e.v).order, w: e.weight || 1 }))
          : g.out(n.id).map((e) => ({ order: g.node(e.w).order, w: e.weight || 1 }))
        if (neighbours.length === 0) {
          key.set(n.id, n.order)
        } else {
          let s = 0
          let ws = 0
          for (const nb of neighbours) {
            s += nb.order * nb.w
            ws += nb.w
          }
          key.set(n.id, s / ws)
        }
      }
      layers[i] = sortLayer(layer, key, parents, canonical, biasRight)
      layers[i]!.forEach((n, j) => (n.order = j))
    }
    if (refine) transpose(g, layers)
    canonical = canonicalClusterOrder(layers, parents)
    const crossings = totalCrossings(g, layers, parents)
    if (crossings < bestCrossings) {
      bestCrossings = crossings
      best = layers.map((l) => l.slice())
      sinceImprovement = 0
    } else {
      sinceImprovement++
    }
  }
  assign(best)
  return best
}
