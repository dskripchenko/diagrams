# Structurizr DSL

```structurizr
workspace {
  model {
    user = person "顾客"
    shop = softwareSystem "商店" {
      web = container "网站" "店面" "React"
      db = container "订单" "" "PostgreSQL" "Database"
    }
    psp = softwareSystem "支付" "" "External"
    user -> web "使用" "HTTPS"
    web -> db "读写"
    web -> psp "扣款"
  }
  views {
    container shop {
      include *
      autolayout lr
    }
  }
}
```

以 `workspace` 开头的源码是 Structurizr DSL：一个架构模型及其视图。第一个视图绘制为 [C4 图](c4.md)；没有视图时绘制人员和软件系统的全景。

| 语法 | |
|---|---|
| `id = person "名称" "描述" "标签"` | 人员（`id =` 可选） |
| `id = softwareSystem "名称" "描述" "标签" { … }` | 软件系统及其容器 |
| `id = container "名称" "描述" "技术" "标签" { … }` | 容器及其组件 |
| `id = component "名称" "描述" "技术" "标签"` | 组件 |
| 元素内的 `tags "…"`、`description "…"`、`technology "…"` | 更多信息 |
| `a -> b "描述" "技术"`、元素内的 `-> b` | 关系 |
| `group "名称" { … }` | 读取；其中元素归属外层作用域 |
| `views` 中的 `systemLandscape`、`systemContext x`、`container x`、`component x` | 绘制的视图（第一个）；`autolayout lr` 从左到右布局 |
| `styles` 中的 `element "标签" { shape Cylinder }` | 标签对应的形状：`Cylinder`、`Pipe`、`Person` |

**视图显示什么。** 上下文视图：人员和软件系统。容器视图：系统边界内的容器，以及周围的人员和系统。组件视图：容器边界内的组件，以及周围的容器、人员和系统。视图中未显示的元素之间的关系，绘制在它们最近的可见父元素之间（容器对另一系统的调用变为系统之间的关系），且只绘制一次。

**标签。** `External`（或 `location External`）绘制外部元素；`Database` 为圆柱，`Queue` 为管道。部署视图和动态视图、`!docs`、`!adrs`、`!include` 和脚本不会读取。
