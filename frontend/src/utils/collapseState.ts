// A folded/open section's state, remembered per device in localStorage
// (bikePage.collapsed.<section>): someone may fold Rides on a phone but not
// on a desktop, so it isn't saved to the account. Every access is guarded
// -- private windows, blocked site data and SSR-less tests can all throw
// or have no storage -- and anything unreadable means open.

export type CollapseStorage = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): CollapseStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readCollapsed(key: string, storage: CollapseStorage | null = browserStorage()): boolean {
  try {
    return storage?.getItem(key) === '1'
  } catch {
    return false
  }
}

export function writeCollapsed(key: string, folded: boolean, storage: CollapseStorage | null = browserStorage()): void {
  try {
    storage?.setItem(key, folded ? '1' : '0')
  } catch {
    // Not remembered this time; the section still folds.
  }
}
