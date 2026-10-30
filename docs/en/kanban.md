# Kanban board

```mermaid
kanban
  todo[To do]
    t1[Write the docs]
    t2[Release notes]@{ assigned: 'anna', ticket: DOC-12, priority: 'High' }
  doing[In progress]
    t3[Tests]@{ priority: 'Very High' }
  done[Done]
```

| Syntax | |
|---|---|
| `id[Title]` at the outer indentation | a column |
| `id[Text]`, `[Text]` or text, indented under a column | a card |
| `@{ assigned: 'name', ticket: KEY-1, priority: 'High' }` | card metadata; priority is `Very High`, `High`, `Low` or `Very Low` (a coloured stripe) |

Columns stand side by side and reach the height of the tallest one.
