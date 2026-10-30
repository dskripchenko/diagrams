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

Supported: **sequence**, **use case**, **component**, **deployment**,
**activity**, **class**, **object**, **state**, **ER** (Information
Engineering), **C4** (C4-PlantUML), **timing** diagrams and **Salt**
wireframes in `@startuml`; **mind maps** (`@startmindmap`), **work
breakdown structures** (`@startwbs`), **Gantt charts** (`@startgantt`) and
**Salt** (`@startsalt`). Other `@start…` frames (JSON, YAML, …) raise an
error saying so. `detect()` reports the model a diagram is drawn with:
`sequence`, `flowchart` (use case, component, deployment, activity), `class`
(class, object), `state`, `er`, `c4`, `mindmap` (mind map, WBS), `gantt`,
`timing`, `salt`.

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
| `|Lane|`, `|#color|Lane|` | swimlanes: the actions after it, until the next lane, are framed under the lane's name |

Swimlanes are drawn as labelled frames around their actions, not as
full-height columns. Not supported: the old syntax with `(*)`.

## Class and object diagrams

```
@startuml
package shop {
  abstract class Shape {
    {abstract} +area() : double
    -name : String
  }
  class Circle extends Shape
  interface Drawable
}
Circle ..|> Drawable
Shape "1" *-- "many" Point : vertices
@enduml
```

| Syntax | |
|---|---|
| `class`, `abstract class`, `abstract`, `interface`, `enum`, `annotation`, `entity`, `struct`, `record`, `exception`, `protocol`, `metaclass` | a class; all but `class` are shown as its stereotype |
| `class "Long name" as L`, `class Box<T>`, `<<stereotype>>`, `#color` | shown name, generics, stereotypes; colours are accepted |
| `class B extends A implements I, J` | inheritance and realisation |
| `class A {` … `}` | members: `+field : Type`, `-method(arg : T) : R`, `{static}`, `{abstract}`, `{field}`, `{method}`; separators `--`, `..`, `==`, `__`; enum values one per line |
| `A : +member` | a member declared outside the class |
| `A <\|-- B`, `*--`, `o--`, `-->`, `..>`, `..\|>`, `--`, `..` | relationships; direction words (`-up->`) and styles are accepted |
| `A "1" *-- "many" B : label >` | multiplicities and a label (a reading arrow at its end is dropped) |
| `package P {` … `}`, `namespace P {` … `}` | a frame around its classes; nested packages are named by their path (`app.core`) |
| `note right of A : text`, `note "text" as N` with `N .. A`, `note "text"` | notes on a class, tied, or free |
| `object o`, `o : field = value`, `object o { … }`, `map M { key => value }` | object diagrams: objects and maps drawn as boxes with their values |
| `hide empty members`, `hide circle`, `show …`, `remove …` | accepted and ignored |

## State diagrams

```
@startuml
[*] --> Idle
state Working {
  [*] --> Busy
  --
  [*] --> Logging
}
state Check <<choice>>
Idle --> Working : start
Working --> Check
Check --> [*]
@enduml
```

| Syntax | |
|---|---|
| `[*] --> A`, `A --> [*]` | start and end |
| `A --> B : event`, `A -> B`, `A -right-> B`, `A -[#red]-> B`, `B <-- A` | transitions; any arrow |
| `state A`, `state "Long name" as A`, `state A : text`, `A : text` | states, shown names, descriptions |
| `state A {` … `}` | a composite state, nested to any depth |
| `--` or `||` inside a composite | concurrent regions |
| `state C <<choice>>`, `<<fork>>`, `<<join>>` | pseudo states |
| `note left of A : text`, `note right of A` … `end note` | notes (`top` and `bottom` go left and right) |
| `[H]`, `[H*]` | drawn as a state named H |
| `state A #pink`, `hide empty description` | accepted |

## ER diagrams

```
@startuml
entity Customer {
  * id : int <<PK>>
  --
  name : text
}
entity "Order" as O {
  * id : int <<PK>>
  customer_id : int <<FK>>
}
Customer ||--o{ O : places
@enduml
```

| Syntax | |
|---|---|
| `entity Name { … }`, `entity "Long" as N { … }` | an entity |
| `[*] name : type <<PK>>` | an attribute; `<<PK>>`, `<<FK>>`, `<<UK>>` are keys, other stereotypes the comment; `*` (mandatory) is accepted |
| `--`, `..`, `==`, `__` | separators, skipped |
| `A \|\|--o{ B : label` | a relationship with crow's foot ends: `\|\|` one, `\|o`/`o\|` zero or one, `}\|`/`\|{` one or more, `}o`/`o{` zero or more; `..` dashed |

A diagram is ER when it has crow's foot links or entities with bodies and
no class keywords.

## C4 (C4-PlantUML)

```
@startuml
!include <C4/C4_Container>
Person(user, "Customer")
System_Boundary(shop, "Shop") {
  Container(web, "Web app", "React")
  ContainerDb(db, "Orders", "PostgreSQL")
}
Rel(user, web, "Uses", "HTTPS")
Rel(web, db, "Reads/writes")
SHOW_LEGEND()
@enduml
```

The macros are those of [C4](c4.md) — elements, boundaries, `Rel`,
`BiRel`, `Rel_U/D/L/R`, `Rel_Back`, `UpdateElementStyle`, layout macros.

| Syntax | |
|---|---|
| `!include <C4/C4_Container>`, `!include https://…/C4_Container.puml` | the level: `C4_Context`, `C4_Container`, `C4_Component`, `C4_Dynamic`, `C4_Deployment`; the deepest one included counts. The library itself is not fetched. Any other `!include` is still an error |
| `SHOW_LEGEND()`, `LAYOUT_WITH_LEGEND()`, `LAYOUT_AS_SKETCH()`, `HIDE_*`, `Add…Tag`, `Update…Tag`, `Lay_*`, `SetPropertyHeader`, `AddProperty` | skipped: presentation only |
| `Rel_Neighbor`, `BiRel_Neighbor`, `Rel_Back_Neighbor` | plain relations |

A diagram with C4 macros (`Person(…)`, `Container(…)`, `Rel(…)`…) is C4
even without the include; its level is then Context.

## Mind maps and work breakdown structures

```
@startmindmap
* Release
** Backend
***_ boxless note
** Frontend
***:a node over
two lines;
left side
** Docs
@endmindmap
```

| Syntax | |
|---|---|
| `*`, `**`, … (or `+` / `-`, OrgMode; or `#`) | a node at that depth; one root |
| `*_ text` | a node without a box |
| `*[#Orange] text` | a colour, accepted |
| `**:first line` … `last line;` | a node over several lines |
| `left side`, `right side` | accepted; the layout places branches itself |

`@startwbs` reads the same tree and draws it as a mind map.

## Gantt charts

```
@startgantt
Project starts 2026-03-02
saturday are closed
sunday are closed
-- Design --
[Discovery] lasts 5 days
[Wireframes] starts at [Discovery]'s end and lasts 4 days
-- Build --
[API] as [A] lasts 2 weeks
[A] starts at [Wireframes]'s end
[A] is 40% completed
then [Frontend] lasts 8 days
[Release] happens at [Frontend]'s end
@endgantt
```

| Syntax | |
|---|---|
| `Project starts 2026-03-02` | the start of tasks with no start of their own |
| `[Task] lasts 5 days`, `requires 2 weeks` | the duration |
| `[Task] starts 2026-03-10`, `starts at [X]'s end`, `starts at [X]'s start` | the start |
| `[Task] ends 2026-03-20`, `ends at [X]'s start` | the end |
| `then [Task] …` | starts at the previous task's end |
| `[A] -> [B]` | B starts at A's end |
| `[Task] as [T]` | an alias |
| `[M] happens at [X]'s end`, `happens 2026-03-30` | a milestone |
| `[Task] is 40% completed`, `is completed` | in progress (with the percentage in its name) or done |
| `-- Section --` | a section |
| `saturday are closed`, `2026-03-09 is closed` | days that do not count |
| clauses joined with `and` | `[A] starts at [B]'s end and lasts 3 days` |
| colours, resources (`on {Alice}`), `printscale`, `language`, `today` | accepted |

Not supported: offsets (`starts 2 days after [X]'s end`) — an error says so.
Tasks are drawn in an order where each comes after those it depends on.

## Timing diagrams

```
@startuml
robust "Web browser" as WB
concise "User" as WU
clock "Clock" as C with period 50
WB has Idle,Waiting,Processing
@0
WU is Idle
WB is Idle
@100
WU is Waiting
WB is Processing
WU -> WB : request
@300
WB is Waiting
highlight 200 to 300 #Gold : network
@enduml
```

| Syntax | |
|---|---|
| `robust "Name" as N` | levels, stepped |
| `concise "Name" as N` | the state as a band with its name |
| `binary "Name" as N` | high or low |
| `clock "Name" as N with period 50 [pulse 15] [offset 10]` | a square wave |
| `N has A,B,C` | a robust signal's levels, top to bottom (otherwise the order they appear in) |
| `@100`, `@+50` | the moment the statements after it happen at |
| `N is State`, `N is "Long state"`, `N is {-}` | a change; `{-}` / `{hidden}` show nothing |
| `@N` then `0 is A`, `+100 is B` | the same, written per signal |
| `A -> B : text`, `A -> B@+20 : text` | a message at the moment, optionally arriving later |
| `highlight 200 to 300 #Gold : text` | a shaded span |

## Salt wireframes

```
@startsalt
{+
  Login    | "MyName   "
  Password | "****     "
  [X] Remember me | ^English^
  [Cancel] | [  OK   ]
}
@endsalt
```

A Salt diagram is `@startsalt … @endsalt`, or `@startuml` whose first line
is `salt`.

| Syntax | |
|---|---|
| `{ … }` | a grid: rows on lines, cells split by `\|`; blocks nest inside cells |
| `{+`, `{#`, `{!`, `{-` | an outer border; all lines; column lines; row lines |
| `[Button]` | a button |
| `"text field   "` | a text field; trailing spaces widen it |
| `[X] checked`, `[] unchecked` | check boxes |
| `(X) selected`, `() not selected` | radio buttons |
| `^drop-down^` | a drop-down list |
| text, `<b>bold</b>` | a label |
| `.` | an empty cell |
| `..`, `==`, `~~`, `--` on a row of their own | separators: dotted, double, dashed, solid |
| `{/ <b>Tab one \| Tab two }` | tabs; the bold one is selected; one tab per line makes them vertical |
| `{* File \| Edit \| View }` | a menu bar |
| `{T` with `+ root`, `++ child` | a tree |
| `{^"Title"` | a group box |
| `{S` | a scroll pane |
