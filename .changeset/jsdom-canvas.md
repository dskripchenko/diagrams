---
'@dskripchenko/diagrams': patch
---

Under jsdom (test runners) the glyph-table measurer is used straight away instead of probing a canvas, which jsdom reports as "Not implemented".
