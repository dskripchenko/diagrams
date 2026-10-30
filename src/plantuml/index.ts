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
import type { ClassDiagram } from '../diagrams/class/parser'
import type { ErDiagram } from '../diagrams/er/parser'
import type { Flowchart } from '../diagrams/flowchart/parser'
import type { SequenceDiagram } from '../diagrams/sequence/parser'
import type { StateDiagram } from '../diagrams/state/parser'
import { parsePlantUmlActivity } from './activity'
import { parsePlantUmlClass } from './class'
import { parsePlantUmlDescription } from './description'
import { looksLikeEr, parsePlantUmlEr } from './er'
import { parsePlantUmlSequence } from './sequence'
import { parsePlantUmlState } from './state'
import { readPlantUml, type PlantUmlSource } from './source'

export { isPlantUml } from './source'

/** The PlantUML diagram kinds this package reads. */
export type PlantUmlKind = 'sequence' | 'activity' | 'description' | 'class' | 'state' | 'er'

export type PlantUmlModel = SequenceDiagram | Flowchart | ClassDiagram | StateDiagram | ErDiagram

/** The model type each kind is drawn with. */
export const PLANTUML_MODELS: Record<PlantUmlKind, 'sequence' | 'flowchart' | 'class' | 'state' | 'er'> = {
  sequence: 'sequence',
  activity: 'flowchart',
  description: 'flowchart',
  class: 'class',
  state: 'state',
  er: 'er',
}

/** Unmistakably activity: actions, start/stop, structured blocks, swimlanes (not `end`, which sequence blocks use too). */
const ACTIVITY = /^((#\S+\s*)?:.*|start|stop|if\s*\(.*|while\s*\(.*|repeat\b.*|fork\b.*|split\b.*|partition\b.*|\|[^|]+\|.*)$/i
const STATE = /^\[\*\]|\[\*\]$|^state\s/i
const CLASS = /^((abstract\s+)?class|abstract|enum|annotation|struct|record|exception|protocol|metaclass|object|map)\s|^interface\s+\S+.*\{$/i
/** Inheritance arrows: class diagrams when nothing marks the elements of a component diagram. */
const CLASS_ARROW = /<\|--|--\|>|<\|\.\.|\.\.\|>/
const DESCRIPTION =
  /^(usecase|component|interface|node|cloud|package|rectangle|folder|frame|artifact|storage|card|file|agent|stack|hexagon|person|label|circle|port|portin|portout)\b|^\[[^\]]+\]|^\([^)]+\)|^:[^:]+:(\s|$)|^actor\/?\s|^"[^"]*"\s+as\s+\(|\(\s*[^)]+\)\s*(-|\.)|(-|\.)>?\s*\(\s*[^)]+\)/i
/** Only sequence diagrams have these (boundary, control, entity, collections are elements of deployment diagrams too). */
const SEQUENCE = /^((participant|activate|deactivate|autonumber|return|alt|opt|loop|par|break|critical|group)\b|ref\s+over\b|==|\.\.\.|\|\|)/i

/** The kind of a `@startuml` diagram, recognised from its statements. */
export function plantUmlKind(list: readonly Statement[]): PlantUmlKind {
  if (list.some((s) => ACTIVITY.test(s.text) && !/^:[^:]+:(\s|$)/.test(s.text))) return 'activity'
  if (list.some((s) => SEQUENCE.test(s.text))) return 'sequence'
  if (list.some((s) => STATE.test(s.text))) return 'state'
  if (list.some((s) => CLASS.test(s.text))) return 'class'
  if (looksLikeEr(list)) return 'er'
  if (list.some((s) => DESCRIPTION.test(s.text))) return 'description'
  if (list.some((s) => CLASS_ARROW.test(s.text))) return 'class'
  return 'sequence'
}

export interface ParsedPlantUml {
  kind: PlantUmlKind
  model: PlantUmlModel
}

export function parsePlantUml(source: string): ParsedPlantUml {
  const src: PlantUmlSource = readPlantUml(source)
  if (src.frame !== 'uml') {
    throw new DiagramError(`PlantUML "@start${src.frame}" diagrams are not supported yet`, 1, 1, 'Supported: @startuml sequence, use case, component, deployment, activity, class, object, state and ER diagrams.')
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
    case 'class':
      return { kind, model: parsePlantUmlClass(src) }
    case 'state':
      return { kind, model: parsePlantUmlState(src) }
    case 'er':
      return { kind, model: parsePlantUmlEr(src) }
  }
}
