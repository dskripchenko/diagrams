# DBML

```dbml
Table users {
  id integer [pk, increment]
  email varchar [unique, not null, note: '登录名']
}
Table posts {
  id integer [pk]
  user_id integer [ref: > users.id]
  status post_status
}
Enum post_status {
  draft
  published
}
```

DBML（Database Markup Language）描述数据库结构；以 `Table`、`Ref`、`Enum` 或 `Project` 开头的源码是 DBML。绘制为[实体关系图](er.md)，从左到右。

| 语法 | |
|---|---|
| `Table 名称 [as 别名] { … }` | 表；保留模式名（`public.users`） |
| `列 类型 [设置]` | 列；`pk` / `primary key`、`unique`、`ref` 给出键标记，`not null`、`increment` 和 `note` 作为注释 |
| `ref: > other.column` | 从该列发出的内联引用 |
| `Ref: a.x > b.y`、`Ref 名称: …`、`Ref { … }` | 引用：`>` 多对一，`<` 一对多，`-` 一对一，`<>` 多对多；复合列 `a.(x, y)` |
| `Enum 名称 { 值 [note: '…'] }` | 枚举，绘制为列出其值的实体 |
| `indexes { … }`、`Note`、`Project`、`TableGroup`、`TablePartial` | 读取并跳过 |
| `//`、`/* */` | 注释 |

引用其他列的列标记为 FK；表之间的连线标注 `列 → 列`。
