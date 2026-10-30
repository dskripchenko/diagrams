# Structurizr DSL

```structurizr
workspace {
  model {
    user = person "Kunde"
    shop = softwareSystem "Shop" {
      web = container "Web-App" "Storefront" "React"
      db = container "Bestellungen" "" "PostgreSQL" "Database"
    }
    psp = softwareSystem "Zahlungen" "" "External"
    user -> web "Nutzt" "HTTPS"
    web -> db "Liest und schreibt"
    web -> psp "Belastet"
  }
  views {
    container shop {
      include *
      autolayout lr
    }
  }
}
```

Eine Quelle, die mit `workspace` beginnt, ist Structurizr DSL: ein Modell
der Architektur und Sichten darauf. Die erste Sicht wird als
[C4-Diagramm](c4.md) gezeichnet; ohne Sichten die Landschaft aus Personen
und Softwaresystemen.

| Syntax | |
|---|---|
| `id = person "Name" "Beschreibung" "Tags"` | eine Person (`id =` ist optional) |
| `id = softwareSystem "Name" "Beschreibung" "Tags" { … }` | ein Softwaresystem mit seinen Containern |
| `id = container "Name" "Beschreibung" "Technologie" "Tags" { … }` | ein Container mit seinen Komponenten |
| `id = component "Name" "Beschreibung" "Technologie" "Tags"` | eine Komponente |
| `tags "…"`, `description "…"`, `technology "…"` in einem Element | mehr dazu |
| `a -> b "Beschreibung" "Technologie"`, `-> b` in einem Element | Beziehungen |
| `group "Name" { … }` | gelesen; seine Elemente gehören zum umgebenden Bereich |
| `systemLandscape`, `systemContext x`, `container x`, `component x` in `views` | die gezeichnete Sicht (die erste); `autolayout lr` ordnet von links nach rechts |
| `element "Tag" { shape Cylinder }` in `styles` | die Form eines Tags: `Cylinder`, `Pipe`, `Person` |

**Was eine Sicht zeigt.** Kontext: Personen und Softwaresysteme. Container:
die Container des Systems in seiner Grenze, mit Personen und Systemen
darum. Komponenten: die Komponenten des Containers in seiner Grenze, mit
Containern, Personen und Systemen darum. Beziehungen zwischen Elementen,
die die Sicht nicht zeigt, verbinden deren nächste gezeigte Eltern (der
Aufruf eines Containers an ein anderes System wird zu dem des Systems),
einmal.

**Tags.** `External` (oder `location External`) zeichnet ein externes
Element; `Database` einen Zylinder, `Queue` ein Rohr. Deployment- und
dynamische Sichten, `!docs`, `!adrs`, `!include` und Skripte werden nicht
gelesen.
