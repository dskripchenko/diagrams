# DBML

```dbml
Table users {
  id integer [pk, increment]
  email varchar [unique, not null, note: 'login']
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

DBML (Database Markup Language) describes a database schema; a source
starting with `Table`, `Ref`, `Enum` or `Project` is DBML. It is drawn as an
[entity relationship diagram](er.md), left to right.

| Syntax | |
|---|---|
| `Table name [as alias] { … }` | a table; schema names (`public.users`) are kept |
| `column type [settings]` | a column; `pk` / `primary key`, `unique`, `ref` give the key marks, `not null`, `increment` and `note` the comment |
| `ref: > other.column` | an inline reference from this column |
| `Ref: a.x > b.y`, `Ref name: …`, `Ref { … }` | references: `>` many to one, `<` one to many, `-` one to one, `<>` many to many; composite `a.(x, y)` |
| `Enum name { value [note: '…'] }` | an enum, drawn as an entity listing its values |
| `indexes { … }`, `Note`, `Project`, `TableGroup`, `TablePartial` | read and skipped |
| `//`, `/* */` | comments |

A column that references another is marked FK; the line between the tables
reads `column → column`.
