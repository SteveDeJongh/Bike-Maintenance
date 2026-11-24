export interface OverflowEdges {
  // False when everything fits.
  overflowing: boolean
  // Nothing hidden to the left / to the right.
  atStart: boolean
  atEnd: boolean
}

// A horizontally scrolling track's overflow and position. A pixel of slack
// absorbs sub-pixel scroll positions.
export function overflowEdges({
  scrollLeft,
  scrollWidth,
  clientWidth,
}: {
  scrollLeft: number
  scrollWidth: number
  clientWidth: number
}): OverflowEdges {
  return {
    overflowing: scrollWidth > clientWidth + 1,
    atStart: scrollLeft <= 1,
    atEnd: scrollLeft + clientWidth >= scrollWidth - 1,
  }
}
