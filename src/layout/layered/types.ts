/**
 * Input and output of the layered layout.
 *
 * The layout knows nothing about shapes or text: nodes are boxes, edges are
 * pairs of ids, clusters are named groups. Diagrams translate to this and
 * back.
 */
import type { Box, Point } from '../../core/geometry'

export type Direction = 'TB' | 'BT' | 'LR' | 'RL'

export interface LayoutNode {
  id: string
  width: number
  height: number
  /** The cluster the node sits in directly, if any. */
  cluster?: string
}

export interface LayoutEdge {
  id: string
  /** A node id or a cluster id. */
  from: string
  to: string
  /** Minimum number of ranks the edge spans; Mermaid's `--->` is 2. */
  minlen?: number
  /** How strongly the edge wants to be short and straight. */
  weight?: number
  label?: { width: number; height: number }
}

export interface LayoutCluster {
  id: string
  parent?: string
  /** Direction inside the cluster; honoured when no edge crosses its frame. */
  direction?: Direction
  /** Room for the title, inside the top of the frame. */
  label?: { width: number; height: number }
}

export interface LayoutInput {
  direction?: Direction
  nodes: readonly LayoutNode[]
  edges: readonly LayoutEdge[]
  clusters?: readonly LayoutCluster[]
  /** Space between neighbouring nodes in a rank. */
  nodeSep?: number
  /** Space between ranks. */
  rankSep?: number
  /** Space between edge segments running side by side. */
  edgeSep?: number
  /** Padding inside a cluster frame. */
  clusterPadding?: number
}

export interface EdgeRoute {
  /**
   * The bends of the edge, from source to target, not including the ends:
   * the diagram clips the ends against the actual shapes.
   */
  points: Point[]
  /** The edge's ends when the layout fixed them (edges cut at a cluster frame). */
  start?: Point
  end?: Point
  /** Centre of the label, when the edge has one. */
  label?: Point
  /** The edge connects a node to itself; `points` is the whole loop. */
  selfLoop?: boolean
}

export interface LayoutResult {
  width: number
  height: number
  nodes: Map<string, Box>
  clusters: Map<string, Box>
  edges: Map<string, EdgeRoute>
}
