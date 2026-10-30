# PlantUML

Исходник, который начинается с `@startuml`, читается как PlantUML; любой
другой — как Mermaid. Явно: `render(source, { syntax: 'plantuml' })`.

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

У PlantUML нет ключевого слова для типа диаграммы: тип распознаётся по
содержимому, как это делает сам PlantUML. Строки `:действие;`, `start`,
`if (…)` — activity; `[компонент]`, `(вариант использования)`, `node`,
`package` и другие ключевые слова элементов — use case, component и
deployment; участники и сообщения — sequence. `detect()` возвращает
`sequence`, а для остальных — `flowchart` (моделью, которой они рисуются).

Поддерживаются в `@startuml` диаграммы **sequence**, **use case**,
**component**, **deployment**, **activity**, **class**, **object**,
**state**, **ER** (нотация Information Engineering), **C4** (C4-PlantUML),
**timing** и макеты **Salt**; а также **mind map** (`@startmindmap`), **WBS**
(`@startwbs`), **Gantt** (`@startgantt`) и **Salt** (`@startsalt`). На
другие `@start…` (JSON, YAML, …) рендерер отвечает ошибкой с объяснением.
`detect()` возвращает модель, которой рисуется диаграмма: `sequence`,
`flowchart` (use case, component, deployment, activity), `class` (class,
object), `state`, `er`, `c4`, `mindmap` (mind map, WBS), `gantt`, `timing`,
`salt`.

## Общее для всех диаграмм

| Синтаксис | |
|---|---|
| `' комментарий`, `/' блочный комментарий '/` | пропускаются |
| `title Текст`, `title` … `end title` | заголовок |
| `left to right direction` | раскладка слева направо (use case, component, deployment) |
| `skinparam …`, `skinparam x { … }`, `<style>…</style>`, `!theme`, `!pragma`, `scale`, `header`, `footer`, `legend`, `caption` | принимаются и пропускаются: цвета и шрифты задаёт тема ([Оформление](theming.md)) |
| `!include`, `!define`, `!procedure`, `!if` … | ошибка: рендерер читает один исходник, без файлов и переменных |
| `\n` в тексте | перенос строки |

## Диаграммы последовательности

| Синтаксис | |
|---|---|
| `participant`, `actor`, `boundary`, `control`, `entity`, `database`, `collections`, `queue` | участник этого вида; имя из сообщения становится `participant` |
| `participant "Длинное имя" as L`, `participant L as "Длинное имя"` | показываемое имя и псевдоним |
| `… <<стереотип>>`, `… #цвет`, `… order 10` | стереотип показывается под именем; цвет и порядок принимаются |
| `A -> B : текст` | сообщение; `-->` пунктир, `->>` открытая стрелка, `->x` потерянное, `<-` в обратную сторону, `<->` с двух концов, `-[#red]>` цветное |
| `A -> B ++`, `--`, `**`, `!!` | активировать получателя, завершить активацию отправителя, создать получателя, уничтожить получателя |
| `activate A`, `deactivate A`, `create A`, `destroy A` | как называются |
| `return текст` | пунктирное сообщение обратно к вызвавшему последнюю активацию; активация завершается |
| `note left of A : текст`, `note right of A`, `note over A, B`, `note across`, `hnote`, `rnote` | заметки; без `: текст` заметка идёт до `end note`; `note left` без участника — рядом с последним сообщением |
| `ref over A, B : текст` | рисуется заметкой над ними |
| `alt`/`else`, `opt`, `loop`, `par`/`else`, `break`, `critical`, `group текст` … `end` | блоки |
| `box "Название" #цвет` … `end box` | участники на общем фоне |
| `== Название ==` | разделитель через всю диаграмму |
| `...`, `... текст ...` | задержка |
| `|||`, `||45||` | дополнительный отступ |
| `autonumber [начало [шаг]]`, `autonumber stop`, `autonumber resume` | номера сообщений (формат принимается, но не рисуется) |
| `hide footbox` | без повтора участников внизу |

Не поддерживается: сообщения извне и наружу (`[->`, `->]`), `newpage`,
цвета участников, оформление через `skinparam`.

## Диаграммы use case, component и deployment

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

| Синтаксис | |
|---|---|
| `actor`, `usecase`, `component`, `interface`, `node`, `cloud`, `database`, `queue`, `storage`, `artifact`, `card`, `file`, `folder`, `frame`, `package`, `rectangle`, `agent`, `stack`, `hexagon`, `person`, `label`, `circle`, `collections`, `boundary`, `control`, `entity` | элемент соответствующей формы |
| `:Актор:`, `(Вариант)`, `[Компонент]`, `() Интерфейс` | краткие записи — в объявлениях и в связях |
| `X as Alias`, `"Длинное имя" as A`, `<<стереотип>>`, `#цвет` | псевдоним, стереотип (под именем), цвет заливки |
| `node N [первая строка` … `]` | описание в несколько строк |
| `package P {` … `}` (любое ключевое слово элемента с `{`) | контейнер любой вложенности; на него можно ссылаться в связях |
| `A --> B : подпись` | связь: `--` сплошная, `..` пунктир, `==` жирная, `~~` пунктир |
| концы `>`, `\|>`, `*`, `o`, `+`, `>>` с любой стороны | стрелка, треугольник наследования, композиция, агрегация, круг, открытая стрелка |
| `-[#red]->`, `-[dashed]->`, `-[bold]->`, `-[hidden]->` | цвет и стиль линии; скрытая связь влияет только на раскладку |
| `-up->`, `-down->`, `-left->`, `-right->` (`-u->` …) | `up` ставит цель выше; остальные принимаются |
| `note right of X : текст`, `note "текст" as N` и `N .. X`, многострочные с `end note` | заметки |
| `together { … }` | принимается; его элементы относятся к охватывающему контейнеру |

Связь с одним дефисом (`->`) раскладывается как связь с двумя (`-->`):
ставить элементы рядом на одном уровне раскладка пока не умеет.

## Диаграммы activity

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

| Синтаксис | |
|---|---|
| `start`, `stop`, `end` | начальная и конечная точки |
| `kill`, `detach` | поток обрывается здесь, без конечной точки |
| `:текст;` в одну или несколько строк; `#pink:текст;` | действие; принимается любое окончание SDL (`;`, `|`, `<`, `>`, `/`, `]`, `}`) |
| `if (c) then (yes)` … `elseif (d) then (yes)` … `else (no)` … `endif` | условия; форма `is (…)` тоже принимается |
| `while (c) is (yes)` … `endwhile (no)` | цикл с проверкой в начале |
| `repeat` … `repeat while (c) is (yes) not (no)` | цикл с проверкой в конце |
| `fork` … `fork again` … `end fork` / `end merge` | параллельные ветви — со сливающей чертой или без |
| `split` … `split again` … `end split` | ветви без черт |
| `partition Название {` … `}`, `group Название` … `end group` | рамка вокруг действий |
| `-> текст;`, `-[#red,dashed]->` | подпись и стиль следующей стрелки |
| `note left: текст`, `note right` … `end note` | заметка рядом с последним действием |
| `|Дорожка|`, `|#цвет|Дорожка|` | дорожки: действия после неё, до следующей дорожки, обводятся рамкой с её названием |

Дорожки рисуются подписанными рамками вокруг своих действий, а не
колонками во всю высоту. Не поддерживается старый синтаксис с `(*)`.

## Диаграммы классов и объектов

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

| Синтаксис | |
|---|---|
| `class`, `abstract class`, `abstract`, `interface`, `enum`, `annotation`, `entity`, `struct`, `record`, `exception`, `protocol`, `metaclass` | класс; все, кроме `class`, показываются его стереотипом |
| `class "Длинное имя" as L`, `class Box<T>`, `<<стереотип>>`, `#цвет` | показываемое имя, обобщения, стереотипы; цвета принимаются |
| `class B extends A implements I, J` | наследование и реализация |
| `class A {` … `}` | члены: `+поле : Тип`, `-метод(арг : T) : R`, `{static}`, `{abstract}`, `{field}`, `{method}`; разделители `--`, `..`, `==`, `__`; значения перечисления по одному в строке |
| `A : +член` | член, объявленный вне класса |
| `A <\|-- B`, `*--`, `o--`, `-->`, `..>`, `..\|>`, `--`, `..` | связи; слова направления (`-up->`) и стили принимаются |
| `A "1" *-- "many" B : подпись >` | кратности и подпись (стрелка чтения в её конце отбрасывается) |
| `package P {` … `}`, `namespace P {` … `}` | рамка вокруг его классов; вложенные пакеты именуются путём (`app.core`) |
| `note right of A : текст`, `note "текст" as N` и `N .. A`, `note "текст"` | заметки на классе, привязанные и свободные |
| `object o`, `o : поле = значение`, `object o { … }`, `map M { ключ => значение }` | диаграммы объектов: объекты и словари рисуются прямоугольниками со значениями |
| `hide empty members`, `hide circle`, `show …`, `remove …` | принимаются и пропускаются |

## Диаграммы состояний

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

| Синтаксис | |
|---|---|
| `[*] --> A`, `A --> [*]` | начало и конец |
| `A --> B : событие`, `A -> B`, `A -right-> B`, `A -[#red]-> B`, `B <-- A` | переходы; любая стрелка |
| `state A`, `state "Длинное имя" as A`, `state A : текст`, `A : текст` | состояния, показываемые имена, описания |
| `state A {` … `}` | составное состояние любой вложенности |
| `--` или `||` внутри составного | параллельные области |
| `state C <<choice>>`, `<<fork>>`, `<<join>>` | псевдосостояния |
| `note left of A : текст`, `note right of A` … `end note` | заметки (`top` и `bottom` уходят влево и вправо) |
| `[H]`, `[H*]` | рисуются состоянием с именем H |
| `state A #pink`, `hide empty description` | принимаются |

## Диаграммы ER

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

| Синтаксис | |
|---|---|
| `entity Имя { … }`, `entity "Длинное" as N { … }` | сущность |
| `[*] имя : тип <<PK>>` | атрибут; `<<PK>>`, `<<FK>>`, `<<UK>>` — ключи, другие стереотипы — комментарий; `*` (обязательный) принимается |
| `--`, `..`, `==`, `__` | разделители, пропускаются |
| `A \|\|--o{ B : подпись` | связь с «вороньими лапками»: `\|\|` один, `\|o`/`o\|` ноль или один, `}\|`/`\|{` один или больше, `}o`/`o{` ноль или больше; `..` — пунктир |

Диаграмма считается ER, если в ней есть связи с «вороньими лапками» или
сущности с телом и нет ключевых слов классов.

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

Макросы — те же, что у [C4](c4.md): элементы, границы, `Rel`, `BiRel`,
`Rel_U/D/L/R`, `Rel_Back`, `UpdateElementStyle`, макросы раскладки.

| Синтаксис | |
|---|---|
| `!include <C4/C4_Container>`, `!include https://…/C4_Container.puml` | уровень: `C4_Context`, `C4_Container`, `C4_Component`, `C4_Dynamic`, `C4_Deployment`; считается самый глубокий из подключённых. Саму библиотеку рендерер не скачивает. Любой другой `!include` по-прежнему ошибка |
| `SHOW_LEGEND()`, `LAYOUT_WITH_LEGEND()`, `LAYOUT_AS_SKETCH()`, `HIDE_*`, `Add…Tag`, `Update…Tag`, `Lay_*`, `SetPropertyHeader`, `AddProperty` | пропускаются: это только оформление |
| `Rel_Neighbor`, `BiRel_Neighbor`, `Rel_Back_Neighbor` | обычные связи |

Диаграмма с макросами C4 (`Person(…)`, `Container(…)`, `Rel(…)`…) считается
C4 и без `!include`; уровень тогда — Context.

## Mind map и WBS

```
@startmindmap
* Release
** Backend
***_ узел без рамки
** Frontend
***:узел в
две строки;
left side
** Docs
@endmindmap
```

| Синтаксис | |
|---|---|
| `*`, `**`, … (или `+` / `-` в стиле OrgMode, или `#`) | узел на этой глубине; корень один |
| `*_ текст` | узел без рамки |
| `*[#Orange] текст` | цвет, принимается |
| `**:первая строка` … `последняя;` | узел в несколько строк |
| `left side`, `right side` | принимаются; ветви раскладка расставляет сама |

`@startwbs` читает такое же дерево и рисует его как mind map.

## Gantt

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

| Синтаксис | |
|---|---|
| `Project starts 2026-03-02` | начало задач, у которых нет своего |
| `[Задача] lasts 5 days`, `requires 2 weeks` | длительность |
| `[Задача] starts 2026-03-10`, `starts at [X]'s end`, `starts at [X]'s start` | начало |
| `[Задача] ends 2026-03-20`, `ends at [X]'s start` | окончание |
| `then [Задача] …` | начинается по окончании предыдущей |
| `[A] -> [B]` | B начинается по окончании A |
| `[Задача] as [T]` | псевдоним |
| `[M] happens at [X]'s end`, `happens 2026-03-30` | веха |
| `[Задача] is 40% completed`, `is completed` | в работе (процент в названии) или выполнена |
| `-- Раздел --` | раздел |
| `saturday are closed`, `2026-03-09 is closed` | нерабочие дни |
| условия через `and` | `[A] starts at [B]'s end and lasts 3 days` |
| цвета, ресурсы (`on {Alice}`), `printscale`, `language`, `today` | принимаются |

Не поддерживаются смещения (`starts 2 days after [X]'s end`) — об этом
говорит ошибка. Задачи выводятся в порядке, где каждая идёт после тех, от
которых зависит.

## Timing

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

| Синтаксис | |
|---|---|
| `robust "Имя" as N` | уровни, ступеньками |
| `concise "Имя" as N` | состояние полосой с его названием |
| `binary "Имя" as N` | высокий или низкий уровень |
| `clock "Имя" as N with period 50 [pulse 15] [offset 10]` | меандр |
| `N has A,B,C` | уровни robust-сигнала сверху вниз (иначе — в порядке появления) |
| `@100`, `@+50` | момент, к которому относятся следующие строки |
| `N is Состояние`, `N is "Длинное"`, `N is {-}` | смена состояния; `{-}` / `{hidden}` — пусто |
| `@N`, затем `0 is A`, `+100 is B` | то же, записанное по сигналу |
| `A -> B : текст`, `A -> B@+20 : текст` | сообщение в этот момент, можно с задержкой прихода |
| `highlight 200 to 300 #Gold : текст` | подсвеченный интервал |

## Макеты Salt

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

Макет Salt — это `@startsalt … @endsalt` или `@startuml`, первая строка
которого `salt`.

| Синтаксис | |
|---|---|
| `{ … }` | сетка: строки — строками, ячейки через `\|`; блоки вкладываются в ячейки |
| `{+`, `{#`, `{!`, `{-` | внешняя рамка; все линии; линии между столбцами; между строками |
| `[Кнопка]` | кнопка |
| `"поле ввода   "` | поле ввода; пробелы в конце делают его шире |
| `[X] отмечено`, `[] не отмечено` | флажки |
| `(X) выбрано`, `() не выбрано` | переключатели |
| `^список^` | выпадающий список |
| текст, `<b>жирный</b>` | надпись |
| `.` | пустая ячейка |
| `..`, `==`, `~~`, `--` отдельной строкой | разделители: точки, двойная, штрих, сплошная |
| `{/ <b>Вкладка 1 \| Вкладка 2 }` | вкладки; выделенная — жирная; по одной в строке — вертикальные |
| `{* Файл \| Правка \| Вид }` | строка меню |
| `{T` и `+ корень`, `++ потомок` | дерево |
| `{^"Заголовок"` | групповая рамка |
| `{S` | область с прокруткой |
