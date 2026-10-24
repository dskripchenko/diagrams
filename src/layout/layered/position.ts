/**
 * Coordinates.
 *
 * x is assigned in two steps. First the priority method (Sugiyama, Tagawa and
 * Toda): sweeps that pull every node towards the median of its neighbours,
 * where long edges (chains of dummies) win conflicts so they come out
 * straight. Then cluster compaction: each cluster becomes a rigid block with
 * its padding, and blocks are pushed apart wherever a frame would overlap
 * something in any rank it spans. The second step only ever moves things
 * apart, so it cannot undo the separation the first one established.
 */
import type { Graph, WNode } from './graph'
import type { ClusterParents } from './order'

export interface Spacing {
  nodeSep: number
  edgeSep: number
  rankSep: number
  clusterPadding: number
  /**
   * Extra room on the left of a cluster's frame, by cluster: where LR and RL
   * layouts keep the title, since their left becomes the drawing's top.
   */
  frameLeft?: ReadonlyMap<string, number>
}

function isDummy(n: WNode): boolean {
  return n.dummy === 'edge' || n.dummy === 'label' || n.dummy === 'spine'
}

function separation(a: WNode, b: WNode, s: Spacing): number {
  const gap = isDummy(a) && isDummy(b) ? s.edgeSep : isDummy(a) || isDummy(b) ? (s.nodeSep + s.edgeSep) / 2 : s.nodeSep
  return a.width / 2 + gap + b.width / 2
}

function packLeft(layer: WNode[], s: Spacing): void {
  let x = 0
  layer.forEach((n, i) => {
    x = i === 0 ? n.width / 2 : x + separation(layer[i - 1]!, n, s)
    n.x = x
  })
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * One rank of the priority method: nodes move towards `desired` in order of
 * priority; a node may push lower-priority neighbours along, never higher.
 */
function placeLayer(layer: WNode[], desired: Map<string, number>, priority: Map<string, number>, s: Spacing): void {
  const fixed = new Array<boolean>(layer.length).fill(false)
  const order = layer.map((_, i) => i).sort((a, b) => priority.get(layer[b]!.id)! - priority.get(layer[a]!.id)! || a - b)
  for (const i of order) {
    const node = layer[i]!
    const target = desired.get(node.id)
    if (target === undefined) {
      fixed[i] = true
      continue
    }
    if (target > node.x) {
      // How far right can it go: until a fixed node to the right blocks it.
      let limit = Infinity
      let span = 0
      for (let j = i + 1; j < layer.length; j++) {
        span += separation(layer[j - 1]!, layer[j]!, s)
        if (fixed[j]) {
          limit = layer[j]!.x - span
          break
        }
      }
      const x = Math.min(target, limit)
      if (x > node.x) {
        node.x = x
        for (let j = i + 1; j < layer.length; j++) {
          const min = layer[j - 1]!.x + separation(layer[j - 1]!, layer[j]!, s)
          if (layer[j]!.x >= min) break
          layer[j]!.x = min
        }
      }
    } else if (target < node.x) {
      let limit = -Infinity
      let span = 0
      for (let j = i - 1; j >= 0; j--) {
        span += separation(layer[j]!, layer[j + 1]!, s)
        if (fixed[j]) {
          limit = layer[j]!.x + span
          break
        }
      }
      const x = Math.max(target, limit)
      if (x < node.x) {
        node.x = x
        for (let j = i - 1; j >= 0; j--) {
          const max = layer[j + 1]!.x - separation(layer[j]!, layer[j + 1]!, s)
          if (layer[j]!.x <= max) break
          layer[j]!.x = max
        }
      }
    }
    fixed[i] = true
  }
}

function priorityX(g: Graph, layers: WNode[][], s: Spacing, rounds = 4): void {
  for (const layer of layers) packLeft(layer, s)

  const sweep = (down: boolean) => {
    const indices = down
      ? Array.from({ length: layers.length - 1 }, (_, i) => i + 1)
      : Array.from({ length: layers.length - 1 }, (_, i) => layers.length - 2 - i)
    for (const i of indices) {
      const layer = layers[i]!
      const desired = new Map<string, number>()
      const priority = new Map<string, number>()
      for (const n of layer) {
        const neighbours = down ? g.in(n.id).map((e) => g.node(e.v)) : g.out(n.id).map((e) => g.node(e.w))
        if (neighbours.length > 0) desired.set(n.id, median(neighbours.map((m) => m.x)))
        // Dummies of long edges outrank everything, so the edges come out straight.
        const p = isDummy(n) && neighbours.some(isDummy) ? 1e6 : neighbours.length
        priority.set(n.id, p)
      }
      placeLayer(layer, desired, priority, s)
    }
  }
  for (let r = 0; r < rounds; r++) {
    sweep(true)
    sweep(false)
  }
  // A last pass that looks both ways, so nodes settle between their parents and children.
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]!
    const desired = new Map<string, number>()
    const priority = new Map<string, number>()
    for (const n of layer) {
      const neighbours = [...g.in(n.id).map((e) => g.node(e.v)), ...g.out(n.id).map((e) => g.node(e.w))]
      if (neighbours.length > 0) desired.set(n.id, median(neighbours.map((m) => m.x)))
      priority.set(n.id, isDummy(n) ? 1e6 : neighbours.length)
    }
    placeLayer(layer, desired, priority, s)
  }
}

/**
 * Assigns x and y to every node.
 */
export function position(
  g: Graph,
  layers: WNode[][],
  parents: ClusterParents,
  s: Spacing,
): void {
  priorityX(g, layers, s)
  compactClusters(g, layers, parents, s)

  let min = Infinity
  for (const n of g.nodes.values()) min = Math.min(min, n.x - n.width / 2)
  if (Number.isFinite(min)) for (const n of g.nodes.values()) n.x -= min

  // y: ranks stacked with half the rank separation between them (ranks are
  // doubled to make room for edge labels, so two half-gaps make one gap).
  let y = 0
  layers.forEach((layer, i) => {
    let h = 0
    for (const n of layer) h = Math.max(h, n.height)
    if (i > 0) y += s.rankSep / 2
    for (const n of layer) n.y = y + h / 2
    y += h
  })
}

/** Members of every cluster (all descendants), and the root's under null. */
function membership(g: Graph, parents: ClusterParents): Map<string | null, WNode[]> {
  const members = new Map<string | null, WNode[]>()
  for (const n of g.nodes.values()) {
    let c: string | null = n.cluster
    for (;;) {
      const list = members.get(c) ?? []
      list.push(n)
      members.set(c, list)
      if (c === null) break
      c = parents.get(c) ?? null
    }
  }
  return members
}

function childClusters(parents: ClusterParents): Map<string | null, string[]> {
  const children = new Map<string | null, string[]>()
  for (const [c, p] of parents) {
    const list = children.get(p) ?? []
    list.push(c)
    children.set(p, list)
  }
  return children
}

/**
 * The horizontal frame of every cluster from the current node positions:
 * its direct nodes and its child frames, plus padding.
 */
export function clusterFrames(
  g: Graph,
  parents: ClusterParents,
  padding: number,
  frameLeft?: ReadonlyMap<string, number>,
): Map<string, { left: number; right: number }> {
  const children = childClusters(parents)
  const direct = new Map<string, WNode[]>()
  for (const n of g.nodes.values()) {
    if (n.cluster === null) continue
    const list = direct.get(n.cluster) ?? []
    list.push(n)
    direct.set(n.cluster, list)
  }
  const frames = new Map<string, { left: number; right: number }>()
  const visit = (c: string): { left: number; right: number } => {
    const cached = frames.get(c)
    if (cached) return cached
    let left = Infinity
    let right = -Infinity
    for (const n of direct.get(c) ?? []) {
      left = Math.min(left, n.x - n.width / 2)
      right = Math.max(right, n.x + n.width / 2)
    }
    for (const child of children.get(c) ?? []) {
      const f = visit(child)
      left = Math.min(left, f.left)
      right = Math.max(right, f.right)
    }
    if (!Number.isFinite(left)) {
      left = 0
      right = 0
    }
    const frame = { left: left - padding - (frameLeft?.get(c) ?? 0), right: right + padding }
    frames.set(c, frame)
    return frame
  }
  for (const c of parents.keys()) visit(c)
  return frames
}

/**
 * Pushes clusters apart as rigid blocks, bottom-up: a cluster's content is
 * settled first, then the cluster is a single unit to its parent. In every
 * rank, consecutive units must not overlap; units only ever move right, so
 * the separation established before is kept.
 */
function compactClusters(g: Graph, layers: WNode[][], parents: ClusterParents, s: Spacing): void {
  if (parents.size === 0) return
  const children = childClusters(parents)
  const members = membership(g, parents)
  const unitOf = (n: WNode, level: string | null): string | null => {
    let c = n.cluster
    let prev: string | null = null
    while (c !== level) {
      if (c === null) return null
      prev = c
      c = parents.get(c) ?? null
    }
    return prev ?? n.id
  }

  const compact = (level: string | null): void => {
    for (const child of children.get(level) ?? []) compact(child)
    const frames = clusterFrames(g, parents, s.clusterPadding, s.frameLeft)

    interface Unit {
      cluster: boolean
      left: number
      right: number
      dummy: boolean
    }
    const units = new Map<string, Unit>()
    for (const n of members.get(level) ?? []) {
      const id = unitOf(n, level)
      if (id === null || units.has(id)) continue
      if (id === n.id) {
        units.set(id, { cluster: false, left: n.x - n.width / 2, right: n.x + n.width / 2, dummy: isDummy(n) })
      } else {
        const f = frames.get(id)!
        units.set(id, { cluster: true, left: f.left, right: f.right, dummy: false })
      }
    }

    const edges = new Map<string, Map<string, number>>()
    const indegree = new Map<string, number>([...units.keys()].map((id) => [id, 0]))
    for (const layer of layers) {
      let prev: string | null = null
      for (const n of layer) {
        const id = unitOf(n, level)
        if (id === null || id === prev) continue
        if (prev !== null) {
          const a = units.get(prev)!
          const b = units.get(id)!
          const gap = a.dummy && b.dummy ? s.edgeSep : a.dummy || b.dummy ? (s.nodeSep + s.edgeSep) / 2 : s.nodeSep
          const out: Map<string, number> = edges.get(prev) ?? new Map<string, number>()
          if (!out.has(id)) indegree.set(id, indegree.get(id)! + 1)
          // Distance needed between the two left edges.
          out.set(id, Math.max(out.get(id) ?? -Infinity, a.right - a.left + gap))
          edges.set(prev, out)
        }
        prev = id
      }
    }

    const left = new Map([...units].map(([id, u]) => [id, u.left]))
    const queue = [...units.keys()].filter((id) => indegree.get(id) === 0)
    while (queue.length > 0) {
      const id = queue.shift()!
      for (const [to, dist] of edges.get(id) ?? []) {
        left.set(to, Math.max(left.get(to)!, left.get(id)! + dist))
        indegree.set(to, indegree.get(to)! - 1)
        if (indegree.get(to) === 0) queue.push(to)
      }
    }
    for (const [id, u] of units) {
      const dx = left.get(id)! - u.left
      if (dx === 0) continue
      if (u.cluster) for (const m of members.get(id) ?? []) m.x += dx
      else g.node(id).x += dx
    }
  }
  compact(null)
}
