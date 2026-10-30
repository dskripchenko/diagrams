/**
 * Sequence diagrams: the layout.
 *
 * Two passes. The horizontal one places the participants: each gap is wide
 * enough for its neighbours' boxes, and for the widest message or note that
 * has to fit between any two participants — a constraint per pair, solved in
 * one sweep because every constraint points left to right. The vertical one
 * walks the events top to bottom, handing each its band of height, and
 * records geometry as it goes: arrows, notes, activations, block frames.
 *
 * Nothing here produces SVG; the result is plain numbers for the renderer.
 */
import { BASE_FONT } from '../../core/theme'
import {
  isEmptyLabel,
  measureLabel,
  parseLabel,
  wrapLabel,
  type FontSpec,
  type MeasuredLabel,
  type TextMeasurer,
} from '../../core/text'
import type {
  ArrowHead,
  BlockKind,
  LineStyle,
  Participant,
  ParticipantKind,
  SequenceDiagram,
} from './parser'

export const TAB_FONT: FontSpec = { ...BASE_FONT, size: 13, weight: 'bold' }
export const GUARD_FONT: FontSpec = { ...BASE_FONT, size: 13 }
export const TITLE_FONT: FontSpec = { ...BASE_FONT, size: 18, weight: 'bold' }

const ACTOR_PAD_X = 16
const ACTOR_PAD_Y = 10
const ACTOR_MIN_WIDTH = 90
const ACTOR_MIN_HEIGHT = 40
/** The stick figure, head to feet. */
export const FIGURE_HEIGHT = 34
const GAP = 40
const BOX_GAP = 24
const MESSAGE_MARGIN = 28
const NUMBER_SPACE = 20
const NOTE_PAD = 8
const NOTE_WRAP = 240
const NOTE_OFFSET = 12
export const ACTIVATION_WIDTH = 10
const ACTIVATION_STEP = 6
export const SELF_WIDTH = 34
const SELF_HEIGHT = 20
const FRAME_PAD = 10
const FRAME_ACTOR_MARGIN = 18
export const TAB_HEIGHT = 20
const GROUP_PAD = 12

export interface ActorGeom {
  id: string
  kind: ParticipantKind
  label: MeasuredLabel
  /** Centre. */
  x: number
  top: number
  width: number
  height: number
}

export interface LifelineGeom {
  x: number
  y1: number
  y2: number
}

export interface MessageGeom {
  x1: number
  x2: number
  /** The arrow's y; for a self message, the top of the loop. */
  y: number
  self: boolean
  /** Self messages: the bottom of the loop and its right edge. */
  y2: number
  loopRight: number
  line: LineStyle
  head: ArrowHead
  bidirectional: boolean
  label: MeasuredLabel | null
  labelX: number
  labelY: number
  anchor: 'middle' | 'start'
  number?: number
}

export interface NoteGeom {
  left: number
  top: number
  width: number
  height: number
  label: MeasuredLabel
}

export interface ActivationGeom {
  left: number
  top: number
  bottom: number
}

export interface FrameSection {
  y: number
  guard: MeasuredLabel | null
}

export interface FrameGeom {
  block: BlockKind
  left: number
  right: number
  top: number
  bottom: number
  tab: MeasuredLabel | null
  tabWidth: number
  guard: MeasuredLabel | null
  sections: FrameSection[]
  color?: string
}

/** A `== text ==` rule: drawn across the diagram's full width. */
export interface DividerGeom {
  y: number
  label: MeasuredLabel | null
}

/** A `...` delay: its text centred in the gap. */
export interface DelayGeom {
  y: number
  label: MeasuredLabel | null
}

export interface GroupGeom {
  left: number
  right: number
  top: number
  bottom: number
  color?: string
  label: MeasuredLabel | null
}

export interface SequenceLayout {
  width: number
  height: number
  /** Added to every x of the geometry below (not to the title). */
  offsetX: number
  title: { label: MeasuredLabel; x: number; y: number } | null
  groups: GroupGeom[]
  rects: FrameGeom[]
  frames: FrameGeom[]
  lifelines: LifelineGeom[]
  activations: ActivationGeom[]
  messages: MessageGeom[]
  notes: NoteGeom[]
  actors: ActorGeom[]
  crosses: { x: number; y: number }[]
  dividers: DividerGeom[]
  delays: DelayGeom[]
  /** The x range dividers span, in the geometry's coordinates. */
  span: { left: number; right: number }
}

/** Participants in drawing order: members of one box kept together. */
function ordered(diagram: SequenceDiagram): Participant[] {
  const out: Participant[] = []
  const seen = new Set<Participant>()
  for (const p of diagram.participants) {
    if (seen.has(p)) continue
    if (p.box === undefined) {
      out.push(p)
      seen.add(p)
      continue
    }
    for (const member of diagram.participants) {
      if (member.box === p.box && !seen.has(member)) {
        out.push(member)
        seen.add(member)
      }
    }
  }
  return out
}

interface OpenActivation {
  top: number
  level: number
}

interface OpenFrame {
  frame: FrameGeom
  min: number
  max: number
}

export function layoutSequence(diagram: SequenceDiagram, measure: TextMeasurer): SequenceLayout {
  const participants = ordered(diagram)
  const index = new Map(participants.map((p, i) => [p.id, i]))
  const idx = (id: string) => index.get(id)!

  // --- Sizes ---------------------------------------------------------------
  const labels = participants.map((p) => measureLabel(parseLabel(p.label), BASE_FONT, measure))
  // Actors and the icon kinds draw a figure with the name under it.
  const figured = (p: Participant) => p.kind !== 'participant'
  const widths = participants.map((p, i) =>
    figured(p)
      ? Math.max(labels[i]!.width + 8, 50)
      : Math.max(labels[i]!.width + ACTOR_PAD_X * 2, ACTOR_MIN_WIDTH),
  )
  let rowHeight = ACTOR_MIN_HEIGHT
  participants.forEach((p, i) => {
    const h =
      figured(p) ? FIGURE_HEIGHT + 4 + labels[i]!.height : labels[i]!.height + ACTOR_PAD_Y * 2
    rowHeight = Math.max(rowHeight, h)
  })

  const eventLabels: (MeasuredLabel | null)[] = diagram.events.map((event) => {
    if (event.kind === 'message') {
      const label = parseLabel(event.text)
      return isEmptyLabel(label) ? null : measureLabel(label, BASE_FONT, measure)
    }
    if (event.kind === 'note') {
      return measureLabel(wrapLabel(parseLabel(event.text), NOTE_WRAP, BASE_FONT, measure), BASE_FONT, measure)
    }
    if ((event.kind === 'divider' || event.kind === 'delay') && event.text.trim() !== '') {
      return measureLabel(parseLabel(event.text), event.kind === 'divider' ? TAB_FONT : GUARD_FONT, measure)
    }
    return null
  })

  // --- Horizontal pass -----------------------------------------------------
  const need = new Map<string, number>()
  const require = (i: number, j: number, distance: number) => {
    if (i === j || i < 0 || j < 0 || i >= participants.length || j >= participants.length) return
    const a = Math.min(i, j)
    const b = Math.max(i, j)
    const key = `${a},${b}`
    need.set(key, Math.max(need.get(key) ?? 0, distance))
  }
  diagram.events.forEach((event, k) => {
    const label = eventLabels[k]
    if (event.kind === 'message') {
      const a = idx(event.from)
      const b = idx(event.to)
      const textWidth = (label?.width ?? 0) + (event.number !== undefined ? NUMBER_SPACE : 0)
      if (a === b) {
        require(a, a + 1, Math.max(textWidth + 28, SELF_WIDTH + 28))
      } else {
        require(a, b, textWidth + MESSAGE_MARGIN)
      }
    } else if (event.kind === 'note' && label) {
      const noteWidth = label.width + NOTE_PAD * 2
      const ids = event.actors.map(idx).sort((x, y) => x - y)
      const a = ids[0]!
      const b = ids[ids.length - 1]!
      if (event.placement === 'right') require(a, a + 1, noteWidth + NOTE_OFFSET + 12)
      else if (event.placement === 'left') require(a - 1, a, noteWidth + NOTE_OFFSET + 12)
      else if (a === b) {
        require(a - 1, a, noteWidth / 2 + 16)
        require(a, a + 1, noteWidth / 2 + 16)
      } else {
        require(a, b, noteWidth - NOTE_OFFSET * 2)
      }
    }
  })

  const xs: number[] = []
  participants.forEach((p, j) => {
    if (j === 0) {
      xs.push(widths[0]! / 2)
      return
    }
    const prev = participants[j - 1]!
    const boxed = (prev.box !== undefined || p.box !== undefined) && prev.box !== p.box
    let x = xs[j - 1]! + widths[j - 1]! / 2 + GAP + (boxed ? BOX_GAP : 0) + widths[j]! / 2
    for (let i = 0; i < j; i++) {
      const d = need.get(`${i},${j}`)
      if (d !== undefined) x = Math.max(x, xs[i]! + d)
    }
    xs.push(x)
  })
  const xOf = (id: string) => xs[idx(id)]!
  const widthOf = (id: string) => widths[idx(id)]!

  // --- Vertical pass -------------------------------------------------------
  let y = 0
  let title: SequenceLayout['title'] = null
  if (diagram.title) {
    const label = measureLabel(parseLabel(diagram.title), TITLE_FONT, measure)
    title = { label, x: 0, y: label.height / 2 }
    y = label.height + 14
  }
  const groupTop = y
  if (diagram.boxes.length > 0) {
    const labelHeight = Math.max(
      0,
      ...diagram.boxes.map((b) => (b.label ? measureLabel(parseLabel(b.label), BASE_FONT, measure).height : 0)),
    )
    y += 8 + (labelHeight > 0 ? labelHeight + 6 : 0)
  }
  const actorsTop = y

  const actors: ActorGeom[] = []
  const lifelineStart = new Map<string, number>()
  const lifelineEnd = new Map<string, number>()
  const pendingCreate = new Set<string>()
  participants.forEach((p, i) => {
    if (p.created) {
      pendingCreate.add(p.id)
      return
    }
    actors.push({ id: p.id, kind: p.kind, label: labels[i]!, x: xs[i]!, top: actorsTop, width: widths[i]!, height: rowHeight })
    lifelineStart.set(p.id, actorsTop + rowHeight)
  })
  y = actorsTop + rowHeight + 10

  const stacks = new Map<string, OpenActivation[]>()
  const activations: ActivationGeom[] = []
  const messages: MessageGeom[] = []
  const notes: NoteGeom[] = []
  const frames: FrameGeom[] = []
  const rects: FrameGeom[] = []
  const open: OpenFrame[] = []
  const crosses: { x: number; y: number }[] = []
  const dividers: DividerGeom[] = []
  const delays: DelayGeom[] = []
  const pendingDestroy = new Set<string>()
  let lastMessageY: number | null = null

  const extend = (min: number, max: number) => {
    for (const f of open) {
      f.min = Math.min(f.min, min)
      f.max = Math.max(f.max, max)
    }
  }
  const involve = (id: string) => extend(xOf(id) - FRAME_ACTOR_MARGIN, xOf(id) + FRAME_ACTOR_MARGIN)

  const stackOf = (id: string) => {
    let s = stacks.get(id)
    if (!s) {
      s = []
      stacks.set(id, s)
    }
    return s
  }
  const activationLeft = (id: string, level: number) => xOf(id) - ACTIVATION_WIDTH / 2 + level * ACTIVATION_STEP
  /** The edge of the participant's innermost activation on the given side, or its lifeline. */
  const edge = (id: string, side: 1 | -1) => {
    const s = stackOf(id)
    const top = s[s.length - 1]
    if (!top) return xOf(id)
    const left = activationLeft(id, top.level)
    return side > 0 ? left + ACTIVATION_WIDTH : left
  }
  const activate = (id: string, at: number) => {
    const s = stackOf(id)
    s.push({ top: at, level: s.length })
  }
  const deactivate = (id: string, at: number) => {
    const entry = stackOf(id).pop()
    if (!entry) return
    activations.push({
      left: activationLeft(id, entry.level),
      top: entry.top,
      bottom: Math.max(at, entry.top + 8),
    })
  }
  const place = (id: string, centerY: number) => {
    pendingCreate.delete(id)
    const i = idx(id)
    const p = participants[i]!
    actors.push({
      id,
      kind: p.kind,
      label: labels[i]!,
      x: xs[i]!,
      top: centerY - rowHeight / 2,
      width: widths[i]!,
      height: rowHeight,
    })
    lifelineStart.set(id, centerY + rowHeight / 2)
    extend(xs[i]! - widths[i]! / 2, xs[i]! + widths[i]! / 2)
  }
  /** A created participant used by something other than a message: drawn first, on its own band. */
  const placeBeforeUse = (ids: readonly string[]) => {
    const waiting = ids.filter((id) => pendingCreate.has(id))
    if (waiting.length === 0) return
    for (const id of waiting) place(id, y + rowHeight / 2)
    y += rowHeight + 10
  }
  const destroyAt = (id: string, at: number) => {
    pendingDestroy.delete(id)
    while (stackOf(id).length > 0) deactivate(id, at)
    lifelineEnd.set(id, at)
    crosses.push({ x: xOf(id), y: at })
  }

  diagram.events.forEach((event, k) => {
    const label = eventLabels[k] ?? null
    switch (event.kind) {
      case 'message': {
        const textHeight = label?.height ?? 0
        const textTop = y + 6
        if (event.from === event.to) {
          placeBeforeUse([event.from])
          const x = xOf(event.from)
          const x1 = edge(event.from, 1)
          const loopTop = label ? y + 6 + textHeight + 4 : y + 12
          const loopBottom = loopTop + SELF_HEIGHT
          if (event.deactivateSource) deactivate(event.from, loopTop)
          if (event.activateTarget) activate(event.to, loopBottom)
          const x2 = edge(event.to, 1)
          const loopRight = Math.max(x1, x2) + SELF_WIDTH
          const labelX = x1 + 4 + (event.number !== undefined ? 12 : 0)
          messages.push({
            x1,
            x2,
            y: loopTop,
            y2: loopBottom,
            self: true,
            loopRight,
            line: event.line,
            head: event.head,
            bidirectional: event.bidirectional,
            label,
            labelX,
            labelY: y + 6 + textHeight / 2,
            anchor: 'start',
            number: event.number,
          })
          extend(x - FRAME_ACTOR_MARGIN, Math.max(loopRight, labelX + (label?.width ?? 0)))
          if (pendingDestroy.has(event.from)) destroyAt(event.from, loopBottom)
          y = loopBottom + 10
          lastMessageY = loopBottom
          break
        }

        const createSource = pendingCreate.has(event.from)
        const createTarget = pendingCreate.has(event.to)
        let arrowY = label ? textTop + textHeight + 4 : y + 14
        if (createSource || createTarget) arrowY = Math.max(arrowY, y + rowHeight / 2 + 4)
        if (createSource) place(event.from, arrowY)
        if (createTarget) place(event.to, arrowY)

        const dir: 1 | -1 = xOf(event.to) > xOf(event.from) ? 1 : -1
        const x1 = createSource ? xOf(event.from) + (dir * widthOf(event.from)) / 2 : edge(event.from, dir)
        if (event.deactivateSource) deactivate(event.from, arrowY)
        if (event.activateTarget) activate(event.to, arrowY)
        const x2 = createTarget
          ? xOf(event.to) - (dir * widthOf(event.to)) / 2
          : edge(event.to, dir === 1 ? -1 : 1)

        messages.push({
          x1,
          x2,
          y: arrowY,
          y2: arrowY,
          self: false,
          loopRight: 0,
          line: event.line,
          head: event.head,
          bidirectional: event.bidirectional,
          label,
          labelX: (x1 + x2) / 2,
          labelY: arrowY - 4 - textHeight / 2,
          anchor: 'middle',
          number: event.number,
        })
        involve(event.from)
        involve(event.to)
        if (label) extend((x1 + x2) / 2 - label.width / 2, (x1 + x2) / 2 + label.width / 2)

        for (const id of [event.from, event.to]) {
          if (pendingDestroy.has(id)) destroyAt(id, arrowY)
        }
        y = arrowY + 10
        if (createSource || createTarget) y = Math.max(y, arrowY + rowHeight / 2 + 10)
        lastMessageY = arrowY
        break
      }

      case 'note': {
        if (!label) break
        placeBeforeUse(event.actors)
        const noteWidth = label.width + NOTE_PAD * 2
        const noteHeight = label.height + NOTE_PAD * 2
        const top = y + 6
        const xa = Math.min(...event.actors.map(xOf))
        const xb = Math.max(...event.actors.map(xOf))
        let left: number
        let width = noteWidth
        if (event.placement === 'right') left = xa + NOTE_OFFSET
        else if (event.placement === 'left') left = xa - NOTE_OFFSET - noteWidth
        else {
          width = Math.max(noteWidth, xb - xa + (xa === xb ? 0 : NOTE_OFFSET * 2 + 8))
          left = (xa + xb) / 2 - width / 2
        }
        notes.push({ left, top, width, height: noteHeight, label })
        for (const id of event.actors) involve(id)
        extend(left, left + width)
        y = top + noteHeight + 8
        lastMessageY = null
        break
      }

      case 'activate': {
        placeBeforeUse([event.actor])
        activate(event.actor, lastMessageY ?? y)
        involve(event.actor)
        if (lastMessageY === null) y += 4
        break
      }

      case 'deactivate': {
        deactivate(event.actor, lastMessageY ?? y)
        if (lastMessageY === null) y += 4
        break
      }

      case 'destroy': {
        pendingDestroy.add(event.actor)
        break
      }

      case 'divider': {
        y += 10
        dividers.push({ y: y + (label?.height ?? 14) / 2, label })
        y += (label?.height ?? 14) + 10
        lastMessageY = null
        break
      }

      case 'delay': {
        const h = Math.max(30, (label?.height ?? 0) + 16)
        delays.push({ y: y + h / 2, label })
        y += h
        lastMessageY = null
        break
      }

      case 'space': {
        y += event.height
        lastMessageY = null
        break
      }

      case 'block-start': {
        if (event.block === 'rect') {
          y += 6
          const frame: FrameGeom = {
            block: 'rect',
            left: 0,
            right: 0,
            top: y,
            bottom: 0,
            tab: null,
            tabWidth: 0,
            guard: null,
            sections: [],
            color: event.color,
          }
          open.push({ frame, min: Infinity, max: -Infinity })
          y += 6
        } else {
          y += 8
          // A group's text is its tab; the other blocks show their keyword and the text as a guard.
          const group = event.block === 'group'
          const tab = measureLabel(parseLabel(group ? event.text || 'group' : event.block), TAB_FONT, measure)
          const guard = !group && event.text ? measureLabel(parseLabel(`[${event.text}]`), GUARD_FONT, measure) : null
          const frame: FrameGeom = {
            block: event.block,
            left: 0,
            right: 0,
            top: y,
            bottom: 0,
            tab,
            tabWidth: tab.width + 16,
            guard,
            sections: [],
          }
          open.push({ frame, min: Infinity, max: -Infinity })
          y += Math.max(TAB_HEIGHT, guard ? guard.height + 4 : 0) + 6
        }
        lastMessageY = null
        break
      }

      case 'block-section': {
        const current = open[open.length - 1]!
        y += 6
        const guard = event.text ? measureLabel(parseLabel(`[${event.text}]`), GUARD_FONT, measure) : null
        current.frame.sections.push({ y, guard })
        y += (guard ? guard.height + 4 : 0) + 6
        lastMessageY = null
        break
      }

      case 'block-end': {
        const current = open.pop()!
        const { frame } = current
        y += frame.block === 'rect' ? 6 : 8
        frame.bottom = y
        let min = current.min
        let max = current.max
        if (!Number.isFinite(min)) {
          min = xs[0]! - 40
          max = xs[0]! + 40
        }
        frame.left = min - FRAME_PAD
        frame.right = max + FRAME_PAD
        if (frame.block !== 'rect') {
          const guards = [frame.guard, ...frame.sections.map((s) => s.guard)]
          let needed = frame.tabWidth + (frame.guard ? frame.guard.width + 8 : 0) + 16
          for (const g of guards) if (g) needed = Math.max(needed, g.width + 24)
          if (frame.right - frame.left < needed) frame.right = frame.left + needed
          frames.push(frame)
        } else {
          rects.push(frame)
        }
        extend(frame.left, frame.right)
        y += frame.block === 'rect' ? 4 : 6
        lastMessageY = null
        break
      }
    }
  })

  // Whatever is still open runs to the bottom.
  for (const id of pendingCreate) placeBeforeUse([id])
  for (const id of pendingDestroy) destroyAt(id, y)
  for (const [id, s] of stacks) {
    while (s.length > 0) deactivate(id, y)
  }

  y += 12
  const bottomTop = y
  if (!diagram.hideFootbox) {
    participants.forEach((p, i) => {
      if (lifelineEnd.has(p.id)) return
      actors.push({ id: p.id, kind: p.kind, label: labels[i]!, x: xs[i]!, top: bottomTop, width: widths[i]!, height: rowHeight })
    })
  }
  let height = diagram.hideFootbox ? bottomTop : bottomTop + rowHeight

  const lifelines: LifelineGeom[] = participants.map((p, i) => ({
    x: xs[i]!,
    y1: lifelineStart.get(p.id) ?? bottomTop,
    y2: lifelineEnd.get(p.id) ?? bottomTop,
  }))

  const groups: GroupGeom[] = []
  if (diagram.boxes.length > 0) {
    height += 8
    diagram.boxes.forEach((box, b) => {
      const members = participants.map((p, i) => ({ p, i })).filter(({ p }) => p.box === b)
      if (members.length === 0) return
      let left = Math.min(...members.map(({ i }) => xs[i]! - widths[i]! / 2)) - GROUP_PAD
      let right = Math.max(...members.map(({ i }) => xs[i]! + widths[i]! / 2)) + GROUP_PAD
      const label = box.label ? measureLabel(parseLabel(box.label), BASE_FONT, measure) : null
      if (label && right - left < label.width + 16) {
        const grow = (label.width + 16 - (right - left)) / 2
        left -= grow
        right += grow
      }
      groups.push({ left, right, top: groupTop, bottom: height, color: box.color, label })
    })
  }

  // --- Bounds ----------------------------------------------------------------
  let minX = Infinity
  let maxX = -Infinity
  const span = (a: number, b: number) => {
    minX = Math.min(minX, a, b)
    maxX = Math.max(maxX, a, b)
  }
  for (const a of actors) span(a.x - a.width / 2, a.x + a.width / 2)
  for (const g of groups) span(g.left, g.right)
  for (const f of [...frames, ...rects]) span(f.left, f.right)
  for (const n of notes) span(n.left, n.left + n.width)
  // A divider's or delay's text is centred on the diagram: the diagram is at least that wide.
  const widest = Math.max(0, ...[...dividers, ...delays].map((d) => (d.label ? d.label.width + 40 : 0)))
  if (maxX - minX < widest) {
    const grow = (widest - (maxX - minX)) / 2
    minX -= grow
    maxX += grow
  }
  for (const m of messages) {
    span(m.x1, m.x2)
    if (m.self) span(m.loopRight, m.labelX + (m.label?.width ?? 0))
    else if (m.label) span(m.labelX - m.label.width / 2, m.labelX + m.label.width / 2)
    if (m.number !== undefined) span(m.x1 - 10, m.x1 + 10)
  }

  let width = maxX - minX
  let offsetX = -minX
  if (title) {
    if (title.label.width > width) {
      offsetX += (title.label.width - width) / 2
      width = title.label.width
    }
    title.x = width / 2
  }

  return {
    width,
    height,
    offsetX,
    title,
    groups,
    rects,
    frames,
    lifelines,
    activations,
    messages,
    notes,
    actors,
    crosses,
    dividers,
    delays,
    span: { left: minX, right: maxX },
  }
}
