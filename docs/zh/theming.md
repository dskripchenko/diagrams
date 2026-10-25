# 主题

每张图表中的每种颜色都是一个带默认值的 CSS 自定义属性，字体族也是。SVG 自身的样式表以
`var(--dg-…, default)` 的形式读取它们，因此在 SVG 之上任意位置的声明——在 `:root`
上、在容器上、在深色模式媒体查询中——都能改变它的样式。

```css
.docs {
  --dg-node-fill: #ecfeff;
  --dg-node-stroke: #0891b2;
}
```

## 深色主题

```css
@media (prefers-color-scheme: dark) {
  :root {
    --dg-text: #e2e8f0;
    --dg-text-muted: #94a3b8;
    --dg-line: #94a3b8;
    --dg-node-fill: #1e1b4b;
    --dg-node-stroke: #818cf8;
    --dg-node-text: #e0e7ff;
    --dg-row-fill: #0f172a;
    --dg-row-alt-fill: #161e33;
    --dg-cluster-fill: #111827;
    --dg-cluster-stroke: #334155;
    --dg-cluster-text: #cbd5e1;
    --dg-edge-label-fill: #0f172a;   /* the page background */
    --dg-note-fill: #422006;
    --dg-note-stroke: #ca8a04;
    --dg-note-text: #fef9c3;
    --dg-actor-fill: #1e1b4b;
    --dg-actor-stroke: #818cf8;
    --dg-activation-fill: #312e81;
    --dg-block-stroke: #64748b;
    --dg-block-label-fill: #1e293b;
    --dg-grid: #1f2937;
    --dg-lifeline: #475569;
    --dg-state-start: #e2e8f0;
  }
}
```

## 变量

| 变量 | 默认值 | 用途 |
|---|---|---|
| `--dg-font-family` | 系统 UI 字体栈 | 所有文本 |
| `--dg-text` | `#1f2937` | 一般文本 |
| `--dg-text-muted` | `#6b7280` | 次要文本：守卫条件、坐标轴标签 |
| `--dg-line` | `#64748b` | 边、箭头、消息线 |
| `--dg-node-fill` / `-stroke` / `-text` | `#eef2ff` / `#6366f1` / `#1e1b4b` | 流程图节点、状态；实体与类的标题栏 |
| `--dg-row-fill` / `--dg-row-alt-fill` | `#ffffff` / `#f5f7ff` | 实体的行（交替）和类的成员栏 |
| `--dg-cluster-fill` / `-stroke` / `-text` | `#f8fafc` / `#cbd5e1` / `#334155` | 子图、复合状态 |
| `--dg-edge-label-fill` | `#ffffff` | 边文本背后的底框、空心线端的内部——设为页面背景色 |
| `--dg-note-fill` / `-stroke` / `-text` | `#fef9c3` / `#ca8a04` / `#422006` | 注解 |
| `--dg-actor-fill` / `-stroke` | `#eef2ff` / `#6366f1` | 时序图参与者 |
| `--dg-activation-fill` | `#e0e7ff` | 激活条 |
| `--dg-lifeline` | `#94a3b8` | 生命线 |
| `--dg-number-text` | `#ffffff` | `autonumber` 数字 |
| `--dg-block-stroke` / `--dg-block-label-fill` | `#94a3b8` / `#e2e8f0` | `loop`、`alt` 等的边框及其标签页 |
| `--dg-rect-fill` | 半透明灰色 | 未指定颜色的 `rect` |
| `--dg-grid` | `#e5e7eb` | 甘特图网格 |
| `--dg-task-fill` / `-stroke` | `#818cf8` / `#4f46e5` | 甘特图任务 |
| `--dg-task-done-fill` / `-stroke` | `#cbd5e1` / `#64748b` | `done` |
| `--dg-task-active-fill` | `#c7d2fe` | `active` |
| `--dg-task-crit-fill` / `-stroke` | `#f87171` / `#b91c1c` | `crit` |
| `--dg-task-text` / `--dg-task-text-dark` | `#ffffff` / `#1f2937` | 深色 / 浅色条上的文本 |
| `--dg-exclude-fill` | 半透明灰色 | 被排除的日子 |
| `--dg-section-fill-0` / `-1` | 半透明 | 交替的分组色带 |
| `--dg-today` | `#ef4444` | 今天线 |
| `--dg-state-start` | `#1f2937` | 起始和结束状态、分叉条 |
| `--dg-pie-1` … `--dg-pie-12` | 12 色调色板 | 饼图扇区 |
| `--dg-pie-stroke` / `--dg-pie-text` | `#ffffff` / `#ffffff` | 扇区边框、百分比 |

该列表也以 `THEME_VARIABLES`（变量 → 默认值）的形式导出，供生成主题的工具使用。

## 单个图表的样式

在图表内部，`classDef`、`class`、`style` 和 `linkStyle`（流程图、状态图）可为单个
元素覆盖这些值；参见[流程图样式](flowchart.md#样式与类)。

## 类名

元素带有稳定的类名——`dg-node`、`dg-edge`、`dg-cluster`、`dg-edge-label`、
`dg-note`，以及每个 `classDef` 类对应的 `dg-class-<name>`——节点还带有包含其 id 的
`data-id`，便于从外部设置样式或编写脚本。
