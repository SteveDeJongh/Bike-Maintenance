import { useCallback, useEffect, useState, type RefObject } from 'react'
import { overflowEdges } from '../utils/horizontalOverflow'

interface HorizontalOverflow {
  // False when everything fits -- the arrows hide.
  overflowing: boolean
  atStart: boolean
  atEnd: boolean
  // Smooth-scrolls by one child's width plus the track's gap.
  scrollByItem: (direction: -1 | 1) => void
}

// Tracks a horizontally scrolling track's overflow and position, via a
// ResizeObserver (the track or its contents changing size) plus a scroll
// listener (the edge maths is overflowEdges, utils/horizontalOverflow.ts).
// Used by the Home bike row and TileRow. resetKey
// re-runs the setup whenever the track or its children may have been
// replaced (e.g. the item count, or the track mounting after a layout
// switch).
export function useHorizontalOverflow(ref: RefObject<HTMLElement | null>, resetKey: string | number): HorizontalOverflow {
  const [state, setState] = useState({ overflowing: false, atStart: true, atEnd: true })

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const update = () => {
      const next = overflowEdges(element)
      setState((current) =>
        current.overflowing === next.overflowing && current.atStart === next.atStart && current.atEnd === next.atEnd ? current : next,
      )
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    Array.from(element.children).forEach((child) => observer.observe(child))
    element.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', update)
    }
  }, [ref, resetKey])

  const scrollByItem = useCallback(
    (direction: -1 | 1) => {
      const element = ref.current
      const first = element?.firstElementChild as HTMLElement | null
      if (!element || !first) return
      const gap = parseFloat(getComputedStyle(element).columnGap) || 0
      element.scrollBy({ left: direction * (first.offsetWidth + gap), behavior: 'smooth' })
    },
    [ref],
  )

  return { ...state, scrollByItem }
}
