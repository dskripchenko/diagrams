/**
 * Dates for gantt charts, in UTC throughout.
 *
 * A chart drawn from the same text must come out the same on a server in
 * Frankfurt and a laptop in Vladivostok, so nothing here touches the local
 * time zone: a date without a time is midnight UTC, and times are UTC too.
 * Timestamps are plain milliseconds since the epoch.
 */

export const SECOND = 1000
export const MINUTE = 60 * SECOND
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
export const WEEK = 7 * DAY

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Weekday names as `excludes` and `weekend` spell them, to 0 = Sunday … 6 = Saturday. */
export const WEEKDAY_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  WEEKDAYS.map((name, index) => [name.toLowerCase(), index]),
)

// ---------------------------------------------------------------------------
// Parsing with a dateFormat
// ---------------------------------------------------------------------------

type Field = 'year' | 'year2' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'ms' | 'unix' | 'unixMs'

interface FormatToken {
  field?: Field
  pattern: string
  literal?: string
}

/*
 * The dayjs tokens Mermaid's `dateFormat` uses, longest first so `YYYY` is
 * not read as two `YY`. Tokens that name things (month and weekday names,
 * ordinals, AM/PM, zones) are refused rather than guessed at.
 */
const TOKENS: readonly [string, Field, string][] = [
  ['YYYY', 'year', '(\\d{4})'],
  ['SSS', 'ms', '(\\d{3})'],
  ['YY', 'year2', '(\\d{2})'],
  ['MM', 'month', '(\\d{2})'],
  ['DD', 'day', '(\\d{2})'],
  ['HH', 'hour', '(\\d{2})'],
  ['mm', 'minute', '(\\d{2})'],
  ['ss', 'second', '(\\d{2})'],
  ['M', 'month', '(\\d{1,2})'],
  ['D', 'day', '(\\d{1,2})'],
  ['H', 'hour', '(\\d{1,2})'],
  ['m', 'minute', '(\\d{1,2})'],
  ['s', 'second', '(\\d{1,2})'],
  ['X', 'unix', '(\\d+(?:\\.\\d+)?)'],
  ['x', 'unixMs', '(\\d+)'],
]

const UNSUPPORTED = ['MMMM', 'MMM', 'dddd', 'ddd', 'dd', 'Do', 'hh', 'A', 'a', 'ZZ', 'Z', 'Q', 'w', 'W', 'k', 'h', 'd']

export class DateFormatError extends Error {}

export interface DateFormat {
  source: string
  regex: RegExp
  fields: Field[]
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Compiles a dayjs-style format (`YYYY-MM-DD`, `DD.MM.YYYY HH:mm`, `X`).
 * Text in square brackets is literal, as in dayjs.
 *
 * @throws DateFormatError for a token this module does not read.
 */
export function compileFormat(format: string): DateFormat {
  const tokens: FormatToken[] = []
  let i = 0
  outer: while (i < format.length) {
    if (format[i] === '[') {
      const close = format.indexOf(']', i)
      if (close > i) {
        tokens.push({ pattern: escapeRegex(format.slice(i + 1, close)), literal: '' })
        i = close + 1
        continue
      }
    }
    for (const bad of UNSUPPORTED) {
      if (format.startsWith(bad, i)) {
        throw new DateFormatError(`The date token "${bad}" is not supported`)
      }
    }
    for (const [token, field, pattern] of TOKENS) {
      if (format.startsWith(token, i)) {
        tokens.push({ field, pattern })
        i += token.length
        continue outer
      }
    }
    tokens.push({ pattern: escapeRegex(format[i]!), literal: format[i] })
    i++
  }
  return {
    source: format,
    regex: new RegExp(`^${tokens.map((t) => t.pattern).join('')}$`),
    fields: tokens.filter((t) => t.field).map((t) => t.field!),
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** Parses `text` with a compiled format; null when it does not match or is not a real date. */
export function parseDate(text: string, format: DateFormat): number | null {
  const match = format.regex.exec(text.trim())
  if (!match) return null
  let year = 1970
  let month = 1
  let day = 1
  let hour = 0
  let minute = 0
  let second = 0
  let ms = 0
  for (let k = 0; k < format.fields.length; k++) {
    const raw = match[k + 1]!
    const value = Number(raw)
    switch (format.fields[k]) {
      case 'unix':
        return Math.round(value * 1000)
      case 'unixMs':
        return value
      case 'year':
        year = value
        break
      case 'year2':
        year = 2000 + value
        break
      case 'month':
        month = value
        break
      case 'day':
        day = value
        break
      case 'hour':
        hour = value
        break
      case 'minute':
        minute = value
        break
      case 'second':
        second = value
        break
      case 'ms':
        ms = value
        break
    }
  }
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month - 1)) return null
  if (hour > 23 || minute > 59 || second > 59) return null
  return Date.UTC(year, month - 1, day, hour, minute, second, ms)
}

// ---------------------------------------------------------------------------
// Durations
// ---------------------------------------------------------------------------

export interface Duration {
  amount: number
  unit: 'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'M' | 'y'
}

const DURATION = /^(\d+(?:\.\d+)?)(ms|[smhdwMy])$/

export function parseDuration(text: string): Duration | null {
  const m = DURATION.exec(text.trim())
  if (!m) return null
  return { amount: Number(m[1]), unit: m[2] as Duration['unit'] }
}

/**
 * Adds a duration. Months and years are calendar months and years (31 Jan
 * plus a month is the last day of February), everything else is exact time.
 */
export function addDuration(time: number, duration: Duration): number {
  const { amount, unit } = duration
  switch (unit) {
    case 'ms':
      return time + amount
    case 's':
      return time + amount * SECOND
    case 'm':
      return time + amount * MINUTE
    case 'h':
      return time + amount * HOUR
    case 'd':
      return time + amount * DAY
    case 'w':
      return time + amount * WEEK
    case 'M':
      return addMonths(time, amount)
    case 'y':
      return addMonths(time, amount * 12)
  }
}

export function addMonths(time: number, months: number): number {
  const whole = Math.trunc(months)
  const d = new Date(time)
  const target = d.getUTCMonth() + whole
  const year = d.getUTCFullYear() + Math.floor(target / 12)
  const month = ((target % 12) + 12) % 12
  const day = Math.min(d.getUTCDate(), daysInMonth(year, month))
  const base = Date.UTC(
    year,
    month,
    day,
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  )
  // A fractional month is counted as thirty days, as dayjs does.
  return base + (months - whole) * 30 * DAY
}

export function startOfDay(time: number): number {
  return Math.floor(time / DAY) * DAY
}

export function weekday(time: number): number {
  return new Date(time).getUTCDay()
}

/** `YYYY-MM-DD` of the UTC day, a stable key for "is this day excluded". */
export function dayKey(time: number): string {
  return new Date(startOfDay(time)).toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Formatting with strftime (axisFormat)
// ---------------------------------------------------------------------------

function pad(value: number, width: number, fill: string): string {
  const s = String(value)
  return s.length >= width ? s : fill.repeat(width - s.length) + s
}

const DIRECTIVES = 'aAbBdeHIjLmMpSuwyY%'

/**
 * Checks an `axisFormat` before it is used, so a mistake is reported at its
 * line rather than as odd axis labels.
 *
 * @returns the first unsupported directive, or null.
 */
export function unsupportedDirective(format: string): string | null {
  for (let i = 0; i < format.length; i++) {
    if (format[i] !== '%') continue
    let j = i + 1
    if ('-_0'.includes(format[j] ?? '')) j++
    const ch = format[j]
    if (!ch || !DIRECTIVES.includes(ch)) return format.slice(i, j + 1)
    i = j
  }
  return null
}

/**
 * Formats a timestamp with the d3/strftime subset Mermaid's `axisFormat`
 * uses: `%Y %y %m %d %e %H %I %M %S %L %p %j %a %A %b %B %w %u %%`, with
 * the `-` (no padding), `_` (space) and `0` (zero) flags.
 */
export function formatDate(time: number, format: string): string {
  const d = new Date(time)
  let out = ''
  for (let i = 0; i < format.length; i++) {
    const ch = format[i]!
    if (ch !== '%') {
      out += ch
      continue
    }
    let flag: string | null = null
    let directive = format[i + 1] ?? ''
    if ('-_0'.includes(directive) && directive !== '') {
      flag = directive
      directive = format[i + 2] ?? ''
      i++
    }
    i++
    const num = (value: number, width: number, defaultFill: string): string =>
      flag === '-' ? String(value) : pad(value, width, flag === '_' ? ' ' : flag === '0' ? '0' : defaultFill)
    switch (directive) {
      case 'Y':
        out += String(d.getUTCFullYear())
        break
      case 'y':
        out += num(d.getUTCFullYear() % 100, 2, '0')
        break
      case 'm':
        out += num(d.getUTCMonth() + 1, 2, '0')
        break
      case 'd':
        out += num(d.getUTCDate(), 2, '0')
        break
      case 'e':
        out += num(d.getUTCDate(), 2, ' ')
        break
      case 'H':
        out += num(d.getUTCHours(), 2, '0')
        break
      case 'I':
        out += num(d.getUTCHours() % 12 || 12, 2, '0')
        break
      case 'M':
        out += num(d.getUTCMinutes(), 2, '0')
        break
      case 'S':
        out += num(d.getUTCSeconds(), 2, '0')
        break
      case 'L':
        out += num(d.getUTCMilliseconds(), 3, '0')
        break
      case 'p':
        out += d.getUTCHours() < 12 ? 'AM' : 'PM'
        break
      case 'j': {
        const start = Date.UTC(d.getUTCFullYear(), 0, 1)
        out += num(Math.floor((startOfDay(time) - start) / DAY) + 1, 3, '0')
        break
      }
      case 'a':
        out += WEEKDAYS[d.getUTCDay()]!.slice(0, 3)
        break
      case 'A':
        out += WEEKDAYS[d.getUTCDay()]!
        break
      case 'b':
        out += MONTHS[d.getUTCMonth()]!.slice(0, 3)
        break
      case 'B':
        out += MONTHS[d.getUTCMonth()]!
        break
      case 'w':
        out += String(d.getUTCDay())
        break
      case 'u':
        out += String(d.getUTCDay() || 7)
        break
      case '%':
        out += '%'
        break
      default:
        out += `%${directive}`
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Ticks
// ---------------------------------------------------------------------------

export interface TickInterval {
  unit: 'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'M'
  step: number
}

const TICK_UNITS: Record<string, TickInterval['unit']> = {
  millisecond: 'ms',
  second: 's',
  minute: 'm',
  hour: 'h',
  day: 'd',
  week: 'w',
  month: 'M',
}

/** `tickInterval 1week` and the like; null when it does not read. */
export function parseTickInterval(text: string): TickInterval | null {
  const m = /^([1-9][0-9]*)(millisecond|second|minute|hour|day|week|month)$/.exec(text.trim())
  if (!m) return null
  return { step: Number(m[1]), unit: TICK_UNITS[m[2]!]! }
}

const FIXED: Record<string, number> = { ms: 1, s: SECOND, m: MINUTE, h: HOUR, d: DAY, w: WEEK }

/** Approximate length of an interval, for choosing one. */
export function intervalLength(interval: TickInterval): number {
  return interval.unit === 'M' ? interval.step * 30 * DAY : interval.step * FIXED[interval.unit]!
}

/**
 * Tick times within [from, to], aligned the way a reader expects: days at
 * midnight, weeks on Sunday (as d3 and Mermaid do), months on the first.
 */
export function ticks(from: number, to: number, interval: TickInterval, limit = 1000): number[] {
  const out: number[] = []
  if (interval.unit === 'M') {
    const d = new Date(from)
    let year = d.getUTCFullYear()
    let month = d.getUTCMonth()
    month -= month % interval.step
    let t = Date.UTC(year, month, 1)
    while (t <= to && out.length < limit) {
      if (t >= from) out.push(t)
      month += interval.step
      year += Math.floor(month / 12)
      month %= 12
      t = Date.UTC(year, month, 1)
    }
    return out
  }
  const length = FIXED[interval.unit]! * interval.step
  let t: number
  if (interval.unit === 'w') {
    const day = startOfDay(from)
    t = day - weekday(day) * DAY
  } else if (interval.unit === 'd') {
    t = startOfDay(from)
  } else {
    t = Math.floor(from / length) * length
  }
  while (t < from) t += length
  while (t <= to && out.length < limit) {
    out.push(t)
    t += length
  }
  return out
}

/** Candidate intervals for automatic ticks, finest first. */
export const AUTO_INTERVALS: readonly TickInterval[] = [
  { unit: 's', step: 1 },
  { unit: 's', step: 5 },
  { unit: 's', step: 15 },
  { unit: 's', step: 30 },
  { unit: 'm', step: 1 },
  { unit: 'm', step: 5 },
  { unit: 'm', step: 15 },
  { unit: 'm', step: 30 },
  { unit: 'h', step: 1 },
  { unit: 'h', step: 3 },
  { unit: 'h', step: 6 },
  { unit: 'h', step: 12 },
  { unit: 'd', step: 1 },
  { unit: 'd', step: 2 },
  { unit: 'w', step: 1 },
  { unit: 'w', step: 2 },
  { unit: 'M', step: 1 },
  { unit: 'M', step: 3 },
  { unit: 'M', step: 6 },
  { unit: 'M', step: 12 },
  { unit: 'M', step: 24 },
  { unit: 'M', step: 60 },
]
