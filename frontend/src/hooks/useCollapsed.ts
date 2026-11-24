import { useState } from 'react'
import { readCollapsed, writeCollapsed } from '../utils/collapseState'

// A section's folded state, seeded from and saved to this device's
// localStorage under `storageKey` (utils/collapseState). Without a key it
// starts open and isn't remembered.
export function useCollapsed(storageKey?: string): [boolean, () => void] {
  const [folded, setFolded] = useState(() => (storageKey ? readCollapsed(storageKey) : false))

  function toggle() {
    const next = !folded
    setFolded(next)
    if (storageKey) writeCollapsed(storageKey, next)
  }

  return [folded, toggle]
}
