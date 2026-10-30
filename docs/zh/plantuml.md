# PlantUML

以 `@startuml` 开头的源码按 PlantUML 读取，其他一律按 Mermaid 读取。也可以显式指定：`render(source, { syntax: 'plantuml' })`。

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

PlantUML 没有表示图类型的关键字：与 PlantUML 本身一样，类型根据语句内容识别。`:动作;` 行、`start`、`if (…)` —— 活动图；`[组件]`、`(用例)`、`node`、`package` 及其他元素关键字 —— 用例图、组件图和部署图；参与者与消息 —— 时序图。`detect()` 对时序图返回 `sequence`，对其他图返回 `flowchart`（即绘制它们所用的模型）。

支持：**时序图**、**用例图**、**组件图**、**部署图**、**活动图**、**类图**、**对象图**、**状态图**和 **ER 图**（Information Engineering 表示法）。C4、思维导图、甘特图、时间图和 Salt 将在后续版本中提供；遇到这类源码时会抛出说明原因的错误。`detect()` 返回绘制该图所用的模型：`sequence`、`flowchart`（用例图、组件图、部署图、活动图）、`class`（类图、对象图）、`state`、`er`。

## 所有图通用

| 语法 | |
|---|---|
| `' 注释`、`/' 块注释 '/` | 忽略 |
| `title 文本`、`title` … `end title` | 标题 |
| `left to right direction` | 从左到右布局（用例图、组件图、部署图） |
| `skinparam …`、`skinparam x { … }`、`<style>…</style>`、`!theme`、`!pragma`、`scale`、`header`、`footer`、`legend`、`caption` | 接受但忽略：颜色和字体来自主题（[主题](theming.md)） |
| `!include`、`!define`、`!procedure`、`!if` … | 报错：渲染器只读取单个源码，没有文件也没有变量 |
| 文本中的 `\n` | 换行 |

## 时序图

| 语法 | |
|---|---|
| `participant`、`actor`、`boundary`、`control`、`entity`、`database`、`collections`、`queue` | 该类型的参与者；消息中用到的名称会成为 `participant` |
| `participant "长名称" as L`、`participant L as "长名称"` | 显示名称与别名 |
| `… <<构造型>>`、`… #颜色`、`… order 10` | 构造型显示在名称下方；颜色和顺序被接受 |
| `A -> B : 文本` | 消息；`-->` 虚线，`->>` 开放箭头，`->x` 丢失，`<-` 反向，`<->` 两端箭头，`-[#red]>` 着色 |
| `A -> B ++`、`--`、`**`、`!!` | 激活目标、结束源的激活、创建目标、销毁目标 |
| `activate A`、`deactivate A`、`create A`、`destroy A` | 如其名 |
| `return 文本` | 一条返回给最近一次激活的调用方的虚线消息，该激活随之结束 |
| `note left of A : 文本`、`note right of A`、`note over A, B`、`note across`、`hnote`、`rnote` | 注释；没有 `: 文本` 时注释持续到 `end note`；单独的 `note left` 位于上一条消息旁 |
| `ref over A, B : 文本` | 绘制为覆盖它们的注释 |
| `alt`/`else`、`opt`、`loop`、`par`/`else`、`break`、`critical`、`group 文本` … `end` | 组合块 |
| `box "标题" #颜色` … `end box` | 共享背景的一组参与者 |
| `== 标题 ==` | 横贯整张图的分隔线 |
| `...`、`... 文本 ...` | 延迟 |
| `|||`、`||45||` | 额外间距 |
| `autonumber [起始 [步长]]`、`autonumber stop`、`autonumber resume` | 消息编号（接受格式字符串，但不绘制） |
| `hide footbox` | 底部不再重复参与者 |

不支持：来自或发往图外的消息（`[->`、`->]`）、`newpage`、参与者颜色、`skinparam` 样式。

## 用例图、组件图和部署图

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

| 语法 | |
|---|---|
| `actor`、`usecase`、`component`、`interface`、`node`、`cloud`、`database`、`queue`、`storage`、`artifact`、`card`、`file`、`folder`、`frame`、`package`、`rectangle`、`agent`、`stack`、`hexagon`、`person`、`label`、`circle`、`collections`、`boundary`、`control`、`entity` | 对应形状的元素 |
| `:参与者:`、`(用例)`、`[组件]`、`() 接口` | 简写形式，可用于声明和连线 |
| `X as Alias`、`"长名称" as A`、`<<构造型>>`、`#颜色` | 别名、构造型（显示在名称下方）、填充色 |
| `node N [第一行` … `]` | 多行描述 |
| `package P {` … `}`（任何元素关键字加 `{`） | 容器，可任意嵌套；连线可以指向容器 |
| `A --> B : 标签` | 连线：`--` 实线，`..` 虚线，`==` 粗线，`~~` 虚线 |
| 任一端的 `>`、`\|>`、`*`、`o`、`+`、`>>` | 箭头、继承三角、组合、聚合、圆、开放箭头 |
| `-[#red]->`、`-[dashed]->`、`-[bold]->`、`-[hidden]->` | 颜色与线型；隐藏连线只影响布局 |
| `-up->`、`-down->`、`-left->`、`-right->`（`-u->` …） | `up` 把目标放在上方；其余被接受 |
| `note right of X : 文本`、`note "文本" as N` 配合 `N .. X`、以 `end note` 结束的多行注释 | 注释 |
| `together { … }` | 接受；其中元素归属外层容器 |

单短横线连线（`->`）与双短横线（`-->`）布局相同：目前还不会刻意把元素并排放在同一层。

## 活动图

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

| 语法 | |
|---|---|
| `start`、`stop`、`end` | 起点和终点 |
| `kill`、`detach` | 流程在此结束，没有终点 |
| 一行或多行的 `:文本;`；`#pink:文本;` | 动作；接受任意 SDL 结尾（`;`、`|`、`<`、`>`、`/`、`]`、`}`） |
| `if (c) then (yes)` … `elseif (d) then (yes)` … `else (no)` … `endif` | 条件；也接受 `is (…)` 形式 |
| `while (c) is (yes)` … `endwhile (no)` | 先判断的循环 |
| `repeat` … `repeat while (c) is (yes) not (no)` | 后判断的循环 |
| `fork` … `fork again` … `end fork` / `end merge` | 并行分支，用横条汇合或不汇合 |
| `split` … `split again` … `end split` | 没有横条的分支 |
| `partition 名称 {` … `}`、`group 名称` … `end group` | 围绕动作的框 |
| `-> 文本;`、`-[#red,dashed]->` | 下一条箭头的标签和样式 |
| `note left: 文本`、`note right` … `end note` | 位于上一个动作旁的注释 |
| `|泳道|`、`|#颜色|泳道|` | 泳道：其后直到下一个泳道的动作，都框在该泳道名称下 |

泳道绘制为围绕其动作、带名称的框，而不是贯穿整个高度的列。不支持使用 `(*)` 的旧语法。

## 类图和对象图

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

| 语法 | |
|---|---|
| `class`、`abstract class`、`abstract`、`interface`、`enum`、`annotation`、`entity`、`struct`、`record`、`exception`、`protocol`、`metaclass` | 类；除 `class` 外都会显示为其构造型 |
| `class "长名称" as L`、`class Box<T>`、`<<构造型>>`、`#颜色` | 显示名称、泛型、构造型；颜色被接受 |
| `class B extends A implements I, J` | 继承与实现 |
| `class A {` … `}` | 成员：`+字段 : 类型`、`-方法(参数 : T) : R`、`{static}`、`{abstract}`、`{field}`、`{method}`；分隔符 `--`、`..`、`==`、`__`；枚举值每行一个 |
| `A : +成员` | 在类外声明的成员 |
| `A <\|-- B`、`*--`、`o--`、`-->`、`..>`、`..\|>`、`--`、`..` | 关系；方向词（`-up->`）和样式被接受 |
| `A "1" *-- "many" B : 标签 >` | 多重性和标签（末尾的阅读箭头会被去掉） |
| `package P {` … `}`、`namespace P {` … `}` | 围绕其类的框；嵌套包按路径命名（`app.core`） |
| `note right of A : 文本`、`note "文本" as N` 配合 `N .. A`、`note "文本"` | 类上的注释、关联注释或独立注释 |
| `object o`、`o : 字段 = 值`、`object o { … }`、`map M { 键 => 值 }` | 对象图：对象和映射绘制为带值的方框 |
| `hide empty members`、`hide circle`、`show …`、`remove …` | 接受但忽略 |

## 状态图

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

| 语法 | |
|---|---|
| `[*] --> A`、`A --> [*]` | 开始与结束 |
| `A --> B : 事件`、`A -> B`、`A -right-> B`、`A -[#red]-> B`、`B <-- A` | 转换；任意箭头 |
| `state A`、`state "长名称" as A`、`state A : 文本`、`A : 文本` | 状态、显示名称、描述 |
| `state A {` … `}` | 复合状态，可任意嵌套 |
| 复合状态内的 `--` 或 `||` | 并发区域 |
| `state C <<choice>>`、`<<fork>>`、`<<join>>` | 伪状态 |
| `note left of A : 文本`、`note right of A` … `end note` | 注释（`top` 和 `bottom` 分别放在左侧和右侧） |
| `[H]`、`[H*]` | 绘制为名为 H 的状态 |
| `state A #pink`、`hide empty description` | 接受 |

## ER 图

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

| 语法 | |
|---|---|
| `entity 名称 { … }`、`entity "长名称" as N { … }` | 实体 |
| `[*] 名称 : 类型 <<PK>>` | 属性；`<<PK>>`、`<<FK>>`、`<<UK>>` 为键，其他构造型作为注释；接受 `*`（必填） |
| `--`、`..`、`==`、`__` | 分隔符，跳过 |
| `A \|\|--o{ B : 标签` | 带鸦爪端点的关系：`\|\|` 一，`\|o`/`o\|` 零或一，`}\|`/`\|{` 一或多，`}o`/`o{` 零或多；`..` 虚线 |

当图中有鸦爪连线，或有带主体的实体且没有类关键字时，按 ER 图处理。
