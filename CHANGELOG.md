# @dskripchenko/diagrams

## 1.2.0

### Minor Changes

- 285236a: Eight more Mermaid diagram types: `journey` (user journeys), `quadrantChart`,
  `kanban`, `requirementDiagram` (drawn with the class renderer),
  `architecture-beta` (drawn with the flowchart layout), `sankey-beta`,
  `gitGraph` (LR, TB, BT; merges, cherry-picks, tags) and `block-beta`
  (grids with spans, spaces and nested blocks). Docs for each in four
  languages.
- 01f718a: PlantUML syntax: a source starting with `@startuml` is read as PlantUML —
  sequence, use case, component, deployment and activity diagrams (`render`,
  `parse`, `detect`; `detectSyntax`, the `syntax` option, `parsePlantUml`).
  Sequence diagrams gain icon participants (boundary, control, entity,
  database, collections, queue — also in Mermaid as `participant A@{ "type":
"database" }`), dividers, delays, extra space, labelled groups and `hide
footbox`; flowcharts gain UML and infrastructure shapes, framed containers
  and UML line ends. Mermaid diagrams render byte for byte as before.
- 3f14a10: PlantUML C4 (C4-PlantUML: the `!include` of the C4 library sets the level,
  presentation macros are skipped), mind maps and WBS, Gantt charts, timing
  diagrams (robust, concise, binary, clock; messages, highlights) and Salt
  wireframes (grids with borders, buttons, fields, check boxes, radio
  buttons, drop-downs, tabs, menus, trees, group boxes, scroll panes,
  separators). Timing and Salt are new diagram types with renderers of their
  own; `detect()` reports `c4`, `mindmap`, `gantt`, `timing` and `salt`.
- b321759: PlantUML class, object, state and ER (Information Engineering) diagrams,
  and swimlanes in activity diagrams. Class and state diagrams go through the
  Mermaid parsers of those diagrams, with errors pointing at the PlantUML
  line; `detect()` reports `class`, `state` and `er` for them.

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
