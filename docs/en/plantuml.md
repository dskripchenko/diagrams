# PlantUML

A source that starts with `@startuml` is read as PlantUML; anything else as
Mermaid. `render(source, { syntax: 'plantuml' })` says it explicitly.

```
@startuml
actor User
participant "Web app" as Web
database DB
User -> Web ++ : open
Web -> DB : query
return rows
@enduml
```

PlantUML has no keyword per diagram type: the type is recognised from the
statements, as PlantUML does it. `:action;` lines, `start`, `if (…)` —
activity; `[component]`, `(use case)`, `node`, `package` and the other
element keywords — use case, component and deployment; participants and
messages — sequence. `detect()` reports `sequence`, or `flowchart` for the
others (that is the model they are drawn with).

Supported in this release: **sequence**, **use case**, **component**,
**deployment** and **activity** diagrams. Class, object, state, ER, C4,
mind map, Gantt, timing and Salt come in later releases; a source of those
raises an error saying so.

## Common to every diagram

| Syntax | |
|---|---|
| `' comment`, `/' block comment '/` | ignored |
| `title Text`, `title` … `end title` | the title |
| `left to right direction` | lay out left to right (use case, component, deployment) |
| `skinparam …`, `skinparam x { … }`, `<style>…</style>`, `!theme`, `!pragma`, `scale`, `header`, `footer`, `legend`, `caption` | accepted and ignored: colours and fonts come from the theme ([Theming](theming.md)) |
| `!include`, `!define`, `!procedure`, `!if` … | an error: the renderer reads one source, with no files and no variables |
| `\n` in a text | a line break |

## Sequence diagrams

| Syntax | |
|---|---|
| `participant`, `actor`, `boundary`, `control`, `entity`, `database`, `collections`, `queue` | a participant of that kind; a name used in a message becomes a `participant` |
| `participant "Long name" as L`, `participant L as "Long name"` | a shown name and an alias |
| `… <<stereotype>>`, `… #color`, `… order 10` | the stereotype is shown under the name; colour and order are accepted |
| `A -> B : text` | a message; `-->` dotted, `->>` open head, `->x` lost, `<-` reversed, `<->` both ends, `-[#red]>` coloured |
| `A -> B ++`, `--`, `**`, `!!` | activate the target, deactivate the source, create the target, destroy the target |
| `activate A`, `deactivate A`, `create A`, `destroy A` | as their names say |
| `return text` | a dotted message back to the caller of the newest activation, which ends |
| `note left of A : text`, `note right of A`, `note over A, B`, `note across`, `hnote`, `rnote` | notes; without `: text` the note runs to `end note`; `note left` alone is beside the last message |
| `ref over A, B : text` | drawn as a note over them |
| `alt`/`else`, `opt`, `loop`, `par`/`else`, `break`, `critical`, `group text` … `end` | blocks |
| `box "Title" #color` … `end box` | participants grouped under a background |
| `== Title ==` | a divider across the diagram |
| `...`, `... text ...` | a delay |
| `|||`, `||45||` | extra space |
| `autonumber [start [step]]`, `autonumber stop`, `autonumber resume` | message numbers (a format string is accepted, not drawn) |
| `hide footbox` | no participants repeated at the bottom |

Not supported: messages from or to the outside (`[->`, `->]`), `newpage`,
participant colours, `skinparam` styling.

## Use case, component and deployment diagrams

```
@startuml
actor Customer
package Shop {
  (Place order) as PO
  [Orders] <<service>>
}
database DB
Customer --> PO
PO ..> [Orders] : uses
[Orders] --> DB
@enduml
```

| Syntax | |
|---|---|
| `actor`, `usecase`, `component`, `interface`, `node`, `cloud`, `database`, `queue`, `storage`, `artifact`, `card`, `file`, `folder`, `frame`, `package`, `rectangle`, `agent`, `stack`, `hexagon`, `person`, `label`, `circle`, `collections`, `boundary`, `control`, `entity` | an element of that shape |
| `:Actor:`, `(Use case)`, `[Component]`, `() Interface` | the shorthands, in declarations and in links |
| `X as Alias`, `"Long name" as A`, `<<stereotype>>`, `#color` | alias, stereotype (shown under the name), fill colour |
| `node N [first line` … `]` | a description of several lines |
| `package P {` … `}` (any element keyword with `{`) | a container, nested to any depth; links may point at it |
| `A --> B : label` | a link: `--` solid, `..` dotted, `==` thick, `~~` dotted |
| heads `>`, `\|>`, `*`, `o`, `+`, `>>` at either end | arrow, inheritance triangle, composition, aggregation, circle, open arrow |
| `-[#red]->`, `-[dashed]->`, `-[bold]->`, `-[hidden]->` | colour and line style; a hidden link only steers the layout |
| `-up->`, `-down->`, `-left->`, `-right->` (`-u->` …) | `up` puts the target above; the others are accepted |
| `note right of X : text`, `note "text" as N` with `N .. X`, multi-line with `end note` | notes |
| `together { … }` | accepted; its elements belong to the enclosing container |

A link with one dash (`->`) is laid out like one with two (`-->`): elements
are not yet placed side by side on purpose.

## Activity diagrams

```
@startuml
start
:Receive order;
if (In stock?) then (yes)
  :Ship;
else (no)
  :Back-order;
endif
stop
@enduml
```

| Syntax | |
|---|---|
| `start`, `stop`, `end` | start and end points |
| `kill`, `detach` | the flow ends here, with no end point |
| `:text;` over one or more lines; `#pink:text;` | an action; any SDL ending (`;`, `|`, `<`, `>`, `/`, `]`, `}`) is accepted |
| `if (c) then (yes)` … `elseif (d) then (yes)` … `else (no)` … `endif` | conditions; `is (…)` is accepted too |
| `while (c) is (yes)` … `endwhile (no)` | a loop with the test first |
| `repeat` … `repeat while (c) is (yes) not (no)` | a loop with the test last |
| `fork` … `fork again` … `end fork` / `end merge` | parallel branches, joined by a bar or not |
| `split` … `split again` … `end split` | branches without bars |
| `partition Name {` … `}`, `group Name` … `end group` | a frame around actions |
| `-> text;`, `-[#red,dashed]->` | the label and style of the next arrow |
| `note left: text`, `note right` … `end note` | a note beside the last action |

Not supported yet: swimlanes (`|Lane|`) — use `partition` for now — and the
old syntax with `(*)`.
