---
'@dskripchenko/diagrams': minor
---

`renderCommitGraph(commits, options)` and `layoutCommitGraph(commits)`: the lane graph of a real git history (commits newest first, with their parents) as an SVG column whose rows line up with a list of commits — a lane per line of development, branches beside their base until they bend back in, merge commits as rings, the checked-out commit marked.
