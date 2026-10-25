/**
 * Numeric axes: "nice" ranges, tick positions and how the numbers print.
 *
 * Ticks fall on multiples of 1, 2, 2.5 or 5 times a power of ten — the steps
 * a reader can add up in their head — and print with exactly as many
 * decimals as the step needs, so an axis never reads 0.30000000000000004.
 */

export interface Ticks {
  min: number
  max: number
  step: number
  values: number[]
}

const STEPS = [1, 2, 2.5, 5, 10]

/** The smallest nice step that cuts `span` into at most `count` intervals. */
export function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count)
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of STEPS) {
    if (m * magnitude >= raw * (1 - 1e-9)) return m * magnitude
  }
  return 10 * magnitude
}

/** Decimals needed to print multiples of `step` exactly. */
export function decimalsFor(step: number): number {
  for (let d = 0; d < 12; d++) {
    const scaled = step * Math.pow(10, d)
    if (Math.abs(scaled - Math.round(scaled)) < 1e-6 * Math.max(1, scaled)) return d
  }
  return 12
}

function snap(value: number, decimals: number): number {
  return Number(value.toFixed(decimals))
}

/**
 * Ticks over `[min, max]`. With `nice`, the range grows outward to whole
 * steps (an automatic range); otherwise the range is kept as written and
 * ticks fall on the steps inside it.
 */
export function ticks(min: number, max: number, count: number, nice: boolean): Ticks {
  let lo = min
  let hi = max
  if (hi <= lo) {
    // One value only: give it room on both sides.
    const pad = lo === 0 ? 1 : Math.abs(lo) / 2
    lo -= pad
    hi += pad
  }
  const step = niceStep(hi - lo, count)
  const decimals = decimalsFor(step)
  if (nice) {
    lo = snap(Math.floor(lo / step + 1e-9) * step, decimals)
    hi = snap(Math.ceil(hi / step - 1e-9) * step, decimals)
  }
  const values: number[] = []
  const first = Math.ceil(lo / step - 1e-9)
  const last = Math.floor(hi / step + 1e-9)
  for (let i = first; i <= last && values.length <= 1000; i++) values.push(snap(i * step, decimals))
  return { min: lo, max: hi, step, values }
}

const SUFFIXES: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'k'],
]

/**
 * A formatter for one axis: all its labels share a unit and a number of
 * decimals. Axes reaching ten thousand print thousands as `k`, millions as
 * `M` (and so on), as long as the step is a whole number of that unit's tenths.
 */
export function axisFormatter(values: readonly number[], step: number): (value: number) => string {
  const largest = Math.max(0, ...values.map(Math.abs))
  let divisor = 1
  let suffix = ''
  for (const [d, s] of SUFFIXES) {
    if (largest >= d * 10 && step >= d / 10) {
      divisor = d
      suffix = s
      break
    }
  }
  const decimals = decimalsFor(step / divisor)
  // Zero needs neither a unit nor decimals.
  return (value) => (value === 0 ? '0' : formatNumber(value / divisor, decimals) + suffix)
}

/** Fixed decimals, a real minus sign, no exponent notation. */
export function formatNumber(value: number, decimals: number): string {
  const fixed = Math.abs(value).toFixed(decimals)
  const negative = value < 0 && Number(fixed) !== 0
  return (negative ? '−' : '') + fixed
}
