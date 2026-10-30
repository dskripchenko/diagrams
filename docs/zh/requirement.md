# 需求图

```mermaid
requirementDiagram
  requirement login {
    id: 1
    text: 用户使用密码登录。
    risk: high
    verifymethod: test
  }
  element web {
    type: service
    docref: docs/web.md
  }
  web - satisfies -> login
```

需求和元素是方框，种类作为构造型，字段作为行；关系是以其种类为标签的虚线箭头。由类图渲染器绘制（[类图](class.md)）。

| 语法 | |
|---|---|
| `requirement`、`functionalRequirement`、`interfaceRequirement`、`performanceRequirement`、`physicalRequirement`、`designConstraint` `名称 { … }` | 需求，字段 `id`、`text`、`risk`（`low`、`medium`、`high`）、`verifymethod`（`analysis`、`inspection`、`test`、`demonstration`） |
| `element 名称 { … }` | 元素，字段 `type`、`docref` |
| `a - satisfies -> b`、`b <- satisfies - a` | 关系：`contains`、`copies`、`derives`、`satisfies`、`verifies`、`refines`、`traces` |
| `direction LR`、`classDef`、`class a,b 名称`、`style a fill:…`、`名称:::类` | 布局和样式 |

关系中使用的名称必须先声明。
