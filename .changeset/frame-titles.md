---
'@dskripchenko/diagrams': patch
---

Edge labels and lines no longer cover a frame's title. A labelled edge entering a titled frame (subgraph, package, boundary) gets one more rank, so its label sits beside the frame instead of on its title; a label that still lands on a title is slid along its edge to a free spot. Frame titles get a wider halo where a diagram has them, so a line passing under a title no longer shows between its letters.
