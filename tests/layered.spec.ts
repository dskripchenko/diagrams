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

  describe('with transpose', () => {
    /** Proper crossings between the drawn polylines of different edges. */
    const crossings = (input: LayoutInput): number => {
      const r = layout(input)
      const lines = input.edges
        .filter((e) => e.from !== e.to)
        .map((e) => [r.nodes.get(e.from)!, ...r.edges.get(e.id)!.points, r.nodes.get(e.to)!])
      const cross = (a: Box | { x: number; y: number }, b: typeof a, c: typeof a, d: typeof a) => {
        const o = (p: typeof a, q: typeof a, s: typeof a) => Math.sign((q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x))
        return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
      }
      let n = 0
      for (let i = 0; i < lines.length; i++)
        for (let j = i + 1; j < lines.length; j++)
          for (let s = 1; s < lines[i]!.length; s++)
            for (let t = 1; t < lines[j]!.length; t++)
              if (cross(lines[i]![s - 1]!, lines[i]![s]!, lines[j]![t - 1]!, lines[j]![t]!)) n++
      return n
    }

    for (const seed of [1, 2, 3, 4, 5]) {
      it(`random graph ${seed} keeps every invariant`, () => {
        check({ ...randomGraph(seed * 7, 14 + seed * 3, 18 + seed * 4, seed % 2 === 0), transpose: true })
      })
    }

    it('crosses less overall', () => {
      let before = 0
      let after = 0
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const input = randomGraph(seed * 13, 12 + seed * 2, 16 + seed * 3, false)
        before += crossings(input)
        after += crossings({ ...input, transpose: true })
      }
      expect(after).toBeLessThan(before)
    })

    it('untangles a tie the plain sweeps leave', () => {
      // ORDER feeds both bottom nodes, PRODUCT only the first: SHIPPER belongs on the left.
      const box = { width: 60, height: 30 }
      const input: LayoutInput = {
        nodes: ['CUSTOMER', 'ORDER', 'LOYALTY', 'PRODUCT', 'LINE', 'SHIPPER'].map((id) => ({ id, ...box })),
        edges: [
          { id: 'a', from: 'CUSTOMER', to: 'ORDER' },
          { id: 'b', from: 'CUSTOMER', to: 'LOYALTY' },
          { id: 'c', from: 'ORDER', to: 'LINE' },
          { id: 'd', from: 'PRODUCT', to: 'LINE' },
          { id: 'e', from: 'ORDER', to: 'SHIPPER' },
        ],
      }
      expect(crossings({ ...input, transpose: true })).toBe(0)
    })
  })

  it('lays out 500 nodes quickly', () => {
    const input = randomGraph(99, 500, 700, false)
    const start = performance.now()
    layout(input)
    expect(performance.now() - start).toBeLessThan(3000)
  })

  it('left to right, linked clusters follow one another instead of stacking into a column', () => {
    const box = (id: string, cluster?: string) => ({ id, width: 60, height: 40, ...(cluster ? { cluster } : {}) })
    const r = layout({
      direction: 'LR',
      nodes: [box('a1', 'A'), box('a2', 'A'), box('b1', 'B'), box('b2', 'B'), box('c')],
      clusters: [{ id: 'A', label: { width: 20, height: 16 } }, { id: 'B', label: { width: 20, height: 16 } }],
      edges: [{ id: 'e1', from: 'a1', to: 'b1' }, { id: 'e2', from: 'a2', to: 'b2' }, { id: 'e3', from: 'b1', to: 'c' }],
    })
    const x = (id: string) => r.nodes.get(id)!.x
    expect(x('a1')).toBe(x('a2'))
    expect(x('b1')).toBe(x('b2'))
    expect(x('a1')).toBeLessThan(x('b1'))
    expect(x('b1')).toBeLessThan(x('c'))
    expect(r.width).toBeGreaterThan(r.height)
  })
})

