import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'

const TONE_BACKGROUND = {
  // A ride with no bike on Strava.
  warning: 'var(--mantine-color-orange-light)',
  // A retired bike or component.
  muted: 'var(--mantine-color-gray-light)',
} as const

// One DataList row: the whole row is the click target and a keyboard
// button (Enter/Space), named by the caller's ariaLabel. On the grid it's
// a subgrid spanning every column, so its children are the cells, one per
// track (a cell may span several, e.g. gridColumn: '3 / -1'). `stacked`
// (a phone layout) makes it a plain block instead. Hover and focus styling
// is .data-list-row in index.css.
export default function DataListRow({
  ariaLabel,
  onOpen,
  tone,
  stacked = false,
  children,
}: {
  ariaLabel: string
  onOpen: () => void
  tone?: keyof typeof TONE_BACKGROUND
  stacked?: boolean
  children: ReactNode
}) {
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen()
    }
  }

  const shared: CSSProperties = {
    borderTop: '1px solid var(--mantine-color-default-border)',
    background: tone ? TONE_BACKGROUND[tone] : undefined,
    color: tone === 'muted' ? 'var(--mantine-color-dimmed)' : undefined,
    cursor: 'pointer',
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

  return (
    <div role="button" tabIndex={0} aria-label={ariaLabel} className="data-list-row" onClick={onOpen} onKeyDown={handleKeyDown} style={style}>
      {children}
    </div>
  )
}
