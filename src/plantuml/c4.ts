/**
 * C4-PlantUML: diagrams written with the C4 library's macros (`Person`,
 * `System`, `Container`, `Rel`, boundaries…). Mermaid's C4 diagrams take
 * the same macros, so the statements go to its C4 parser; the level comes
 * from the library included (`!include <C4/C4_Container>`).
 *
 *     @startuml
 *     !include <C4/C4_Container>
 *     Person(user, "Customer")
 *     System_Boundary(shop, "Shop") {
 *       Container(web, "Web app", "React")
 *     }
 *     Rel(user, web, "Uses", "HTTPS")
 *     SHOW_LEGEND()
 *     @enduml
 *
 * Legends, sketch layout, tags and other presentation macros are skipped;
 * `Rel_Neighbor` and `Lay_*` hints become plain relations or nothing.
 */
import { parseC4, type C4Diagram } from '../diagrams/c4/parser'
import type { PlantUmlSource } from './source'
import { Translation } from './translate'

/** Presentation macros: the picture is the package's, these change nothing in the model. */
const SKIPPED = /^(SHOW_\w+|HIDE_\w+|LAYOUT_WITH_LEGEND|LAYOUT_AS_SKETCH|Add\w*Tag|Update\w*Tag|Update(Container|System|Enterprise)BoundaryStyle|SetPropertyHeader|WithoutPropertyHeader|AddProperty|Lay_\w+|SetSketchStyle|SET_SKETCH_STYLE|AddRelTag)\s*\(/

/** True when the statements use C4 macros. */
export function looksLikeC4(src: PlantUmlSource): boolean {
  return src.c4 !== undefined || src.statements.some((s) => /^(Person|System|Container|Component|Rel|BiRel|Boundary|System_Boundary|Container_Boundary|Enterprise_Boundary|Deployment_Node)(_\w+)?\s*\(/.test(s.text))
}

export function parsePlantUmlC4(src: PlantUmlSource): C4Diagram {
  const t = new Translation(src.c4 ?? 'C4Context')
  if (src.title) t.add(`title ${src.title.replace(/\n/g, ' ')}`, src.statements[0]!)
  for (const s of src.statements) {
    if (SKIPPED.test(s.text)) continue
    t.add(s.text.replace(/^(Bi)?Rel(_Back)?_Neighbor\s*\(/, (_, bi: string | undefined, back: string | undefined) => `${bi ?? ''}Rel${back ?? ''}(`), s)
  }
  return t.parse(parseC4)
}
