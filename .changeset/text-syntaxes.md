---
'@dskripchenko/diagrams': minor
---

More text syntaxes, recognised from how a source starts or named with
`render(source, { syntax })`: Graphviz DOT and D2 (drawn as flowcharts),
DBML (as ER diagrams), Structurizr DSL (the first view, as C4) and Wardley
maps (a new renderer). `detectSyntax()` reports them; `parseDot`, `parseD2`,
`parseDbml`, `parseStructurizr` are exported. Flowcharts get a visible title
when the source has one (PlantUML, DOT), so PlantUML activity and element
diagrams now show theirs.
