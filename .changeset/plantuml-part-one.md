---
'@dskripchenko/diagrams': minor
---

PlantUML syntax: a source starting with `@startuml` is read as PlantUML —
sequence, use case, component, deployment and activity diagrams (`render`,
`parse`, `detect`; `detectSyntax`, the `syntax` option, `parsePlantUml`).
Sequence diagrams gain icon participants (boundary, control, entity,
database, collections, queue — also in Mermaid as `participant A@{ "type":
"database" }`), dividers, delays, extra space, labelled groups and `hide
footbox`; flowcharts gain UML and infrastructure shapes, framed containers
and UML line ends. Mermaid diagrams render byte for byte as before.
