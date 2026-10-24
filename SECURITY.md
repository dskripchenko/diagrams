# Security policy

Diagrams are often written by someone other than the person viewing them —
in documentation, in tickets, in a CMS. The package is built so that a
diagram's text can never become active content in the viewer's page.

## What is guaranteed

- **No markup from text.** Every label, title and attribute value is escaped
  by the one SVG builder that produces the output. HTML in labels is shown as
  text; `<br>` is the only construct understood, as a line break.
- **No code execution.** Nothing from the diagram text is evaluated.
  `click … callback` is ignored; `%%{init}%%` directives are skipped.
- **Links are filtered.** `click … href` and gantt links accept only
  `http:`, `https:`, `mailto:`, relative addresses and anchors. Links opened
  in a new tab get `rel="noopener noreferrer"`.
- **Styles are filtered.** `style`, `classDef` and `linkStyle` accept a fixed
  list of properties with validated values (colours, lengths, numbers,
  keywords). Nothing that can load a resource — `url()`, `@import`,
  `expression()` — gets through.
- **Bounded work.** Flowcharts and state diagrams are limited to 500 nodes
  and 2000 edges; the layout's iterations are capped.

The SVG returned by `render` is therefore safe to insert with `innerHTML`
without a sanitiser. Tests feed script payloads through the labels of every
diagram type and check that none reaches the output as markup.

## Supported versions

The latest minor version of the current major receives security fixes.

## Reporting a vulnerability

Please report privately through GitHub's
[security advisories](https://github.com/dskripchenko/diagrams/security/advisories/new)
rather than a public issue. Include a diagram source that reproduces the
problem. You will get an answer within a few days.
