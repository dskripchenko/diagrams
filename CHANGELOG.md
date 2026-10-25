# @dskripchenko/diagrams

## 1.1.0

### Minor Changes

- 8fdec9a: C4 diagrams: `C4Context`, `C4Container`, `C4Component`, `C4Dynamic` and `C4Deployment` in Mermaid's C4-PlantUML syntax — persons, systems, containers and components with their `Db`, `Queue` and `_Ext` variants, nested boundaries and deployment nodes, every `Rel` variant with `Rel_U/D/L/R` honoured as layout hints, `RelIndex` and automatic numbering in dynamic diagrams, `UpdateElementStyle`, `UpdateRelStyle` and `UpdateLayoutConfig`. Laid out like Mermaid — a grid per boundary honouring `c4ShapeInRow`/`c4BoundaryInRow` — with related elements placed side by side, orthogonal relations routed around shapes and frame titles, and labels kept clear of each other. Drawn in the classic C4 look, themeable through new `--dg-c4-*` variables with documented dark-theme values.
- 9836e73: Two new diagram types. `erDiagram`: entities drawn as tables (type, name, PK/FK/UK keys and comments in aligned columns), aliases, relationships with every crow's foot cardinality in symbols or words, identifying and non-identifying lines, labels, self relationships, direction and styles. `classDiagram`: classes with attributes and methods (visibility, static and abstract members, parameters, return types, generics), annotations, every UML relationship with heads on either end, cardinalities and labels, namespaces, notes, direction, styles and links. Two new theme variables, `--dg-row-fill` and `--dg-row-alt-fill`, colour table rows and class compartments.
- 5910a0a: Three new diagram types: `timeline` (periods, several events per period, sections coloured like Mermaid's), `xychart-beta` / `xychart` (bar and line series over a categorical or numeric x axis, vertical or horizontal, automatic "nice" value ranges and tick labels, a legend for titled series) and `mindmap` (an indented outline with every Mermaid node shape, markdown labels, drawn as a balanced left/right tree with a colour per branch).

## 1.0.2

### Patch Changes

- 3f970da: Sequence diagrams: a block's tab and guard texts are drawn over activation bars, which used to cut through a label such as "loop" sitting on an active lifeline.

## 1.0.1

### Patch Changes

- dd90fda: Under jsdom (test runners) the glyph-table measurer is used straight away instead of probing a canvas, which jsdom reports as "Not implemented".

## 1.0.0

### Major Changes

- 9eb0323: First release: flowchart (with subgraphs and per-subgraph direction), sequence, state, pie and gantt diagrams in Mermaid syntax, rendered to SVG with no runtime dependencies.
