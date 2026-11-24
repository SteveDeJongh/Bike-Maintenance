import { describe, expect, it } from 'vitest'
import { overflowEdges } from './horizontalOverflow'

describe('overflowEdges', () => {
  it('reports no overflow when the content fits', () => {
    expect(overflowEdges({ scrollLeft: 0, scrollWidth: 800, clientWidth: 800 })).toEqual({
      overflowing: false,
      atStart: true,
      atEnd: true,
    })
  })

  it('hides only the right edge at the start of an overflowing track', () => {
    expect(overflowEdges({ scrollLeft: 0, scrollWidth: 1000, clientWidth: 400 })).toEqual({
      overflowing: true,
      atStart: true,
      atEnd: false,
    })
  })

  it('hides both edges mid-scroll', () => {
    expect(overflowEdges({ scrollLeft: 300, scrollWidth: 1000, clientWidth: 400 })).toEqual({
      overflowing: true,
      atStart: false,
      atEnd: false,
    })
  })

  it('hides only the left edge at the end', () => {
    expect(overflowEdges({ scrollLeft: 600, scrollWidth: 1000, clientWidth: 400 }).atEnd).toBe(true)
  })

  it('absorbs a pixel of sub-pixel slack at both ends', () => {
    expect(overflowEdges({ scrollLeft: 0.6, scrollWidth: 1000, clientWidth: 400 }).atStart).toBe(true)
    expect(overflowEdges({ scrollLeft: 599.4, scrollWidth: 1000, clientWidth: 400 }).atEnd).toBe(true)
    expect(overflowEdges({ scrollLeft: 0, scrollWidth: 400.8, clientWidth: 400 }).overflowing).toBe(false)
  })
})
