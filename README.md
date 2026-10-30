# @dskripchenko/diagrams

[![CI](https://github.com/dskripchenko/diagrams/actions/workflows/ci.yml/badge.svg)](https://github.com/dskripchenko/diagrams/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@dskripchenko/diagrams.svg)](https://www.npmjs.com/package/@dskripchenko/diagrams)
[![license](https://img.shields.io/npm/l/@dskripchenko/diagrams.svg)](LICENSE)

Diagrams written as text — in **Mermaid**, **PlantUML**, **Graphviz DOT**,
**D2**, **DBML**, **Structurizr DSL** or the **Wardley map** DSL — rendered
to SVG, with **no runtime dependencies** and **no DOM**. A string goes in, a string of SVG comes out:
the same call works in a browser, in server-side rendering and in a Node
build script.

```ts
import { render } from '@dskripchenko/diagrams'

const { svg } = render(`flowchart LR
  A[Request] --> B{Valid?}
  B -->|yes| C[Render PDF]
  B -->|no| D[Reject]`)

element.innerHTML = svg

// PlantUML: recognised by its @startuml.
render(`@startuml
actor User
User -> API ++ : POST /orders
return 201
@enduml`)
```

**Supported:** `flowchart` (with subgraphs and per-subgraph direction),
`sequenceDiagram`, `stateDiagram-v2`, `erDiagram`, `classDiagram`, C4
(`C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment`),
`pie`, `gantt`, `timeline`, `xychart-beta`, `mindmap`, `journey`,
`quadrantChart`, `kanban`, `requirementDiagram`, `architecture-beta`,
`sankey-beta`, `gitGraph`, `block-beta`; PlantUML sequence,
use case, component, deployment, activity (with swimlanes), class, object,
state, ER, C4 (C4-PlantUML) and timing diagrams, mind maps, WBS, Gantt
charts and Salt wireframes; Graphviz DOT and D2 (drawn as flowcharts), DBML
(as ER diagrams), Structurizr DSL (as C4) and Wardley maps. The syntax is
recognised from how a source starts, or given with `render(source, {
syntax })`.

## Why another renderer

- **Zero dependencies.** Mermaid pulls in d3, dagre, DOMPurify and more —
  megabytes. This package is one module of about 100 KB gzipped before your
  bundler minifies it, layout engine included.
- **Safe by construction.** Every label and attribute is escaped by the one
  SVG builder that produces the output; HTML in labels is shown as text.
  Styles are parsed and limited to a fixed set of properties with validated
  values, links to `http(s)`, `mailto` and relative addresses. Nothing from
  the diagram text is ever executed.
- **Deterministic.** The same source and the same text measurer give the
  same SVG, byte for byte — diagrams can be snapshot-tested and cached.
- **Themeable with CSS.** Every colour is a CSS custom property
  (`--dg-*`) with a default; a dark theme is a dozen declarations.
- **Errors you can act on.** A source that cannot be read raises a
  `DiagramError` with the line, the column and, where there is one, a hint.

The syntax is a declared subset of Mermaid's and PlantUML's. What is supported is listed
per diagram type in the documentation; anything else is an error rather
than a silently wrong picture.

## Documentation

| | English | Русский | Deutsch | 中文 |
|---|---|---|---|---|
| Getting started | [en](docs/en/getting-started.md) | [ru](docs/ru/getting-started.md) | [de](docs/de/getting-started.md) | [zh](docs/zh/getting-started.md) |
| Flowchart | [en](docs/en/flowchart.md) | [ru](docs/ru/flowchart.md) | [de](docs/de/flowchart.md) | [zh](docs/zh/flowchart.md) |
| Sequence diagram | [en](docs/en/sequence.md) | [ru](docs/ru/sequence.md) | [de](docs/de/sequence.md) | [zh](docs/zh/sequence.md) |
| State diagram | [en](docs/en/state.md) | [ru](docs/ru/state.md) | [de](docs/de/state.md) | [zh](docs/zh/state.md) |
| Entity relationship diagram | [en](docs/en/er.md) | [ru](docs/ru/er.md) | [de](docs/de/er.md) | [zh](docs/zh/er.md) |
| Class diagram | [en](docs/en/class.md) | [ru](docs/ru/class.md) | [de](docs/de/class.md) | [zh](docs/zh/class.md) |
| Pie chart | [en](docs/en/pie.md) | [ru](docs/ru/pie.md) | [de](docs/de/pie.md) | [zh](docs/zh/pie.md) |
| Gantt chart | [en](docs/en/gantt.md) | [ru](docs/ru/gantt.md) | [de](docs/de/gantt.md) | [zh](docs/zh/gantt.md) |
| Timeline | [en](docs/en/timeline.md) | [ru](docs/ru/timeline.md) | [de](docs/de/timeline.md) | [zh](docs/zh/timeline.md) |
| XY chart | [en](docs/en/xychart.md) | [ru](docs/ru/xychart.md) | [de](docs/de/xychart.md) | [zh](docs/zh/xychart.md) |
| Mind map | [en](docs/en/mindmap.md) | [ru](docs/ru/mindmap.md) | [de](docs/de/mindmap.md) | [zh](docs/zh/mindmap.md) |
| Journey | [en](docs/en/journey.md) | [ru](docs/ru/journey.md) | [de](docs/de/journey.md) | [zh](docs/zh/journey.md) |
| Quadrant chart | [en](docs/en/quadrant.md) | [ru](docs/ru/quadrant.md) | [de](docs/de/quadrant.md) | [zh](docs/zh/quadrant.md) |
| Kanban board | [en](docs/en/kanban.md) | [ru](docs/ru/kanban.md) | [de](docs/de/kanban.md) | [zh](docs/zh/kanban.md) |
| Requirement diagram | [en](docs/en/requirement.md) | [ru](docs/ru/requirement.md) | [de](docs/de/requirement.md) | [zh](docs/zh/requirement.md) |
| Architecture diagram | [en](docs/en/architecture.md) | [ru](docs/ru/architecture.md) | [de](docs/de/architecture.md) | [zh](docs/zh/architecture.md) |
| Sankey diagram | [en](docs/en/sankey.md) | [ru](docs/ru/sankey.md) | [de](docs/de/sankey.md) | [zh](docs/zh/sankey.md) |
| Git graph | [en](docs/en/gitgraph.md) | [ru](docs/ru/gitgraph.md) | [de](docs/de/gitgraph.md) | [zh](docs/zh/gitgraph.md) |
| Block diagram | [en](docs/en/block.md) | [ru](docs/ru/block.md) | [de](docs/de/block.md) | [zh](docs/zh/block.md) |
| PlantUML | [en](docs/en/plantuml.md) | [ru](docs/ru/plantuml.md) | [de](docs/de/plantuml.md) | [zh](docs/zh/plantuml.md) |
| Graphviz DOT | [en](docs/en/dot.md) | [ru](docs/ru/dot.md) | [de](docs/de/dot.md) | [zh](docs/zh/dot.md) |
| D2 | [en](docs/en/d2.md) | [ru](docs/ru/d2.md) | [de](docs/de/d2.md) | [zh](docs/zh/d2.md) |
| DBML | [en](docs/en/dbml.md) | [ru](docs/ru/dbml.md) | [de](docs/de/dbml.md) | [zh](docs/zh/dbml.md) |
| Structurizr DSL | [en](docs/en/structurizr.md) | [ru](docs/ru/structurizr.md) | [de](docs/de/structurizr.md) | [zh](docs/zh/structurizr.md) |
| Wardley map | [en](docs/en/wardley.md) | [ru](docs/ru/wardley.md) | [de](docs/de/wardley.md) | [zh](docs/zh/wardley.md) |
| Theming | [en](docs/en/theming.md) | [ru](docs/ru/theming.md) | [de](docs/de/theming.md) | [zh](docs/zh/theming.md) |

## Install

```bash
npm install @dskripchenko/diagrams
```

Node 20 or newer for server-side use; any current browser.

## License

[MIT](LICENSE). Security issues: see [SECURITY.md](SECURITY.md).
