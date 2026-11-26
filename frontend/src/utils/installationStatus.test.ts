import { describe, expect, it } from 'vitest'
import { installationStatus, sortInstallations } from './installationStatus'

describe('installationStatus', () => {
  it('is current, retired_bike or past', () => {
    expect(installationStatus({ ended_at: null }, { retired_on: null })).toBe('current')
    expect(installationStatus({ ended_at: null }, { retired_on: '2026-10-01' })).toBe('retired_bike')
    expect(installationStatus({ ended_at: '2026-09-30T00:00:00Z' }, { retired_on: '2026-10-01' })).toBe('past')
    expect(installationStatus({ ended_at: null }, undefined)).toBe('current')
  })
})

describe('sortInstallations', () => {
  it('puts current first, then open ones on retired bikes, then past, keeping each group in order', () => {
    const row = (id: number, ended_at: string | null, retired_on: string | null = null) => ({ id, ended_at, bike: { retired_on } })
    const sorted = sortInstallations([
      row(1, null, '2026-10-01'),
      row(2, '2026-05-01T00:00:00Z'),
      row(3, null),
      row(4, '2026-03-01T00:00:00Z', '2026-10-01'),
      row(5, null),
    ])
    expect(sorted.map((r) => r.id)).toEqual([3, 5, 1, 2, 4])
  })
})
