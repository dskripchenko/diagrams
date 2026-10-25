# @dskripchenko/diagrams

[![CI](https://github.com/dskripchenko/diagrams/actions/workflows/ci.yml/badge.svg)](https://github.com/dskripchenko/diagrams/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@dskripchenko/diagrams.svg)](https://www.npmjs.com/package/@dskripchenko/diagrams)
[![license](https://img.shields.io/npm/l/@dskripchenko/diagrams.svg)](LICENSE)

Diagrams written in Mermaid syntax, rendered to SVG — with **no runtime
dependencies** and **no DOM**. A string goes in, a string of SVG comes out:
the same call works in a browser, in server-side rendering and in a Node
build script.

```ts
import { render } from '@dskripchenko/diagrams'

const { svg } = render(`flowchart LR
  A[Request] --> B{Valid?}
  B -->|yes| C[Render PDF]
  B -->|no| D[Reject]`)

element.innerHTML = svg
```

**Supported:** `flowchart` (with subgraphs and per-subgraph direction),
`sequenceDiagram`, `stateDiagram-v2`, `erDiagram`, `classDiagram`, C4
(`C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment`),
`pie`, `gantt`, `timeline`, `xychart-beta`, `mindmap`.

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

The syntax is a declared subset of Mermaid's. What is supported is listed
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
| Theming | [en](docs/en/theming.md) | [ru](docs/ru/theming.md) | [de](docs/de/theming.md) | [zh](docs/zh/theming.md) |

## Install

```bash
npm install @dskripchenko/diagrams
```

Node 20 or newer for server-side use; any current browser.

## License

[MIT](LICENSE). Security issues: see [SECURITY.md](SECURITY.md).
