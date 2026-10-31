---
'@dskripchenko/diagrams': patch
---

Left-to-right layouts (Mermaid `flowchart LR`, DOT `rankdir=LR`, PlantUML `left to right direction`…): clusters linked one to the next now follow each other along the direction instead of stacking into a column — an edge from one cluster into another gets a rank for the frames between them. Top-to-bottom layouts are unchanged. Clusters whose nodes genuinely share ranks still stand side by side, as in Graphviz.
