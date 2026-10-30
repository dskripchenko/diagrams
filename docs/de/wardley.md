# Wardley-Map

```wardley
title Teeladen
anchor Geschäft [0.95, 0.63]
component Tasse Tee [0.79, 0.61]
component Tee [0.63, 0.81]
component Wasserkocher [0.43, 0.35] (inertia)
component Strom [0.1, 0.7] (outsource)
evolve Wasserkocher 0.62
Geschäft->Tasse Tee
Tasse Tee->Tee
Tasse Tee->Wasserkocher
Wasserkocher->Strom; begrenzt durch
note Standardisierter Strom [0.30, 0.49]
```

Die DSL von OnlineWardleyMaps. Eine Quelle mit einer `component` oder einem
`anchor` an Koordinaten (oder beginnend mit `wardley`) ist eine
Wardley-Map. Koordinaten sind `[Sichtbarkeit, Evolution]`: Sichtbarkeit
von 0 (unsichtbar, unten) bis 1 (sichtbar, oben), Evolution von 0 (Genesis,
links) bis 1 (Commodity, rechts).

| Syntax | |
|---|---|
| `title …` | der Titel |
| `anchor Name [v, e]` | ein Nutzer oder Bedarf: fetter Text |
| `component Name [v, e]` | eine Komponente; `label [dx, dy]` verschiebt ihre Beschriftung |
| `… (inertia)` | ein Balken: Trägheit, Widerstand gegen Wandel |
| `… (build)`, `(buy)`, `(outsource)` | wie sie beschafft wird: ein Hof |
| `market Name [v, e]`, `ecosystem Name [v, e]` | ein Markt oder ein Ökosystem |
| `A->B`, `A->B; Beschriftung` | eine Abhängigkeit |
| `A+>B`, `A+<>B` | ein Wertfluss: gestrichelt |
| `evolve Name 0.62` | wohin sie sich bewegt: ein roter Geist an der neuen Evolution |
| `pipeline Name [Start, Ende]` | eine Pipeline von Varianten unter der Komponente |
| `note Text [v, e]` | eine Notiz |
| `annotation 1 [[v, e], …] Text`, `annotations [v, e]` | nummerierte Marken und ihre Legende |
| `evolution A->B->C->D` | die Namen der vier Phasen |
| `style …`, `size …` | akzeptiert |

Die Phasen liegen an den üblichen Grenzen: 0.174, 0.4 und 0.7.
