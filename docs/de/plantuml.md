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

In diesem Release unterstützt: **Sequenz-**, **Use-Case-**, **Komponenten-**,
**Verteilungs-** und **Aktivitätsdiagramme**. Klasse, Objekt, Zustand, ER,
C4, Mindmap, Gantt, Timing und Salt folgen in späteren Releases; eine
solche Quelle löst einen erklärenden Fehler aus.

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

Noch nicht unterstützt: Swimlanes (`|Bahn|`) — vorerst `partition`
verwenden — und die alte Syntax mit `(*)`.
