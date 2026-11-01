import { describe, expect, it } from 'vitest'
import { layoutCommitGraph, renderCommitGraph, type HistoryCommit } from '../src'

const c = (id: string, ...parents: string[]): HistoryCommit => ({ id, parents })
const lanes = (commits: HistoryCommit[]) => layoutCommitGraph(commits).rows.map((r) => `${r.id}:${r.lane}`)

describe('commit graph layout', () => {
  it('a straight history is one lane', () => {
    const g = layoutCommitGraph([c('c', 'b'), c('b', 'a'), c('a')])
    expect(g.rows.map((r) => r.lane)).toEqual([0, 0, 0])
    expect(g.lanes).toBe(1)
    expect(g.segments.filter((s) => s.from !== s.to)).toEqual([])
    // The first row has nothing above it; the last nothing below.
    expect(g.segments.filter((s) => s.row === 0).map((s) => s.kind)).toEqual(['out'])
    expect(g.segments.filter((s) => s.row === 2).map((s) => s.kind)).toEqual(['in'])
  })

  it('a branch merged back: it runs beside main and bends in at the commit they share', () => {
    //  m  merge of f into main
    //  |\
    //  | f
    //  b |
    //  |/
    //  a
    const g = layoutCommitGraph([c('m', 'b', 'f'), c('f', 'a'), c('b', 'a'), c('a')])
    expect(lanes([c('m', 'b', 'f'), c('f', 'a'), c('b', 'a'), c('a')])).toEqual(['m:0', 'f:1', 'b:0', 'a:0'])
    expect(g.rows[0]!.merge).toBe(true)
    expect(g.lanes).toBe(2)
    expect(g.segments.filter((s) => s.row === 0 && s.kind === 'out').map((s) => [s.from, s.to])).toEqual([[0, 0], [0, 1]])
    // At a: both lanes end in it.
    expect(g.segments.filter((s) => s.row === 3 && s.kind === 'in').map((s) => [s.from, s.to])).toEqual([[0, 0], [1, 0]])
    // The branch keeps its colour on the way in.
    const f = g.segments.filter((s) => s.from === 1 || s.to === 1)
    expect(new Set(f.map((s) => s.color)).size).toBe(1)
    expect(f[0]!.color).not.toBe(g.rows[0]!.color)
  })

  it('two tips (branches not merged) and a lane freed and reused', () => {
    const order = [c('x', 'a'), c('y', 'b'), c('b', 'a'), c('a'), c('z')]
    expect(lanes(order)).toEqual(['x:0', 'y:1', 'b:1', 'a:0', 'z:0'])
    expect(layoutCommitGraph(order).lanes).toBe(2)
  })

  it('a parent not in the list runs to the bottom; duplicates are ignored', () => {
    const g = layoutCommitGraph([c('b', 'a'), c('b', 'a'), c('d', 'gone')])
    expect(g.rows.map((r) => r.id)).toEqual(['b', 'd'])
    // b waits for a (never listed): its lane runs past d to the end.
    expect(g.segments.filter((s) => s.row === 1).map((s) => `${s.kind}:${s.from}>${s.to}`)).toEqual(['through:0>0', 'out:1>1'])
  })

  it('an octopus merge', () => {
    const g = layoutCommitGraph([c('m', 'a', 'b', 'd'), c('d', 'a'), c('b', 'a'), c('a')])
    expect(g.rows.map((r) => r.lane)).toEqual([0, 2, 1, 0])
    expect(g.lanes).toBe(3)
  })
})

describe('commit graph SVG', () => {
  it('rows line up with the host list; merges are rings; head is marked', () => {
    const { svg, width, height, laneX, graph } = renderCommitGraph([c('m', 'b', 'f'), c('f', 'a'), c('b', 'a'), c('a')], { rowHeight: 30, laneWidth: 16, head: 'm', id: 'g1' })
    expect(height).toBe(120)
    expect(width).toBe(Math.ceil(laneX(graph.lanes - 1) + laneX(0)))
    expect(svg).toMatch(/^<svg[^>]* id="g1"/)
    expect(svg).toContain('<title id="g1-title">Commit graph</title>')
    const dots = [...svg.matchAll(/<circle class="(dg-commit-[^"]+)" cx="([\d.]+)" cy="([\d.]+)"[^>]*data-id="(\w)"/g)].map((m) => [m[1], m[4], Number(m[2]), Number(m[3])])
    expect(dots).toEqual([
      ['dg-commit-dot dg-commit-merge', 'm', laneX(0), 15],
      ['dg-commit-dot', 'f', laneX(1), 45],
      ['dg-commit-dot', 'b', laneX(0), 75],
      ['dg-commit-dot', 'a', laneX(0), 105],
    ])
    expect(svg).toContain('class="dg-commit-head"')
    expect(svg).toMatchSnapshot()
  })

  it('nothing to draw: an empty column', () => {
    const { svg, height } = renderCommitGraph([])
    expect(height).toBe(0)
    expect(svg).toContain('dg-commit-graph')
  })
})
