# Gestaltung

Jede Farbe in jedem Diagramm ist eine CSS Custom Property mit Standardwert,
ebenso die Schriftfamilie. Das eigene Stylesheet des SVG liest sie als
`var(--dg-…, default)`, sodass Deklarationen irgendwo oberhalb des SVG — auf
`:root`, auf einem Container, in einer Media Query für den Dunkelmodus — sein
Aussehen ändern.

```css
.docs {
  --dg-node-fill: #ecfeff;
  --dg-node-stroke: #0891b2;
}
```

## Dunkles Theme

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

## Variablen

| Variable | Standard | Verwendet für |
|---|---|---|
| `--dg-font-family` | System-UI-Font-Stack | allen Text |
| `--dg-text` | `#1f2937` | allgemeinen Text |
| `--dg-text-muted` | `#6b7280` | sekundären Text: Bedingungen, Achsenbeschriftungen |
| `--dg-line` | `#64748b` | Kanten, Pfeile, Nachrichtenlinien |
| `--dg-node-fill` / `-stroke` / `-text` | `#eef2ff` / `#6366f1` / `#1e1b4b` | Flussdiagramm-Knoten, Zustände |
| `--dg-cluster-fill` / `-stroke` / `-text` | `#f8fafc` / `#cbd5e1` / `#334155` | Subgraphen, zusammengesetzte Zustände |
| `--dg-edge-label-fill` | `#ffffff` | den Kasten hinter Kantentext — auf den Seitenhintergrund setzen |
| `--dg-note-fill` / `-stroke` / `-text` | `#fef9c3` / `#ca8a04` / `#422006` | Notizen |
| `--dg-actor-fill` / `-stroke` | `#eef2ff` / `#6366f1` | Teilnehmer im Sequenzdiagramm |
| `--dg-activation-fill` | `#e0e7ff` | Aktivierungsbalken |
| `--dg-lifeline` | `#94a3b8` | Lebenslinien |
| `--dg-number-text` | `#ffffff` | `autonumber`-Ziffern |
| `--dg-block-stroke` / `--dg-block-label-fill` | `#94a3b8` / `#e2e8f0` | Rahmen von `loop`, `alt` … und ihre Reiter |
| `--dg-rect-fill` | durchscheinendes Grau | `rect` ohne Farbe |
| `--dg-grid` | `#e5e7eb` | Gantt-Raster |
| `--dg-task-fill` / `-stroke` | `#818cf8` / `#4f46e5` | Gantt-Aufgaben |
| `--dg-task-done-fill` / `-stroke` | `#cbd5e1` / `#64748b` | `done` |
| `--dg-task-active-fill` | `#c7d2fe` | `active` |
| `--dg-task-crit-fill` / `-stroke` | `#f87171` / `#b91c1c` | `crit` |
| `--dg-task-text` / `--dg-task-text-dark` | `#ffffff` / `#1f2937` | Text auf dunklen / hellen Balken |
| `--dg-exclude-fill` | durchscheinendes Grau | ausgeschlossene Tage |
| `--dg-section-fill-0` / `-1` | durchscheinend | abwechselnde Abschnittsbänder |
| `--dg-today` | `#ef4444` | Heute-Linie |
| `--dg-state-start` | `#1f2937` | Start- und Endzustände, Gabelungsbalken |
| `--dg-pie-1` … `--dg-pie-12` | eine Palette aus 12 Farben | Kreissegmente, Abschnitte und Zeiträume der Zeitleiste, Reihen des XY-Diagramms, Äste der Mindmap |
| `--dg-pie-stroke` / `--dg-pie-text` | `#ffffff` / `#ffffff` | Segmentränder, Prozentwerte; Text auf gefüllten Zeitleisten-Köpfen |

Die Liste wird außerdem als `THEME_VARIABLES` (Variable → Standardwert)
exportiert, für Werkzeuge, die ein Theme erzeugen.

## Stile pro Diagramm

Innerhalb eines Diagramms überschreiben `classDef`, `class`, `style` und
`linkStyle` (Flussdiagramm, Zustandsdiagramm) diese Werte für einzelne
Elemente; siehe [Flussdiagramm-Stile](flowchart.md#stile-und-klassen).

## Klassennamen

Elemente tragen stabile Klassennamen — `dg-node`, `dg-edge`, `dg-cluster`,
`dg-edge-label`, `dg-note` und `dg-class-<name>` für jede `classDef`-Klasse —,
und Knoten tragen `data-id` mit ihrer ID, zum Gestalten oder Skripten von
außen.
