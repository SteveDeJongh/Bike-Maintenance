import { describe, expect, it } from 'vitest'
import { retireButtonLabel, swapCandidates } from './swapCandidates'
import type { ComponentWithServiceStatus } from '../types/models'

function component(id: number, category: string, retired_on: string | null = null): ComponentWithServiceStatus {
  return {
    id, label: `${category} ${id}`, category, acquired_on: '2026-01-01', retired_on, brand: null, model: null, notes: null,
    service_status: null, current_bikes: [], last_bike: null,
  }
}

describe('swapCandidates', () => {
  it('keeps same-category, non-retired components other than the current one', () => {
    const list = [component(1, 'chain'), component(2, 'chain'), component(3, 'chain', '2026-02-01'), component(4, 'saddle')]
    expect(swapCandidates(list, 'chain', 1).map((c) => c.id)).toEqual([2])
  })

  it('is empty when nothing else qualifies', () => {
    expect(swapCandidates([component(1, 'chain')], 'chain', 1)).toEqual([])
  })
})

describe('retireButtonLabel', () => {
  it('names the replace step only when a replacement is chosen', () => {
    expect(retireButtonLabel(null)).toBe('Retire')
    expect(retireButtonLabel('7')).toBe('Retire and replace')
  })
})
