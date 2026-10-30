# Wardley map

```wardley
title Tea shop
anchor Business [0.95, 0.63]
component Cup of tea [0.79, 0.61]
component Tea [0.63, 0.81]
component Kettle [0.43, 0.35] (inertia)
component Power [0.1, 0.7] (outsource)
evolve Kettle 0.62
Business->Cup of tea
Cup of tea->Tea
Cup of tea->Kettle
Kettle->Power; limited by
note Standardising power [0.30, 0.49]
```

The DSL of OnlineWardleyMaps. A source with a `component` or `anchor` at
coordinates (or starting with `wardley`) is a Wardley map. Coordinates are
`[visibility, evolution]`: visibility from 0 (invisible, bottom) to 1
(visible, top), evolution from 0 (genesis, left) to 1 (commodity, right).

| Syntax | |
|---|---|
| `title …` | the title |
| `anchor Name [v, e]` | a user or need: bold text |
| `component Name [v, e]` | a component; `label [dx, dy]` moves its label |
| `… (inertia)` | a bar: resistance to change |
| `… (build)`, `(buy)`, `(outsource)` | how it is sourced: a halo |
| `market Name [v, e]`, `ecosystem Name [v, e]` | a market or an ecosystem |
| `A->B`, `A->B; label` | a dependency |
| `A+>B`, `A+<>B` | a flow of value: dashed |
| `evolve Name 0.62` | where it is going: a red ghost at the new evolution |
| `pipeline Name [start, end]` | a pipeline of choices under the component |
| `note text [v, e]` | a note |
| `annotation 1 [[v, e], …] text`, `annotations [v, e]` | numbered markers and their legend |
| `evolution A->B->C->D` | the names of the four stages |
| `style …`, `size …` | accepted |

Stages are drawn at the usual boundaries: 0.174, 0.4 and 0.7.
