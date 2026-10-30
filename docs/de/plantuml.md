# PlantUML

Eine Quelle, die mit `@startuml` beginnt, wird als PlantUML gelesen, jede
andere als Mermaid. Ausdrücklich: `render(source, { syntax: 'plantuml' })`.

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

PlantUML hat kein Schlüsselwort pro Diagrammtyp: Der Typ wird an den
Anweisungen erkannt, wie PlantUML es selbst tut. Zeilen `:Aktion;`, `start`,
`if (…)` — Aktivität; `[Komponente]`, `(Anwendungsfall)`, `node`, `package`
und die anderen Element-Schlüsselwörter — Use Case, Komponente und
Verteilung; Teilnehmer und Nachrichten — Sequenz. `detect()` meldet
`sequence`, für die anderen `flowchart` (das Modell, mit dem sie gezeichnet
werden).

Unterstützt in `@startuml`: **Sequenz-**, **Use-Case-**, **Komponenten-**,
**Verteilungs-**, **Aktivitäts-**, **Klassen-**, **Objekt-**, **Zustands-**,
**ER-** (Information-Engineering-Notation), **C4-** (C4-PlantUML) und
**Timing-Diagramme** sowie **Salt**-Wireframes; außerdem **Mindmaps**
(`@startmindmap`), **Projektstrukturpläne** (`@startwbs`), **Gantt**
(`@startgantt`) und **Salt** (`@startsalt`). Andere `@start…` (JSON, YAML,
…) lösen einen erklärenden Fehler aus. `detect()` meldet das Modell, mit dem
ein Diagramm gezeichnet wird: `sequence`, `flowchart` (Use Case,
Komponente, Verteilung, Aktivität), `class` (Klasse, Objekt), `state`,
`er`, `c4`, `mindmap` (Mindmap, WBS), `gantt`, `timing`, `salt`.

## Gemeinsam für alle Diagramme

| Syntax | |
|---|---|
| `' Kommentar`, `/' Blockkommentar '/` | ignoriert |
| `title Text`, `title` … `end title` | der Titel |
| `left to right direction` | Layout von links nach rechts (Use Case, Komponente, Verteilung) |
| `skinparam …`, `skinparam x { … }`, `<style>…</style>`, `!theme`, `!pragma`, `scale`, `header`, `footer`, `legend`, `caption` | akzeptiert und ignoriert: Farben und Schriften kommen aus dem Theme ([Theming](theming.md)) |
| `!include`, `!define`, `!procedure`, `!if` … | ein Fehler: Der Renderer liest eine Quelle, ohne Dateien und Variablen |
| `\n` in einem Text | ein Zeilenumbruch |

## Sequenzdiagramme

| Syntax | |
|---|---|
| `participant`, `actor`, `boundary`, `control`, `entity`, `database`, `collections`, `queue` | ein Teilnehmer dieser Art; ein in einer Nachricht verwendeter Name wird `participant` |
| `participant "Langer Name" as L`, `participant L as "Langer Name"` | angezeigter Name und Alias |
| `… <<Stereotyp>>`, `… #Farbe`, `… order 10` | der Stereotyp steht unter dem Namen; Farbe und Reihenfolge werden akzeptiert |
| `A -> B : Text` | eine Nachricht; `-->` gepunktet, `->>` offene Spitze, `->x` verloren, `<-` umgekehrt, `<->` beide Enden, `-[#red]>` farbig |
| `A -> B ++`, `--`, `**`, `!!` | Ziel aktivieren, Quelle deaktivieren, Ziel erzeugen, Ziel zerstören |
| `activate A`, `deactivate A`, `create A`, `destroy A` | wie benannt |
| `return Text` | eine gepunktete Nachricht zurück zum Aufrufer der jüngsten Aktivierung, die endet |
| `note left of A : Text`, `note right of A`, `note over A, B`, `note across`, `hnote`, `rnote` | Notizen; ohne `: Text` reicht die Notiz bis `end note`; `note left` allein steht neben der letzten Nachricht |
| `ref over A, B : Text` | als Notiz über ihnen gezeichnet |
| `alt`/`else`, `opt`, `loop`, `par`/`else`, `break`, `critical`, `group Text` … `end` | Blöcke |
| `box "Titel" #Farbe` … `end box` | Teilnehmer auf gemeinsamem Hintergrund |
| `== Titel ==` | ein Trenner über das ganze Diagramm |
| `...`, `... Text ...` | eine Verzögerung |
| `|||`, `||45||` | zusätzlicher Abstand |
| `autonumber [Start [Schritt]]`, `autonumber stop`, `autonumber resume` | Nachrichtennummern (ein Format wird akzeptiert, nicht gezeichnet) |
| `hide footbox` | keine Wiederholung der Teilnehmer unten |

Nicht unterstützt: Nachrichten von oder nach außen (`[->`, `->]`),
`newpage`, Teilnehmerfarben, Gestaltung per `skinparam`.

## Use-Case-, Komponenten- und Verteilungsdiagramme

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
| `actor`, `usecase`, `component`, `interface`, `node`, `cloud`, `database`, `queue`, `storage`, `artifact`, `card`, `file`, `folder`, `frame`, `package`, `rectangle`, `agent`, `stack`, `hexagon`, `person`, `label`, `circle`, `collections`, `boundary`, `control`, `entity` | ein Element dieser Form |
| `:Akteur:`, `(Anwendungsfall)`, `[Komponente]`, `() Schnittstelle` | die Kurzformen, in Deklarationen und in Verbindungen |
| `X as Alias`, `"Langer Name" as A`, `<<Stereotyp>>`, `#Farbe` | Alias, Stereotyp (unter dem Namen), Füllfarbe |
| `node N [erste Zeile` … `]` | eine mehrzeilige Beschreibung |
| `package P {` … `}` (jedes Element-Schlüsselwort mit `{`) | ein Container, beliebig verschachtelt; Verbindungen können auf ihn zeigen |
| `A --> B : Beschriftung` | eine Verbindung: `--` durchgezogen, `..` gepunktet, `==` dick, `~~` gepunktet |
| Enden `>`, `\|>`, `*`, `o`, `+`, `>>` an jeder Seite | Pfeil, Vererbungsdreieck, Komposition, Aggregation, Kreis, offener Pfeil |
| `-[#red]->`, `-[dashed]->`, `-[bold]->`, `-[hidden]->` | Farbe und Linienstil; eine verborgene Verbindung steuert nur das Layout |
| `-up->`, `-down->`, `-left->`, `-right->` (`-u->` …) | `up` setzt das Ziel darüber; die anderen werden akzeptiert |
| `note right of X : Text`, `note "Text" as N` mit `N .. X`, mehrzeilig mit `end note` | Notizen |
| `together { … }` | akzeptiert; seine Elemente gehören zum umgebenden Container |

Eine Verbindung mit einem Strich (`->`) wird wie eine mit zweien (`-->`)
angeordnet: Elemente werden noch nicht gezielt nebeneinander gesetzt.

## Aktivitätsdiagramme

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
| `start`, `stop`, `end` | Start- und Endpunkte |
| `kill`, `detach` | der Fluss endet hier, ohne Endpunkt |
| `:Text;` über eine oder mehrere Zeilen; `#pink:Text;` | eine Aktion; jedes SDL-Ende (`;`, `|`, `<`, `>`, `/`, `]`, `}`) wird akzeptiert |
| `if (c) then (yes)` … `elseif (d) then (yes)` … `else (no)` … `endif` | Bedingungen; `is (…)` wird ebenfalls akzeptiert |
| `while (c) is (yes)` … `endwhile (no)` | eine Schleife mit Prüfung am Anfang |
| `repeat` … `repeat while (c) is (yes) not (no)` | eine Schleife mit Prüfung am Ende |
| `fork` … `fork again` … `end fork` / `end merge` | parallele Zweige, mit oder ohne Balken zusammengeführt |
| `split` … `split again` … `end split` | Zweige ohne Balken |
| `partition Name {` … `}`, `group Name` … `end group` | ein Rahmen um Aktionen |
| `-> Text;`, `-[#red,dashed]->` | Beschriftung und Stil des nächsten Pfeils |
| `note left: Text`, `note right` … `end note` | eine Notiz neben der letzten Aktion |
| `|Bahn|`, `|#Farbe|Bahn|` | Swimlanes: die Aktionen danach, bis zur nächsten Bahn, werden unter dem Namen der Bahn eingerahmt |

Swimlanes werden als beschriftete Rahmen um ihre Aktionen gezeichnet, nicht
als Spalten über die ganze Höhe. Nicht unterstützt: die alte Syntax mit `(*)`.

## Klassen- und Objektdiagramme

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
| `class`, `abstract class`, `abstract`, `interface`, `enum`, `annotation`, `entity`, `struct`, `record`, `exception`, `protocol`, `metaclass` | eine Klasse; alle außer `class` werden als ihr Stereotyp gezeigt |
| `class "Langer Name" as L`, `class Box<T>`, `<<Stereotyp>>`, `#Farbe` | angezeigter Name, Generics, Stereotypen; Farben werden akzeptiert |
| `class B extends A implements I, J` | Vererbung und Realisierung |
| `class A {` … `}` | Member: `+feld : Typ`, `-methode(arg : T) : R`, `{static}`, `{abstract}`, `{field}`, `{method}`; Trenner `--`, `..`, `==`, `__`; Enum-Werte einer pro Zeile |
| `A : +member` | ein außerhalb der Klasse deklarierter Member |
| `A <\|-- B`, `*--`, `o--`, `-->`, `..>`, `..\|>`, `--`, `..` | Beziehungen; Richtungswörter (`-up->`) und Stile werden akzeptiert |
| `A "1" *-- "many" B : Beschriftung >` | Multiplizitäten und eine Beschriftung (ein Lesepfeil am Ende entfällt) |
| `package P {` … `}`, `namespace P {` … `}` | ein Rahmen um seine Klassen; verschachtelte Pakete heißen nach ihrem Pfad (`app.core`) |
| `note right of A : Text`, `note "Text" as N` mit `N .. A`, `note "Text"` | Notizen an einer Klasse, verbunden oder frei |
| `object o`, `o : feld = wert`, `object o { … }`, `map M { schlüssel => wert }` | Objektdiagramme: Objekte und Maps als Kästen mit ihren Werten |
| `hide empty members`, `hide circle`, `show …`, `remove …` | akzeptiert und ignoriert |

## Zustandsdiagramme

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
| `[*] --> A`, `A --> [*]` | Start und Ende |
| `A --> B : Ereignis`, `A -> B`, `A -right-> B`, `A -[#red]-> B`, `B <-- A` | Übergänge; jeder Pfeil |
| `state A`, `state "Langer Name" as A`, `state A : Text`, `A : Text` | Zustände, angezeigte Namen, Beschreibungen |
| `state A {` … `}` | ein zusammengesetzter Zustand, beliebig verschachtelt |
| `--` oder `||` innerhalb eines zusammengesetzten | nebenläufige Regionen |
| `state C <<choice>>`, `<<fork>>`, `<<join>>` | Pseudozustände |
| `note left of A : Text`, `note right of A` … `end note` | Notizen (`top` und `bottom` gehen nach links und rechts) |
| `[H]`, `[H*]` | als Zustand namens H gezeichnet |
| `state A #pink`, `hide empty description` | akzeptiert |

## ER-Diagramme

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
| `entity Name { … }`, `entity "Lang" as N { … }` | eine Entität |
| `[*] name : typ <<PK>>` | ein Attribut; `<<PK>>`, `<<FK>>`, `<<UK>>` sind Schlüssel, andere Stereotypen der Kommentar; `*` (Pflicht) wird akzeptiert |
| `--`, `..`, `==`, `__` | Trenner, übersprungen |
| `A \|\|--o{ B : Beschriftung` | eine Beziehung mit Krähenfuß-Enden: `\|\|` eins, `\|o`/`o\|` null oder eins, `}\|`/`\|{` eins oder mehr, `}o`/`o{` null oder mehr; `..` gestrichelt |

Ein Diagramm ist ER, wenn es Krähenfuß-Verbindungen oder Entitäten mit
Rumpf und keine Klassen-Schlüsselwörter hat.

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

Die Makros sind die von [C4](c4.md): Elemente, Grenzen, `Rel`, `BiRel`,
`Rel_U/D/L/R`, `Rel_Back`, `UpdateElementStyle`, Layout-Makros.

| Syntax | |
|---|---|
| `!include <C4/C4_Container>`, `!include https://…/C4_Container.puml` | die Ebene: `C4_Context`, `C4_Container`, `C4_Component`, `C4_Dynamic`, `C4_Deployment`; die tiefste eingebundene zählt. Die Bibliothek selbst wird nicht geladen. Jedes andere `!include` bleibt ein Fehler |
| `SHOW_LEGEND()`, `LAYOUT_WITH_LEGEND()`, `LAYOUT_AS_SKETCH()`, `HIDE_*`, `Add…Tag`, `Update…Tag`, `Lay_*`, `SetPropertyHeader`, `AddProperty` | übersprungen: nur Darstellung |
| `Rel_Neighbor`, `BiRel_Neighbor`, `Rel_Back_Neighbor` | normale Beziehungen |

Ein Diagramm mit C4-Makros (`Person(…)`, `Container(…)`, `Rel(…)`…) ist auch
ohne Include C4; die Ebene ist dann Context.

## Mindmaps und Projektstrukturpläne

```
@startmindmap
* Release
** Backend
***_ Knoten ohne Rahmen
** Frontend
***:ein Knoten über
zwei Zeilen;
left side
** Docs
@endmindmap
```

| Syntax | |
|---|---|
| `*`, `**`, … (oder `+` / `-` im OrgMode-Stil, oder `#`) | ein Knoten in dieser Tiefe; eine Wurzel |
| `*_ Text` | ein Knoten ohne Rahmen |
| `*[#Orange] Text` | eine Farbe, akzeptiert |
| `**:erste Zeile` … `letzte;` | ein mehrzeiliger Knoten |
| `left side`, `right side` | akzeptiert; das Layout setzt die Zweige selbst |

`@startwbs` liest denselben Baum und zeichnet ihn als Mindmap.

## Gantt-Diagramme

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
| `Project starts 2026-03-02` | der Start von Aufgaben ohne eigenen Start |
| `[Aufgabe] lasts 5 days`, `requires 2 weeks` | die Dauer |
| `[Aufgabe] starts 2026-03-10`, `starts at [X]'s end`, `starts at [X]'s start` | der Start |
| `[Aufgabe] ends 2026-03-20`, `ends at [X]'s start` | das Ende |
| `then [Aufgabe] …` | beginnt am Ende der vorigen Aufgabe |
| `[A] -> [B]` | B beginnt am Ende von A |
| `[Aufgabe] as [T]` | ein Alias |
| `[M] happens at [X]'s end`, `happens 2026-03-30` | ein Meilenstein |
| `[Aufgabe] is 40% completed`, `is completed` | in Arbeit (Prozent im Namen) oder erledigt |
| `-- Abschnitt --` | ein Abschnitt |
| `saturday are closed`, `2026-03-09 is closed` | Tage, die nicht zählen |
| mit `and` verbundene Klauseln | `[A] starts at [B]'s end and lasts 3 days` |
| Farben, Ressourcen (`on {Alice}`), `printscale`, `language`, `today` | akzeptiert |

Nicht unterstützt: Versätze (`starts 2 days after [X]'s end`) — ein Fehler
sagt es. Aufgaben stehen in einer Reihenfolge, in der jede nach denen kommt,
von denen sie abhängt.

## Timing-Diagramme

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
| `robust "Name" as N` | Ebenen, gestuft |
| `concise "Name" as N` | der Zustand als Band mit seinem Namen |
| `binary "Name" as N` | hoch oder niedrig |
| `clock "Name" as N with period 50 [pulse 15] [offset 10]` | eine Rechteckwelle |
| `N has A,B,C` | die Ebenen eines robust-Signals von oben nach unten (sonst in Reihenfolge des Auftretens) |
| `@100`, `@+50` | der Zeitpunkt der folgenden Anweisungen |
| `N is Zustand`, `N is "Langer Zustand"`, `N is {-}` | ein Wechsel; `{-}` / `{hidden}` zeigen nichts |
| `@N`, dann `0 is A`, `+100 is B` | dasselbe, pro Signal geschrieben |
| `A -> B : Text`, `A -> B@+20 : Text` | eine Nachricht zu diesem Zeitpunkt, optional später ankommend |
| `highlight 200 to 300 #Gold : Text` | ein schattierter Zeitraum |

## Salt-Wireframes

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

Ein Salt-Diagramm ist `@startsalt … @endsalt` oder ein `@startuml`, dessen
erste Zeile `salt` ist.

| Syntax | |
|---|---|
| `{ … }` | ein Raster: Zeilen pro Zeile, Zellen durch `\|` getrennt; Blöcke verschachteln sich in Zellen |
| `{+`, `{#`, `{!`, `{-` | äußerer Rahmen; alle Linien; Spaltenlinien; Zeilenlinien |
| `[Schaltfläche]` | eine Schaltfläche |
| `"Textfeld   "` | ein Textfeld; Leerzeichen am Ende machen es breiter |
| `[X] markiert`, `[] nicht markiert` | Kontrollkästchen |
| `(X) gewählt`, `() nicht gewählt` | Optionsfelder |
| `^Auswahl^` | eine Auswahlliste |
| Text, `<b>fett</b>` | eine Beschriftung |
| `.` | eine leere Zelle |
| `..`, `==`, `~~`, `--` in eigener Zeile | Trenner: gepunktet, doppelt, gestrichelt, durchgezogen |
| `{/ <b>Reiter 1 \| Reiter 2 }` | Reiter; der fette ist gewählt; einer pro Zeile macht sie vertikal |
| `{* Datei \| Bearbeiten \| Ansicht }` | eine Menüleiste |
| `{T` mit `+ Wurzel`, `++ Kind` | ein Baum |
| `{^"Titel"` | ein Gruppenrahmen |
| `{S` | ein Bereich mit Bildlaufleiste |
