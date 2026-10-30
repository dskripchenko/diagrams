# 架构图

```mermaid
architecture-beta
  group api(cloud)[API]
  service db(database)[数据库] in api
  service server(server)[服务器] in api
  junction hub in api
  service gateway(internet)[网关]
  db:L -- R:server
  gateway:R --> L:server
  server:R -[事件]-> L:hub
```

带图标的服务，可分组，服务之间有连线——布局与[流程图](flowchart.md)相同，从左到右。

| 语法 | |
|---|---|
| `service id(图标)[标题]`、`… in 分组` | 服务；图标 `cloud`、`database`、`disk`、`internet`、`server`（其他名称如 `aws:sqs` 绘制为方框） |
| `group id(图标)[标题]`、`… in 分组` | 分组，可嵌套在另一分组中 |
| `junction id`、`… in 分组` | 连线汇合的点 |
| `a:R -- L:b` | 连线；方向（`L`、`R`、`T`、`B`）被接受，路径由布局决定 |
| `-->`、`<--`、`<-->` | 箭头 |
| `a:R -[文本]- L:b` | 连线标签 |
| `a{group}:R -- L:b` | 连线从 `a` 所在的分组开始 |
