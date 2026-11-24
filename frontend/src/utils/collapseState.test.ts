import { describe, expect, it } from 'vitest'
import { readCollapsed, writeCollapsed, type CollapseStorage } from './collapseState'

function memoryStorage(): CollapseStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  }
}

const throwing: CollapseStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

describe('collapseState', () => {
  it('defaults to open when nothing is stored, or there is no storage', () => {
    expect(readCollapsed('bikePage.collapsed.rides', memoryStorage())).toBe(false)
    expect(readCollapsed('bikePage.collapsed.rides', null)).toBe(false)
  })

  it('round-trips folded and open', () => {
    const storage = memoryStorage()
    writeCollapsed('bikePage.collapsed.rides', true, storage)
    expect(storage.data.get('bikePage.collapsed.rides')).toBe('1')
    expect(readCollapsed('bikePage.collapsed.rides', storage)).toBe(true)
    writeCollapsed('bikePage.collapsed.rides', false, storage)
    expect(readCollapsed('bikePage.collapsed.rides', storage)).toBe(false)
  })

  it('keeps each key separate', () => {
    const storage = memoryStorage()
    writeCollapsed('bikePage.collapsed.rides', true, storage)
    expect(readCollapsed('bikePage.collapsed.installed', storage)).toBe(false)
  })

  it('reads an unexpected value as open', () => {
    const storage = memoryStorage()
    storage.data.set('bikePage.collapsed.rides', 'true')
    expect(readCollapsed('bikePage.collapsed.rides', storage)).toBe(false)
  })

  it('survives storage that throws: open on read, a no-op on write', () => {
    expect(readCollapsed('bikePage.collapsed.rides', throwing)).toBe(false)
    expect(() => writeCollapsed('bikePage.collapsed.rides', true, throwing)).not.toThrow()
  })

  it('uses no storage under node, where there is no window', () => {
    expect(readCollapsed('bikePage.collapsed.rides')).toBe(false)
    expect(() => writeCollapsed('bikePage.collapsed.rides', true)).not.toThrow()
  })
})
