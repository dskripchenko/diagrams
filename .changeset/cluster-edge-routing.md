---
'@dskripchenko/diagrams': patch
---

Edges between clusters no longer loop around a frame. The points an edge passes through now belong to the cluster they are in — the source's while the edge is still within its ranks, the target's from the rank where its frame begins — instead of all to the common parent, which kept them outside both frames and often on their far side: an edge from one cluster into the next went round the source's frame, out over the top or under the bottom, and back. Labels of such edges stay next to them.
