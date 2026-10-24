/**
 * The working graph of the layout pipeline.
 *
 * Everything is kept in insertion order — maps and arrays, never sets of
 * objects iterated in hash order — so the same input always produces the
 * same layout.
 */

export type DummyKind = 'edge' | 'label' | 'border-top' | 'border-bottom' | 'spine'

export interface WNode {
  id: string
  width: number
  height: number
  /** The innermost cluster containing the node, or null for the root. */
  cluster: string | null
  dummy?: DummyKind
  /** For edge and label dummies: the original edge. */
  edge?: string
  rank: number
  order: number
  x: number
  y: number
}

export interface WEdge {
  id: string
  v: string
  w: string
  minlen: number
  weight: number
  /** The original edge this one stands for (several after normalisation). */
  original: string
  /** Turned around to break a cycle; points are reversed back at the end. */
  reversed: boolean
  /** Border bookkeeping edges are not drawn. */
  structural?: boolean
}

export class Graph {
  readonly nodes = new Map<string, WNode>()
  readonly edges: WEdge[] = []
  private outMap = new Map<string, WEdge[]>()
  private inMap = new Map<string, WEdge[]>()

  addNode(node: Omit<WNode, 'rank' | 'order' | 'x' | 'y'>): WNode {
    const full: WNode = { ...node, rank: 0, order: 0, x: 0, y: 0 }
    this.nodes.set(full.id, full)
    this.outMap.set(full.id, [])
    this.inMap.set(full.id, [])
    return full
  }

  node(id: string): WNode {
    const n = this.nodes.get(id)
    if (!n) throw new Error(`Unknown node ${id}`)
    return n
  }

  addEdge(edge: WEdge): WEdge {
    this.edges.push(edge)
    this.outMap.get(edge.v)!.push(edge)
    this.inMap.get(edge.w)!.push(edge)
    return edge
  }

  removeEdge(edge: WEdge): void {
    const remove = (list: WEdge[]) => {
      const i = list.indexOf(edge)
      if (i >= 0) list.splice(i, 1)
    }
    remove(this.edges)
    remove(this.outMap.get(edge.v)!)
    remove(this.inMap.get(edge.w)!)
  }

  out(id: string): readonly WEdge[] {
    return this.outMap.get(id) ?? []
  }

  in(id: string): readonly WEdge[] {
    return this.inMap.get(id) ?? []
  }

  /** Re-indexes after edges were mutated in place (reversed). */
  reindex(): void {
    for (const id of this.nodes.keys()) {
      this.outMap.set(id, [])
      this.inMap.set(id, [])
    }
    for (const e of this.edges) {
      this.outMap.get(e.v)!.push(e)
      this.inMap.get(e.w)!.push(e)
    }
  }
}
