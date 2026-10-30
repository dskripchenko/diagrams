# DBML

```dbml
Table users {
  id integer [pk, increment]
  email varchar [unique, not null, note: 'Login']
}
Table posts {
  id integer [pk]
  user_id integer [ref: > users.id]
  status post_status
}
Enum post_status {
  draft
  published
}
```

DBML (Database Markup Language) beschreibt ein Datenbankschema; eine
Quelle, die mit `Table`, `Ref`, `Enum` oder `Project` beginnt, ist DBML.
Gezeichnet als [ER-Diagramm](er.md), von links nach rechts.

| Syntax | |
|---|---|
| `Table name [as alias] { … }` | eine Tabelle; Schemanamen (`public.users`) bleiben erhalten |
| `spalte typ [einstellungen]` | eine Spalte; `pk` / `primary key`, `unique`, `ref` geben die Schlüsselmarken, `not null`, `increment` und `note` den Kommentar |
| `ref: > other.column` | eine Referenz direkt von dieser Spalte |
| `Ref: a.x > b.y`, `Ref name: …`, `Ref { … }` | Referenzen: `>` viele zu einer, `<` eine zu vielen, `-` eins zu eins, `<>` viele zu vielen; zusammengesetzt `a.(x, y)` |
| `Enum name { wert [note: '…'] }` | eine Aufzählung, als Entität mit ihren Werten |
| `indexes { … }`, `Note`, `Project`, `TableGroup`, `TablePartial` | gelesen und übersprungen |
| `//`, `/* */` | Kommentare |

Eine Spalte, die auf eine andere verweist, wird als FK markiert; die Linie
zwischen den Tabellen trägt `spalte → spalte`.
