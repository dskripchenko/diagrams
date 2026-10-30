# DBML

```dbml
Table users {
  id integer [pk, increment]
  email varchar [unique, not null, note: 'логин']
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

DBML (Database Markup Language) описывает схему базы данных; исходник,
который начинается с `Table`, `Ref`, `Enum` или `Project`, — это DBML.
Рисуется как [ER-диаграмма](er.md), слева направо.

| Синтаксис | |
|---|---|
| `Table имя [as псевдоним] { … }` | таблица; имена схем (`public.users`) сохраняются |
| `колонка тип [настройки]` | колонка; `pk` / `primary key`, `unique`, `ref` дают отметки ключей, `not null`, `increment` и `note` — комментарий |
| `ref: > other.column` | ссылка прямо из этой колонки |
| `Ref: a.x > b.y`, `Ref имя: …`, `Ref { … }` | ссылки: `>` многие к одному, `<` один ко многим, `-` один к одному, `<>` многие ко многим; составные `a.(x, y)` |
| `Enum имя { значение [note: '…'] }` | перечисление — сущность со списком значений |
| `indexes { … }`, `Note`, `Project`, `TableGroup`, `TablePartial` | читаются и пропускаются |
| `//`, `/* */` | комментарии |

Колонка, которая ссылается на другую, отмечается FK; на линии между
таблицами подпись `колонка → колонка`.
