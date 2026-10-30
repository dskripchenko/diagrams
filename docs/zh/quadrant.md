# 象限图

```mermaid
quadrantChart
  title 覆盖与参与度
  x-axis 低覆盖 --> 高覆盖
  y-axis 低参与 --> 高参与
  quadrant-1 扩大
  quadrant-2 推广
  quadrant-3 重新评估
  quadrant-4 改进
  活动 A: [0.3, 0.6]
  活动 B: [0.45, 0.23] radius: 9, color: #f97316
  活动 C:::hot: [0.82, 0.78]
  classDef hot color: #e11d48, radius: 8
```

| 语法 | |
|---|---|
| `title …` | 标题 |
| `x-axis 低 --> 高`、`y-axis 低 --> 高` | 两端的坐标轴文字，或居中的一个 |
| `quadrant-1 …` … `quadrant-4 …` | 象限标签：1 右上，2 左上，3 左下，4 右下 |
| `名称: [x, y]` | 一个点，两个坐标都在 0 到 1 之间 |
| `… radius: 9, color: #f97316, stroke-color: #fff, stroke-width: 2px` | 点的样式 |
| `名称:::类: [x, y]`、`classDef 类 color: …, radius: …` | 共享样式 |

主题变量：`--dg-quadrant-1` … `--dg-quadrant-4`。
