import { describe, expect, it } from 'vitest'
import { layout, type LayoutInput } from '../src/layout/layered'
import type { Box } from '../src/core/geometry'

function overlap(a: Box, b: Box, margin = 0): boolean {
  return (
    Math.abs(a.x - b.x) * 2 < a.width + b.width + margin * 2 - 0.01 &&
    Math.abs(a.y - b.y) * 2 < a.height + b.height + margin * 2 - 0.01
  )
}

function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x - inner.width / 2 >= outer.x - outer.width / 2 - 0.01 &&
    inner.x + inner.width / 2 <= outer.x + outer.width / 2 + 0.01 &&
    inner.y - inner.height / 2 >= outer.y - outer.height / 2 - 0.01 &&
    inner.y + inner.height / 2 <= outer.y + outer.height / 2 + 0.01
  )
}

/** Deterministic pseudo-random numbers for generated graphs. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function randomGraph(seed: number, n: number, m: number, clustered: boolean): LayoutInput {
  const r = rng(seed)
  const clusters = clustered
    ? [
        { id: 'c0', label: { width: 60, height: 16 } },
        { id: 'c1', label: { width: 40, height: 16 } },
        { id: 'c2', parent: 'c1', label: { width: 30, height: 16 } },
      ]
    : []
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    width: 40 + Math.floor(r() * 80),
    height: 30 + Math.floor(r() * 20),
    cluster: clustered ? (['c0', 'c1', 'c2', undefined, undefined][Math.floor(r() * 5)] as string | undefined) : undefined,
  }))
  const edges = Array.from({ length: m }, (_, i) => ({
    id: `e${i}`,
    from: `n${Math.floor(r() * n)}`,
    to: `n${Math.floor(r() * n)}`,
    label: r() < 0.3 ? { width: 30, height: 14 } : undefined,
  }))
  return { nodes, edges, clusters }
}

function check(input: LayoutInput) {
  const result = layout(input)
  const boxes = [...result.nodes.entries()]
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(overlap(boxes[i]![1], boxes[j]![1]), `${boxes[i]![0]} overlaps ${boxes[j]![0]}`).toBe(false)
    }
  }
  const parents = new Map((input.clusters ?? []).map((c) => [c.id, c.parent]))
  const within = (node: string | undefined, cluster: string): boolean => {
    let c = node
    while (c) {
      if (c === cluster) return true
      c = parents.get(c)
    }
    return false
  }
  for (const c of input.clusters ?? []) {
    const frame = result.clusters.get(c.id)!
    for (const n of input.nodes) {
      const box = result.nodes.get(n.id)!
      if (within(n.cluster, c.id)) {
        expect(contains(frame, box), `${n.id} outside its cluster ${c.id}`).toBe(true)
      } else {
        expect(overlap(frame, box), `${n.id} inside foreign cluster ${c.id}`).toBe(false)
      }
    }
    for (const k of input.clusters ?? []) {
      if (k.id === c.id || within(k.id, c.id) || within(c.id, k.id)) continue
      expect(overlap(frame, result.clusters.get(k.id)!), `${c.id} overlaps ${k.id}`).toBe(false)
    }
  }
  for (const box of result.nodes.values()) {
    expect(box.x - box.width / 2).toBeGreaterThanOrEqual(-0.01)
    expect(box.y - box.height / 2).toBeGreaterThanOrEqual(-0.01)
    expect(box.x + box.width / 2).toBeLessThanOrEqual(result.width + 0.01)
    expect(box.y + box.height / 2).toBeLessThanOrEqual(result.height + 0.01)
  }
  return result
}

describe('layered layout', () => {
  it('puts a chain top to bottom', () => {
    const r = check({
      nodes: ['a', 'b', 'c'].map((id) => ({ id, width: 50, height: 30 })),
      edges: [
        { id: '1', from: 'a', to: 'b' },
        { id: '2', from: 'b', to: 'c' },
      ],
    })
    const [a, b, c] = ['a', 'b', 'c'].map((id) => r.nodes.get(id)!)
    expect(a!.y).toBeLessThan(b!.y)
    expect(b!.y).toBeLessThan(c!.y)
    expect(a!.x).toBeCloseTo(b!.x)
  })

  it('lays out left to right', () => {
    const r = check({
      direction: 'LR',
      nodes: ['a', 'b'].map((id) => ({ id, width: 80, height: 30 })),
      edges: [{ id: '1', from: 'a', to: 'b' }],
    })
    expect(r.nodes.get('a')!.x).toBeLessThan(r.nodes.get('b')!.x)
    expect(r.nodes.get('a')!.y).toBeCloseTo(r.nodes.get('b')!.y)
  })

  it('handles cycles and self loops', () => {
    const r = check({
      nodes: ['a', 'b', 'c'].map((id) => ({ id, width: 50, height: 30 })),
      edges: [
        { id: '1', from: 'a', to: 'b' },
        { id: '2', from: 'b', to: 'c' },
        { id: '3', from: 'c', to: 'a' },
        { id: '4', from: 'b', to: 'b' },
      ],
    })
    expect(r.edges.get('4')!.selfLoop).toBe(true)
    expect(r.edges.get('3')!.points.length).toBeGreaterThan(0)
  })

  it('keeps label room on the middle of an edge', () => {
    const r = check({
      nodes: ['a', 'b'].map((id) => ({ id, width: 50, height: 30 })),
      edges: [{ id: '1', from: 'a', to: 'b', label: { width: 60, height: 16 } }],
    })
    const label = r.edges.get('1')!.label!
    expect(label.y).toBeGreaterThan(r.nodes.get('a')!.y)
    expect(label.y).toBeLessThan(r.nodes.get('b')!.y)
  })

  it('is deterministic', () => {
    const input = randomGraph(7, 30, 45, true)
    const a = layout(input)
    const b = layout(input)
    expect([...a.nodes]).toEqual([...b.nodes])
    expect([...a.edges]).toEqual([...b.edges])
  })

  for (const seed of [1, 2, 3, 4, 5, 6, 8, 9, 10, 11]) {
    it(`random graph ${seed} has no overlaps`, () => {
      check(randomGraph(seed, 12 + seed * 3, 15 + seed * 4, false))
    })
    it(`random clustered graph ${seed} keeps frames apart`, () => {
      check(randomGraph(seed * 31, 10 + seed * 2, 12 + seed * 3, true))
    })
    it(`random LR clustered graph ${seed}`, () => {
      check({ ...randomGraph(seed * 17, 10 + seed, 12 + seed * 2, true), direction: 'LR' })
    })
  }

  it('lays out 500 nodes quickly', () => {
    const input = randomGraph(99, 500, 700, false)
    const start = performance.now()
    layout(input)
    expect(performance.now() - start).toBeLessThan(3000)
  })
})
