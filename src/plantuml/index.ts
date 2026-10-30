/**
 * PlantUML: which diagram a `@startuml` source holds, and its model.
 *
 * PlantUML has no header keyword per diagram type: it recognises the type
 * from what the statements look like. So does this reader — activity first
 * (its `:action;` lines are unmistakable), then the diagrams of elements
 * (use case, component, deployment: brackets, parentheses and element
 * keywords), and sequence when only participants and messages are there.
 */
import { DiagramError } from '../core/errors'
import type { Statement } from '../core/scanner'
import type { Flowchart } from '../diagrams/flowchart/parser'
import type { SequenceDiagram } from '../diagrams/sequence/parser'
import { parsePlantUmlActivity } from './activity'
import { parsePlantUmlDescription } from './description'
import { parsePlantUmlSequence } from './sequence'
import { readPlantUml, type PlantUmlSource } from './source'

export { isPlantUml } from './source'

/** The PlantUML diagram kinds this package reads. */
export type PlantUmlKind = 'sequence' | 'activity' | 'description'

export type PlantUmlModel = SequenceDiagram | Flowchart

/** Unmistakably activity: actions, start/stop, structured blocks, swimlanes (not `end`, which sequence blocks use too). */
const ACTIVITY = /^((#\S+\s*)?:.*|start|stop|if\s*\(.*|while\s*\(.*|repeat\b.*|fork\b.*|split\b.*|partition\b.*|\|[^|]+\|.*)$/i
const STATE_OR_CLASS = /^(\[\*\]|state\s|(abstract\s+)?class\s|enum\s|annotation\s|object\s|map\s|json\s|entity\s.*\{|interface\s+\S+\s*\{)/i
const DESCRIPTION =
  /^(usecase|component|interface|node|cloud|package|rectangle|folder|frame|artifact|storage|card|file|agent|stack|hexagon|person|label|circle|port|portin|portout)\b|^\[[^\]]+\]|^\([^)]+\)|^:[^:]+:(\s|$)|^actor\/?\s|^"[^"]*"\s+as\s+\(|\(\s*[^)]+\)\s*(-|\.)|(-|\.)>?\s*\(\s*[^)]+\)/i
/** Only sequence diagrams have these (boundary, control, entity, collections are elements of deployment diagrams too). */
const SEQUENCE = /^((participant|activate|deactivate|autonumber|return|alt|opt|loop|par|break|critical|group)\b|ref\s+over\b|==|\.\.\.|\|\|)/i

/** The kind of a `@startuml` diagram, recognised from its statements. */
export function plantUmlKind(list: readonly Statement[]): PlantUmlKind | 'state-or-class' {
  if (list.some((s) => ACTIVITY.test(s.text) && !/^:[^:]+:(\s|$)/.test(s.text))) return 'activity'
  if (list.some((s) => SEQUENCE.test(s.text))) return 'sequence'
  if (list.some((s) => STATE_OR_CLASS.test(s.text))) return 'state-or-class'
  if (list.some((s) => DESCRIPTION.test(s.text))) return 'description'
  return 'sequence'
}

export interface ParsedPlantUml {
  kind: PlantUmlKind
  model: PlantUmlModel
}

export function parsePlantUml(source: string): ParsedPlantUml {
  const src: PlantUmlSource = readPlantUml(source)
  if (src.frame !== 'uml') {
    throw new DiagramError(`PlantUML "@start${src.frame}" diagrams are not supported yet`, 1, 1, 'Supported: @startuml sequence, use case, component, deployment and activity diagrams.')
  }
  if (src.statements.length === 0) throw new DiagramError('The diagram is empty', 0, 0)
  const kind = plantUmlKind(src.statements)
  switch (kind) {
    case 'sequence':
      return { kind, model: parsePlantUmlSequence(src) }
    case 'activity':
      return { kind, model: parsePlantUmlActivity(src) }
    case 'description':
      return { kind, model: parsePlantUmlDescription(src) }
    default: {
      const s = src.statements.find((x) => STATE_OR_CLASS.test(x.text))!
      throw new DiagramError('PlantUML class, object and state diagrams are not supported yet', s.line, s.column, 'Supported: sequence, use case, component, deployment and activity diagrams.')
    }
  }
}
