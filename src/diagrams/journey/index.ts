/**
 * User journeys (customer journey maps).
 *
 *     journey
 *       title A working day
 *       section Go to work
 *         Make tea: 5: Me
 *         Do work: 1: Me, Cat
 *       section Go home
 *         Sit down: 5: Me
 *
 * Tasks run left to right under their sections; each has a score from 1 to
 * 5, drawn as a face that sits higher the better it is, and the actors who
 * take part, as coloured dots (the legend on the left says who is who).
 */
import { documentSvg, type RenderResult } from '../../core/document'
import { DiagramError } from '../../core/errors'
import { statements } from '../../core/scanner'
import { el, PathBuilder, type SvgElement } from '../../core/svg'
import { measureLabel, parseLabel, renderLabel, wrapLabel, type TextMeasurer } from '../../core/text'
import { BASE_FONT, paletteVar, v } from '../../core/theme'
import { accessibilityStatement, type Accessibility } from '../common'

export interface JourneyTask {
  name: string
  score: number
  actors: string[]
  section: string
}

export interface JourneyDiagram {
  type: 'journey'
  title?: string
  sections: string[]
  tasks: JourneyTask[]
  actors: string[]
  accessibility: Accessibility
}

export function parseJourney(source: string): JourneyDiagram {
  const list = statements(source)
  const head = list[0]
  if (!head || head.text !== 'journey') throw new DiagramError('A user journey starts with "journey"', head?.line ?? 1, 1)
  const d: JourneyDiagram = { type: 'journey', sections: [], tasks: [], actors: [], accessibility: {} }
  let section = ''
  for (let i = 1; i < list.length; i++) {
    const s = list[i]!
    const consumed = accessibilityStatement(list, i, d.accessibility)
    if (consumed > 0) {
      i += consumed - 1
      continue
    }
    let m = /^title\s+(.*)$/.exec(s.text)
    if (m) {
      d.title = m[1]!.trim()
      continue
    }
    m = /^section\s+(.*)$/.exec(s.text)
    if (m) {
      section = m[1]!.trim()
      d.sections.push(section)
      continue
    }
    m = /^([^:]+):\s*([0-9]+)\s*(?::\s*(.*))?$/.exec(s.text)
    if (!m) throw new DiagramError(`"${s.text}" is not a task`, s.line, s.column, 'Task name: 5: Actor, Other actor')
    const score = Number(m[2])
    if (score < 1 || score > 5) throw new DiagramError('A score is from 1 to 5', s.line, s.column + s.text.indexOf(m[2]!))
    const actors = (m[3] ?? '').split(',').map((a) => a.trim()).filter(Boolean)
    for (const a of actors) if (!d.actors.includes(a)) d.actors.push(a)
    d.tasks.push({ name: m[1]!.trim(), score, actors, section })
  }
  if (d.tasks.length === 0) throw new DiagramError('The journey has no tasks', 0, 0, 'section Morning\n  Make tea: 5: Me')
  return d
}

const TASK_WIDTH = 150
const TASK_GAP = 14
const CARD_HEIGHT = 64
const FACE_AREA = 120

/** A face for a score: a smile above 3, a frown below, a straight mouth at 3. */
function face(cx: number, cy: number, score: number): SvgElement {
  const mouth =
    score > 3
      ? new PathBuilder().moveTo(cx - 6, cy + 3).quadTo(cx, cy + 9, cx + 6, cy + 3)
      : score < 3
        ? new PathBuilder().moveTo(cx - 6, cy + 7).quadTo(cx, cy + 1, cx + 6, cy + 7)
        : new PathBuilder().moveTo(cx - 6, cy + 5).lineTo(cx + 6, cy + 5)
  return el('g', { class: `dg-journey-face dg-journey-score-${score}` }, [
    el('circle', { class: 'dg-journey-face-ring', cx, cy, r: 14 }),
    el('circle', { class: 'dg-journey-eye', cx: cx - 5, cy: cy - 4, r: 1.6 }),
    el('circle', { class: 'dg-journey-eye', cx: cx + 5, cy: cy - 4, r: 1.6 }),
    el('path', { class: 'dg-journey-mouth', d: mouth.toString() }),
  ])
}

export function renderJourney(d: JourneyDiagram, measure: TextMeasurer, id: string, title?: string): RenderResult {
  const actorLabels = d.actors.map((a) => measureLabel(parseLabel(a), BASE_FONT, measure))
  const legend = d.actors.length > 0 ? Math.max(...actorLabels.map((l) => l.width)) + 36 : 0
  const titleLabel = d.title ? measureLabel(parseLabel(d.title), { ...BASE_FONT, size: 18, weight: 'bold' }, measure) : null
  const top = titleLabel ? titleLabel.height + 14 : 0
  const left = legend + (legend > 0 ? 16 : 0)
  const x = (k: number) => left + k * (TASK_WIDTH + TASK_GAP)
  const body: SvgElement[] = []
  const width = x(d.tasks.length) - TASK_GAP
  if (titleLabel) body.push(renderLabel(titleLabel, width / 2, titleLabel.height / 2, { className: 'dg-title' }))

  // The legend: one coloured dot per actor.
  d.actors.forEach((a, k) => {
    const y = top + 40 + k * 24
    body.push(el('circle', { class: 'dg-journey-actor', cx: 10, cy: y, r: 7, style: `fill:${paletteVar(k)}` }))
    body.push(renderLabel(actorLabels[k]!, 24, y, { anchor: 'start', className: 'dg-journey-legend' }))
  })

  // Sections: a band over their tasks.
  const sectionTop = top
  const cardTop = sectionTop + 40
  const sectionNames = d.sections.length > 0 ? d.sections : ['']
  sectionNames.forEach((name, si) => {
    const tasks = d.tasks.filter((t) => t.section === name)
    if (tasks.length === 0) return
    const first = d.tasks.indexOf(tasks[0]!)
    const a = x(first)
    const b = x(first + tasks.length) - TASK_GAP
    if (name) {
      const l = measureLabel(wrapLabel(parseLabel(name), b - a - 12, { ...BASE_FONT, weight: 'bold' }, measure), { ...BASE_FONT, weight: 'bold' }, measure)
      body.push(el('rect', { class: 'dg-journey-section', x: a, y: sectionTop, width: b - a, height: 30, rx: 4, style: `fill:${paletteVar(si)}` }))
      body.push(renderLabel(l, (a + b) / 2, sectionTop + 15, { className: 'dg-journey-section-text' }))
    }
  })

  // Tasks: a card, the actors' dots on it, and a face below at the height of the score.
  d.tasks.forEach((t, i) => {
    const a = x(i)
    const label = measureLabel(wrapLabel(parseLabel(t.name), TASK_WIDTH - 16, BASE_FONT, measure), BASE_FONT, measure)
    const faceY = cardTop + CARD_HEIGHT + 24 + ((5 - t.score) / 4) * (FACE_AREA - 40)
    const cx = a + TASK_WIDTH / 2
    const parts: SvgElement[] = [
      el('line', { class: 'dg-journey-stem', x1: cx, y1: cardTop + CARD_HEIGHT, x2: cx, y2: cardTop + CARD_HEIGHT + FACE_AREA }),
      el('rect', { class: 'dg-journey-card', x: a, y: cardTop, width: TASK_WIDTH, height: CARD_HEIGHT, rx: 6 }),
      renderLabel(label, cx, cardTop + CARD_HEIGHT / 2 + 4, { className: 'dg-journey-task' }),
    ]
    t.actors.forEach((actor, j) => {
      parts.push(el('circle', { class: 'dg-journey-actor', cx: a + 12 + j * 14, cy: cardTop + 10, r: 5, style: `fill:${paletteVar(d.actors.indexOf(actor))}` }, [el('title', {}, [{ text: actor }])]))
    })
    parts.push(face(cx, faceY, t.score))
    body.push(el('g', { class: 'dg-journey-step', 'data-score': t.score }, parts))
  })

  const height = Math.max(cardTop + CARD_HEIGHT + FACE_AREA + 6, top + 40 + d.actors.length * 24)
  const r = `#${id}`
  const css = [
    `${r} .dg-title{fill:${v('--dg-text')};font-size:18px;font-weight:bold}`,
    `${r} .dg-journey-section{fill-opacity:0.25;stroke:none}`,
    `${r} .dg-journey-section-text{fill:${v('--dg-text')};font-weight:bold}`,
    `${r} .dg-journey-card{fill:${v('--dg-node-fill')};stroke:${v('--dg-node-stroke')};stroke-width:1.5px}`,
    `${r} .dg-journey-task{fill:${v('--dg-node-text')}}`,
    `${r} .dg-journey-legend{fill:${v('--dg-text')}}`,
    `${r} .dg-journey-stem{stroke:${v('--dg-grid')};stroke-width:1.5px;stroke-dasharray:4 3}`,
    `${r} .dg-journey-face-ring{fill:${v('--dg-journey-face')};stroke:${v('--dg-line')};stroke-width:1.5px}`,
    `${r} .dg-journey-score-1 .dg-journey-face-ring,${r} .dg-journey-score-2 .dg-journey-face-ring{fill:${v('--dg-journey-face-sad')}}`,
    `${r} .dg-journey-score-4 .dg-journey-face-ring,${r} .dg-journey-score-5 .dg-journey-face-ring{fill:${v('--dg-journey-face-happy')}}`,
    `${r} .dg-journey-eye{fill:${v('--dg-text')}}`,
    `${r} .dg-journey-mouth{fill:none;stroke:${v('--dg-text')};stroke-width:1.5px}`,
  ].join('')
  return documentSvg({
    id,
    type: 'journey',
    width,
    height,
    title: title ?? d.accessibility.title ?? d.title ?? 'User journey',
    description: d.accessibility.description,
    body,
    css,
  })
}
