# Диаграмма требований

```mermaid
requirementDiagram
  requirement login {
    id: 1
    text: Пользователь входит по паролю.
    risk: high
    verifymethod: test
  }
  element web {
    type: service
    docref: docs/web.md
  }
  web - satisfies -> login
```

Требования и элементы — прямоугольники с видом в стереотипе и полями
строками; связи — пунктирные стрелки с названием вида. Рисует рендерер
диаграмм классов ([Диаграмма классов](class.md)).

| Синтаксис | |
|---|---|
| `requirement`, `functionalRequirement`, `interfaceRequirement`, `performanceRequirement`, `physicalRequirement`, `designConstraint` `имя { … }` | требование с полями `id`, `text`, `risk` (`low`, `medium`, `high`), `verifymethod` (`analysis`, `inspection`, `test`, `demonstration`) |
| `element имя { … }` | элемент с полями `type`, `docref` |
| `a - satisfies -> b`, `b <- satisfies - a` | связь: `contains`, `copies`, `derives`, `satisfies`, `verifies`, `refines`, `traces` |
| `direction LR`, `classDef`, `class a,b имя`, `style a fill:…`, `имя:::класс` | раскладка и стили |

Имя, использованное в связи, должно быть объявлено.
