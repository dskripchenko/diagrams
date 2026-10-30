# Structurizr DSL

```structurizr
workspace {
  model {
    user = person "Customer"
    shop = softwareSystem "Shop" {
      web = container "Web app" "Storefront" "React"
      db = container "Orders" "" "PostgreSQL" "Database"
    }
    psp = softwareSystem "Payments" "" "External"
    user -> web "Uses" "HTTPS"
    web -> db "Reads and writes"
    web -> psp "Charges"
  }
  views {
    container shop {
      include *
      autolayout lr
    }
  }
}
```

A source starting with `workspace` is Structurizr DSL: one model of the
architecture and views of it. The first view is drawn as a [C4 diagram](c4.md);
without views, the landscape of people and software systems.

| Syntax | |
|---|---|
| `id = person "Name" "Description" "Tags"` | a person (`id =` is optional) |
| `id = softwareSystem "Name" "Description" "Tags" { … }` | a software system, with its containers |
| `id = container "Name" "Description" "Technology" "Tags" { … }` | a container, with its components |
| `id = component "Name" "Description" "Technology" "Tags"` | a component |
| `tags "…"`, `description "…"`, `technology "…"` inside an element | more about it |
| `a -> b "Description" "Technology"`, `-> b` inside an element | relationships |
| `group "Name" { … }` | read; its elements belong to the enclosing scope |
| `systemLandscape`, `systemContext x`, `container x`, `component x` in `views` | the view drawn (the first one); `autolayout lr` lays it out left to right |
| `element "Tag" { shape Cylinder }` in `styles` | a tag's shape: `Cylinder`, `Pipe`, `Person` |

**What a view shows.** A context view: people and software systems. A
container view: the system's containers inside a boundary, with the people
and systems around it. A component view: the container's components
inside its boundary, with the containers, people and systems around it.
Relationships between elements the view does not show are drawn between
their nearest shown parents (a container's call to another system becomes
the system's), once.

**Tags.** `External` (or `location External`) draws an external element;
`Database` a cylinder, `Queue` a pipe. Deployment and dynamic views,
`!docs`, `!adrs`, `!include` and scripts are not read.
