import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'

const TONE_BACKGROUND = {
  // A ride with no bike on Strava.
  warning: 'var(--mantine-color-orange-light)',
  // A retired bike or component.
  muted: 'var(--mantine-color-gray-light)',
  // A deep-linked row, briefly (the component page's ?event=<id>).
  highlight: 'var(--mantine-color-yellow-light)',
} as const

// One DataList row: the whole row is the click target and a keyboard
// button (Enter/Space), named by the caller's ariaLabel. On the grid it's
// a subgrid spanning every column, so its children are the cells, one per
// track (a cell may span several, e.g. gridColumn: '3 / -1'). `stacked`
// (a phone layout) makes it a plain block instead. Hover and focus styling
// is .data-list-row in index.css. Without onOpen it's a plain row (no
// button, no hover) -- e.g. an empty slot whose own control is the target.
export default function DataListRow({
  id,
  ariaLabel,
  onOpen,
  tone,
  stacked = false,
  children,
}: {
  // A DOM id, e.g. for scrolling a deep-linked row into view.
  id?: string
  ariaLabel?: string
  onOpen?: () => void
  tone?: keyof typeof TONE_BACKGROUND
  stacked?: boolean
  children: ReactNode
}) {
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen?.()
    }
  }

  const shared: CSSProperties = {
    borderTop: '1px solid var(--mantine-color-default-border)',
    background: tone ? TONE_BACKGROUND[tone] : undefined,
    color: tone === 'muted' ? 'var(--mantine-color-dimmed)' : undefined,
    cursor: onOpen ? 'pointer' : undefined,
  }

  const style: CSSProperties = stacked
    ? { ...shared, padding: '10px 12px' }
    : {
        ...shared,
        gridColumn: '1 / -1',
        display: 'grid',
        gridTemplateColumns: 'subgrid',
        alignItems: 'center',
        padding: '8px 12px',
      }

  if (!onOpen)
    return (
      <div id={id} style={style}>
        {children}
      </div>
    )

  return (
    <div id={id} role="button" tabIndex={0} aria-label={ariaLabel} className="data-list-row" onClick={onOpen} onKeyDown={handleKeyDown} style={style}>
      {children}
    </div>
  )
}
