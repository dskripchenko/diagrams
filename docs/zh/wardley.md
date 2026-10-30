# 沃德利地图

```wardley
title 茶馆
anchor 业务 [0.95, 0.63]
component 一杯茶 [0.79, 0.61]
component 茶叶 [0.63, 0.81]
component 水壶 [0.43, 0.35] (inertia)
component 电力 [0.1, 0.7] (outsource)
evolve 水壶 0.62
业务->一杯茶
一杯茶->茶叶
一杯茶->水壶
水壶->电力; 受限于
note 电力标准化 [0.30, 0.49]
```

OnlineWardleyMaps 的 DSL。在坐标上有 `component` 或 `anchor`（或以 `wardley` 开头）的源码就是沃德利地图。坐标为 `[可见度, 演化]`：可见度从 0（不可见，底部）到 1（可见，顶部），演化从 0（起源，左侧）到 1（商品，右侧）。

| 语法 | |
|---|---|
| `title …` | 标题 |
| `anchor 名称 [v, e]` | 用户或需求：粗体文字 |
| `component 名称 [v, e]` | 组件；`label [dx, dy]` 移动其标签 |
| `… (inertia)` | 竖条：惯性，对变化的阻力 |
| `… (build)`、`(buy)`、`(outsource)` | 获取方式：外圈光晕 |
| `market 名称 [v, e]`、`ecosystem 名称 [v, e]` | 市场或生态系统 |
| `A->B`、`A->B; 标签` | 依赖 |
| `A+>B`、`A+<>B` | 价值流：虚线 |
| `evolve 名称 0.62` | 演化方向：新演化位置上的红色虚影 |
| `pipeline 名称 [起点, 终点]` | 组件下方的选项管道 |
| `note 文本 [v, e]` | 注释 |
| `annotation 1 [[v, e], …] 文本`、`annotations [v, e]` | 编号标记及其图例 |
| `evolution A->B->C->D` | 四个阶段的名称 |
| `style …`、`size …` | 被接受 |

阶段边界为通常的 0.174、0.4 和 0.7。
