# Оформление

Каждый цвет в каждой диаграмме — пользовательское свойство CSS со значением
по умолчанию; семейство шрифтов — тоже. Собственная таблица стилей SVG читает
их как `var(--dg-…, default)`, поэтому объявления где угодно выше SVG — на
`:root`, на контейнере, в медиазапросе тёмной темы — меняют его оформление.

```css
.docs {
  --dg-node-fill: #ecfeff;
  --dg-node-stroke: #0891b2;
}
```

## Тёмная тема

```css
@media (prefers-color-scheme: dark) {
  :root {
    --dg-text: #e2e8f0;
    --dg-text-muted: #94a3b8;
    --dg-line: #94a3b8;
    --dg-node-fill: #1e1b4b;
    --dg-node-stroke: #818cf8;
    --dg-node-text: #e0e7ff;
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

## Переменные

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `--dg-font-family` | системный набор шрифтов интерфейса | весь текст |
| `--dg-text` | `#1f2937` | основной текст |
| `--dg-text-muted` | `#6b7280` | второстепенный текст: условия, подписи оси |
| `--dg-line` | `#64748b` | рёбра, стрелки, линии сообщений |
| `--dg-node-fill` / `-stroke` / `-text` | `#eef2ff` / `#6366f1` / `#1e1b4b` | узлы блок-схем, состояния |
| `--dg-cluster-fill` / `-stroke` / `-text` | `#f8fafc` / `#cbd5e1` / `#334155` | подграфы, составные состояния |
| `--dg-edge-label-fill` | `#ffffff` | подложка под текстом рёбер — задайте ей цвет фона страницы |
| `--dg-note-fill` / `-stroke` / `-text` | `#fef9c3` / `#ca8a04` / `#422006` | заметки |
| `--dg-actor-fill` / `-stroke` | `#eef2ff` / `#6366f1` | участники диаграммы последовательности |
| `--dg-activation-fill` | `#e0e7ff` | полосы активации |
| `--dg-lifeline` | `#94a3b8` | линии жизни |
| `--dg-number-text` | `#ffffff` | цифры `autonumber` |
| `--dg-block-stroke` / `--dg-block-label-fill` | `#94a3b8` / `#e2e8f0` | рамки `loop`, `alt` … и их ярлыки |
| `--dg-rect-fill` | полупрозрачный серый | `rect` без цвета |
| `--dg-grid` | `#e5e7eb` | сетка диаграммы Ганта |
| `--dg-task-fill` / `-stroke` | `#818cf8` / `#4f46e5` | задачи диаграммы Ганта |
| `--dg-task-done-fill` / `-stroke` | `#cbd5e1` / `#64748b` | `done` |
| `--dg-task-active-fill` | `#c7d2fe` | `active` |
| `--dg-task-crit-fill` / `-stroke` | `#f87171` / `#b91c1c` | `crit` |
| `--dg-task-text` / `--dg-task-text-dark` | `#ffffff` / `#1f2937` | текст на тёмных / светлых полосах |
| `--dg-exclude-fill` | полупрозрачный серый | исключённые дни |
| `--dg-section-fill-0` / `-1` | полупрозрачный | чередующиеся полосы разделов |
| `--dg-today` | `#ef4444` | линия «сегодня» |
| `--dg-state-start` | `#1f2937` | начальное и конечное состояния, полосы разветвления |
| `--dg-pie-1` … `--dg-pie-12` | палитра из 12 цветов | секторы круговой диаграммы |
| `--dg-pie-stroke` / `--dg-pie-text` | `#ffffff` / `#ffffff` | границы секторов, проценты |

Список также экспортируется как `THEME_VARIABLES` (переменная → значение по
умолчанию) для инструментов, генерирующих тему.

## Стили отдельных диаграмм

Внутри диаграммы `classDef`, `class`, `style` и `linkStyle` (блок-схема,
диаграмма состояний) переопределяют эти значения для отдельных элементов; см.
[стили блок-схем](flowchart.md#стили-и-классы).

## Имена классов

Элементы несут стабильные имена классов — `dg-node`, `dg-edge`, `dg-cluster`,
`dg-edge-label`, `dg-note` и `dg-class-<name>` для каждого класса `classDef`, —
а узлы несут `data-id` со своим id, чтобы их можно было стилизовать или
обрабатывать скриптами снаружи.
