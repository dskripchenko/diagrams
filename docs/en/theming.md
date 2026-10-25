# Theming

Every colour in every diagram is a CSS custom property with a default, and
the font family is one too. The SVG's own stylesheet reads them as
`var(--dg-…, default)`, so declarations anywhere above the SVG — on `:root`,
on a container, in a dark-mode media query — restyle it.

```css
.docs {
  --dg-node-fill: #ecfeff;
  --dg-node-stroke: #0891b2;
}
```

## Dark theme

```css
@media (prefers-color-scheme: dark) {
  :root {
    --dg-text: #e2e8f0;
    --dg-text-muted: #94a3b8;
    --dg-line: #94a3b8;
    --dg-node-fill: #1e1b4b;
    --dg-node-stroke: #818cf8;
    --dg-node-text: #e0e7ff;
    --dg-cluster-fill: #111827;
    --dg-cluster-stroke: #334155;
    --dg-cluster-text: #cbd5e1;
    --dg-edge-label-fill: #0f172a;   /* the page background */
    --dg-note-fill: #422006;
    --dg-note-stroke: #ca8a04;
    --dg-note-text: #fef9c3;
    --dg-actor-fill: #1e1b4b;
    --dg-actor-stroke: #818cf8;
    --dg-activation-fill: #312e81;
    --dg-block-stroke: #64748b;
    --dg-block-label-fill: #1e293b;
    --dg-grid: #1f2937;
    --dg-lifeline: #475569;
    --dg-state-start: #e2e8f0;
  }
}
```

## Variables

| Variable | Default | Used for |
|---|---|---|
| `--dg-font-family` | system UI stack | all text |
| `--dg-text` | `#1f2937` | general text |
| `--dg-text-muted` | `#6b7280` | secondary text: guards, axis labels |
| `--dg-line` | `#64748b` | edges, arrows, message lines |
| `--dg-node-fill` / `-stroke` / `-text` | `#eef2ff` / `#6366f1` / `#1e1b4b` | flowchart nodes, states |
| `--dg-cluster-fill` / `-stroke` / `-text` | `#f8fafc` / `#cbd5e1` / `#334155` | subgraphs, composite states |
| `--dg-edge-label-fill` | `#ffffff` | the box behind edge text — set it to the page background |
| `--dg-note-fill` / `-stroke` / `-text` | `#fef9c3` / `#ca8a04` / `#422006` | notes |
| `--dg-actor-fill` / `-stroke` | `#eef2ff` / `#6366f1` | sequence participants |
| `--dg-activation-fill` | `#e0e7ff` | activation bars |
| `--dg-lifeline` | `#94a3b8` | lifelines |
| `--dg-number-text` | `#ffffff` | autonumber digits |
| `--dg-block-stroke` / `--dg-block-label-fill` | `#94a3b8` / `#e2e8f0` | `loop`, `alt` … frames and their tabs |
| `--dg-rect-fill` | translucent grey | `rect` without a colour |
| `--dg-grid` | `#e5e7eb` | gantt grid |
| `--dg-task-fill` / `-stroke` | `#818cf8` / `#4f46e5` | gantt tasks |
| `--dg-task-done-fill` / `-stroke` | `#cbd5e1` / `#64748b` | `done` |
| `--dg-task-active-fill` | `#c7d2fe` | `active` |
| `--dg-task-crit-fill` / `-stroke` | `#f87171` / `#b91c1c` | `crit` |
| `--dg-task-text` / `--dg-task-text-dark` | `#ffffff` / `#1f2937` | text on dark / light bars |
| `--dg-exclude-fill` | translucent grey | excluded days |
| `--dg-section-fill-0` / `-1` | translucent | alternating section bands |
| `--dg-today` | `#ef4444` | today line |
| `--dg-state-start` | `#1f2937` | start and end states, fork bars |
| `--dg-pie-1` … `--dg-pie-12` | a 12-colour palette | pie slices |
| `--dg-pie-stroke` / `--dg-pie-text` | `#ffffff` / `#ffffff` | slice borders, percentages |
| `--dg-c4-person-fill` / `-stroke` / `-text` | `#08427b` / `#052e56` / `#ffffff` | C4 persons |
| `--dg-c4-system-fill` / `-stroke` / `-text` | `#1168bd` / `#0b4884` / `#ffffff` | C4 software systems |
| `--dg-c4-container-fill` / `-stroke` / `-text` | `#438dd5` / `#2e6295` / `#ffffff` | C4 containers |
| `--dg-c4-component-fill` / `-stroke` / `-text` | `#85bbf0` / `#5d82a8` / `#0b2540` | C4 components |
| `--dg-c4-external-fill` / `-stroke` / `-text` | `#7b7b7b` / `#5c5c5c` / `#ffffff` | external C4 elements (`_Ext`) |
| `--dg-c4-boundary-stroke` / `-text` | `#6b7280` / `#1f2937` | C4 boundaries (dashed frames); default to `--dg-text-muted` / `--dg-text` |
| `--dg-c4-node-fill` / `-stroke` / `-text` | translucent grey / `#6b7280` / `#1f2937` | C4 deployment nodes; stroke and text default to `--dg-text-muted` / `--dg-text` |

The list is also exported as `THEME_VARIABLES` (variable → default), for
tools that generate a theme.

## Per-diagram styles

Inside a diagram, `classDef`, `class`, `style` and `linkStyle` (flowchart,
state) override these for single elements; see
[flowchart styles](flowchart.md#styles-and-classes).

## Class names

Elements carry stable class names — `dg-node`, `dg-edge`, `dg-cluster`,
`dg-edge-label`, `dg-note`, and `dg-class-<name>` for each `classDef` class —
and nodes carry `data-id` with their id, for styling or scripting from
outside.
