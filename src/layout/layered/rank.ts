/**
 * Cycle removal and ranking.
 *
 * Ranking is the network simplex of Gansner et al. ("A Technique for Drawing
 * Directed Graphs", 1993), the same method Graphviz and dagre use: it
 * minimises the total weighted length of edges, which is what makes a
 * flowchart look compact rather than stretched.
 */
import type { Graph, WEdge } from './graph'

/**
 * Turns around the edges that close cycles, found by depth-first search in
 * insertion order — so the edge reversed is the one the author wrote last in
 * the loop, which is usually the "back" edge they meant.
 */
export function removeCycles(g: Graph): void {
  const state = new Map<string, 0 | 1 | 2>()
  const reverse: WEdge[] = []
  for (const start of g.nodes.keys()) {
    if (state.get(start)) continue
    const stack: { id: string; i: number }[] = [{ id: start, i: 0 }]
    state.set(start, 1)
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!
      const out = g.out(top.id)
      if (top.i < out.length) {
        const e = out[top.i++]!
        const s = state.get(e.w) ?? 0
        if (s === 1) {
          reverse.push(e)
        } else if (s === 0) {
          state.set(e.w, 1)
          stack.push({ id: e.w, i: 0 })
        }
      } else {
        state.set(top.id, 2)
        stack.pop()
      }
    }
  }
  for (const e of reverse) {
    const v = e.v
    e.v = e.w
    e.w = v
    e.reversed = !e.reversed
  }
  if (reverse.length > 0) g.reindex()
}

interface SEdge {
  v: string
  w: string
  minlen: number
  weight: number
}

/** A simple graph for ranking: parallel edges merged, as network simplex expects. */
function simplify(g: Graph, ids: readonly string[]): { nodes: string[]; edges: SEdge[] } {
  const inside = new Set(ids)
  const merged = new Map<string, SEdge>()
  for (const e of g.edges) {
    if (!inside.has(e.v) || e.v === e.w) continue
    const key = `${e.v}\u0000${e.w}`
    const existing = merged.get(key)
    if (existing) {
      existing.weight += e.weight
      existing.minlen = Math.max(existing.minlen, e.minlen)
    } else {
      merged.set(key, { v: e.v, w: e.w, minlen: e.minlen, weight: e.weight })
    }
  }
  return { nodes: [...ids], edges: [...merged.values()] }
}

/** Weakly connected components, each in insertion order. */
export function components(g: Graph): string[][] {
  const seen = new Set<string>()
  const out: string[][] = []
  for (const start of g.nodes.keys()) {
    if (seen.has(start)) continue
    const comp: string[] = []
    const queue = [start]
    seen.add(start)
    while (queue.length > 0) {
      const id = queue.shift()!
      comp.push(id)
      for (const e of [...g.out(id), ...g.in(id)]) {
        const other = e.v === id ? e.w : e.v
        if (!seen.has(other)) {
          seen.add(other)
          queue.push(other)
        }
      }
    }
    out.push(comp)
  }
  return out
}

/**
 * Network simplex leaves ties: a node whose incoming weight equals its
 * outgoing weight costs the same anywhere between its neighbours, and the
 * initial ranking puts it as low as it can go — far from where it is drawn
 * from. Moving such a node up never makes the total longer (it shortens the
 * incoming edges at least as much as it lengthens the outgoing ones), so
 * every node with at least as much weight coming in as going out is pulled
 * up against its predecessors, in topological order.
 */
function pullUp(g: Graph, ids: readonly string[]): void {
  const indegree = new Map(ids.map((id) => [id, g.in(id).length]))
  const queue = ids.filter((id) => indegree.get(id) === 0)
  while (queue.length > 0) {
    const id = queue.shift()!
    const ins = g.in(id)
    const outs = g.out(id)
    if (ins.length > 0) {
      const inWeight = ins.reduce((sum, e) => sum + e.weight, 0)
      const outWeight = outs.reduce((sum, e) => sum + e.weight, 0)
      if (inWeight >= outWeight) {
        let target = -Infinity
        for (const e of ins) target = Math.max(target, g.node(e.v).rank + e.minlen)
        const n = g.node(id)
        if (target < n.rank) n.rank = target
      }
    }
    for (const e of outs) {
      indegree.set(e.w, indegree.get(e.w)! - 1)
      if (indegree.get(e.w) === 0) queue.push(e.w)
    }
  }
}

/** Assigns `rank` to every node: 0 is the top, each component starts at 0. */
export function rank(g: Graph, maxIterations = 2000): void {
  for (const comp of components(g)) {
    const { nodes, edges } = simplify(g, comp)
    const ranks = networkSimplex(nodes, edges, maxIterations)
    let min = Infinity
    for (const r of ranks.values()) min = Math.min(min, r)
    for (const [id, r] of ranks) g.node(id).rank = r - min
    pullUp(g, comp)
    let low = Infinity
    for (const id of comp) low = Math.min(low, g.node(id).rank)
    for (const id of comp) g.node(id).rank -= low
  }
}

/**
 * Network simplex over one connected component.
 * Returns ranks (not normalised).
 */
export function networkSimplex(
  nodes: readonly string[],
  edges: readonly SEdge[],
  maxIterations: number,
): Map<string, number> {
  const out = new Map<string, SEdge[]>()
  const inn = new Map<string, SEdge[]>()
  for (const n of nodes) {
    out.set(n, [])
    inn.set(n, [])
  }
  for (const e of edges) {
    out.get(e.v)!.push(e)
    inn.get(e.w)!.push(e)
  }
  const edgeKey = (v: string, w: string) => `${v}\u0000${w}`
  const byKey = new Map(edges.map((e) => [edgeKey(e.v, e.w), e]))
  const graphEdge = (v: string, w: string) => byKey.get(edgeKey(v, w))

  // 1. Longest path: an initial feasible ranking.
  const ranks = new Map<string, number>()
  const visit = (start: string) => {
    // Iterative post-order: rank(v) = min(rank(w) - minlen), sinks at 0.
    const stack: { id: string; i: number }[] = [{ id: start, i: 0 }]
    const onStack = new Set([start])
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!
      const list = out.get(top.id)!
      if (top.i < list.length) {
        const e = list[top.i++]!
        if (!ranks.has(e.w) && !onStack.has(e.w)) {
          onStack.add(e.w)
          stack.push({ id: e.w, i: 0 })
        }
      } else {
        let r = Infinity
        for (const e of list) r = Math.min(r, ranks.get(e.w)! - e.minlen)
        ranks.set(top.id, r === Infinity ? 0 : r)
        stack.pop()
      }
    }
  }
  for (const n of nodes) if (!ranks.has(n)) visit(n)
  if (nodes.length <= 1 || edges.length === 0) return ranks

  const slack = (e: SEdge) => ranks.get(e.w)! - ranks.get(e.v)! - e.minlen

  // 2. Feasible tight spanning tree.
  const treeAdj = new Map<string, Set<string>>()
  const addTreeEdge = (v: string, w: string) => {
    treeAdj.get(v)!.add(w)
    treeAdj.get(w)!.add(v)
  }
  const growTight = (): number => {
    const stack = [...treeAdj.keys()]
    while (stack.length > 0) {
      const v = stack.pop()!
      for (const e of [...out.get(v)!, ...inn.get(v)!]) {
        const w = e.v === v ? e.w : e.v
        if (!treeAdj.has(w) && slack(e) === 0) {
          treeAdj.set(w, new Set())
          addTreeEdge(v, w)
          stack.push(w)
        }
      }
    }
    return treeAdj.size
  }
  treeAdj.set(nodes[0]!, new Set())
  while (growTight() < nodes.length) {
    let best: SEdge | null = null
    let bestSlack = Infinity
    for (const e of edges) {
      const inV = treeAdj.has(e.v)
      const inW = treeAdj.has(e.w)
      if (inV !== inW) {
        const s = slack(e)
        if (s < bestSlack) {
          bestSlack = s
          best = e
        }
      }
    }
    if (!best) break
    const delta = treeAdj.has(best.v) ? bestSlack : -bestSlack
    for (const v of treeAdj.keys()) ranks.set(v, ranks.get(v)! + delta)
  }

  // 3. Cut values and the simplex iterations.
  const root = nodes[0]!
  const low = new Map<string, number>()
  const lim = new Map<string, number>()
  const parent = new Map<string, string | undefined>()
  const cut = new Map<string, number>()
  const treeKey = (a: string, b: string) => (a < b ? edgeKey(a, b) : edgeKey(b, a))

  const initLowLim = () => {
    low.clear()
    lim.clear()
    parent.clear()
    let next = 1
    const stack: { id: string; it: Iterator<string>; low: number }[] = []
    parent.set(root, undefined)
    stack.push({ id: root, it: treeAdj.get(root)!.values(), low: next })
    const visited = new Set([root])
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!
      const step = top.it.next()
      if (!step.done) {
        const w = step.value
        if (!visited.has(w)) {
          visited.add(w)
          parent.set(w, top.id)
          stack.push({ id: w, it: treeAdj.get(w)!.values(), low: next })
        }
      } else {
        low.set(top.id, top.low)
        lim.set(top.id, next++)
        stack.pop()
      }
    }
  }

  const postorder = (): string[] => [...lim.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)

  const calcCut = (child: string): number => {
    const par = parent.get(child)!
    let childIsTail = true
    let ge = graphEdge(child, par)
    if (!ge) {
      childIsTail = false
      ge = graphEdge(par, child)!
    }
    let value = ge.weight
    for (const e of [...out.get(child)!, ...inn.get(child)!]) {
      const isOut = e.v === child
      const other = isOut ? e.w : e.v
      if (other === par) continue
      const pointsToHead = isOut === childIsTail
      value += pointsToHead ? e.weight : -e.weight
      if (treeAdj.get(child)!.has(other)) {
        const otherCut = cut.get(treeKey(child, other)) ?? 0
        value += pointsToHead ? -otherCut : otherCut
      }
    }
    return value
  }

  const initCutValues = () => {
    cut.clear()
    for (const v of postorder()) {
      const par = parent.get(v)
      if (par === undefined) continue
      cut.set(treeKey(v, par), calcCut(v))
    }
  }

  const updateRanks = () => {
    const order = [...lim.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
    // Pre-order from the root: a node's parent is ranked before it.
    for (const v of order) {
      const par = parent.get(v)
      if (par === undefined) continue
      const e = graphEdge(v, par)
      if (e) ranks.set(v, ranks.get(par)! - e.minlen)
      else ranks.set(v, ranks.get(par)! + graphEdge(par, v)!.minlen)
    }
  }

  const isDescendant = (v: string, rootOf: string) =>
    low.get(rootOf)! <= lim.get(v)! && lim.get(v)! <= lim.get(rootOf)!

  initLowLim()
  initCutValues()

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Leave: a tree edge with a negative cut value.
    let leave: { v: string; w: string } | null = null
    for (const [v, par] of parent) {
      if (par === undefined) continue
      if ((cut.get(treeKey(v, par)) ?? 0) < 0) {
        leave = graphEdge(v, par) ? { v, w: par } : { v: par, w: v }
        break
      }
    }
    if (!leave) break

    // Enter: the non-tree edge with the least slack crossing the same cut.
    let tail = leave.v
    let flip = false
    if (lim.get(leave.v)! > lim.get(leave.w)!) {
      tail = leave.w
      flip = true
    }
    let enter: SEdge | null = null
    let best = Infinity
    for (const e of edges) {
      if (flip === isDescendant(e.v, tail) && flip !== isDescendant(e.w, tail)) {
        const s = slack(e)
        if (s < best) {
          best = s
          enter = e
        }
      }
    }
    if (!enter) break

    treeAdj.get(leave.v)!.delete(leave.w)
    treeAdj.get(leave.w)!.delete(leave.v)
    addTreeEdge(enter.v, enter.w)
    initLowLim()
    initCutValues()
    updateRanks()
  }
  return ranks
}
