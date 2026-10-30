# Архитектурная диаграмма

```mermaid
architecture-beta
  group api(cloud)[API]
  service db(database)[База данных] in api
  service server(server)[Сервер] in api
  junction hub in api
  service gateway(internet)[Шлюз]
  db:L -- R:server
  gateway:R --> L:server
  server:R -[события]-> L:hub
```

Сервисы со значками, сгруппированные, со связями между ними; раскладка —
как у [блок-схемы](flowchart.md), слева направо.

| Синтаксис | |
|---|---|
| `service id(значок)[Название]`, `… in группа` | сервис; значки `cloud`, `database`, `disk`, `internet`, `server` (любое другое имя, например `aws:sqs`, рисует прямоугольник) |
| `group id(значок)[Название]`, `… in группа` | группа, вложенная в другую или нет |
| `junction id`, `… in группа` | точка, где сходятся связи |
| `a:R -- L:b` | связь; стороны (`L`, `R`, `T`, `B`) принимаются, путь строит раскладка |
| `-->`, `<--`, `<-->` | стрелки |
| `a:R -[текст]- L:b` | подпись связи |
| `a{group}:R -- L:b` | связь начинается от группы, в которой состоит `a` |
