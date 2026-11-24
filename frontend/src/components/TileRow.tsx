import { Children, useRef, type CSSProperties, type ReactNode } from 'react'
import { Box } from '@mantine/core'
import { useHorizontalOverflow } from '../hooks/useHorizontalOverflow'

const FADE_WIDTH = 40

// One row of summary tiles, the same everywhere (Home, Activity, the Bikes
// pages). It never wraps: tiles share the width (flex: 1 1 0) down to
// minTileWidth, and only then does the row scroll sideways, snapping tile to
// tile with the scrollbar hidden and a fade on each edge that has more to
// see. The layout lives in index.css's .tile-row, so the tiles themselves
// stay each page's own, untouched. A role="group" for screen readers; the
// tiles are plain content, not focus stops.
export default function TileRow({
  label = 'Summary',
  minTileWidth = 140,
  children,
}: {
  label?: string
  minTileWidth?: number
  children: ReactNode
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const { atStart, atEnd } = useHorizontalOverflow(trackRef, Children.count(children))

  return (
    <Box pos="relative">
      <div
        ref={trackRef}
        role="group"
        aria-label={label}
        className="tile-row"
        style={{ '--tile-min': `${minTileWidth}px` } as CSSProperties}
      >
        {children}
      </div>
      {!atStart && <Fade side="left" />}
      {!atEnd && <Fade side="right" />}
    </Box>
  )
}

function Fade({ side }: { side: 'left' | 'right' }) {
  return (
    <Box
      aria-hidden
      pos="absolute"
      top={0}
      bottom={0}
      w={FADE_WIDTH}
      style={{
        [side]: 0,
        pointerEvents: 'none',
        background: `linear-gradient(to ${side}, transparent, var(--mantine-color-body))`,
      }}
    />
  )
}
