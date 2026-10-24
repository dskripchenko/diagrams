// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { approximateMeasurer, defaultMeasurer } from '../src'

describe('under jsdom', () => {
  it('uses the glyph table without touching the canvas', () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    expect(defaultMeasurer()).toBe(approximateMeasurer)
    expect(spy).not.toHaveBeenCalled()
  })
})
