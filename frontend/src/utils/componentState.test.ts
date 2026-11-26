import { describe, expect, it } from 'vitest'
import { componentState, spareReadyLabel } from './componentState'

const bike = { id: 1, name: 'Soloist', ride_context: 'both' as const }

describe('componentState', () => {
  it('is installed with an open assignment', () => {
    expect(componentState({ retired_on: null, current_bikes: [bike] })).toBe('installed')
  })

  it('is spare with none', () => {
    expect(componentState({ retired_on: null, current_bikes: [] })).toBe('spare')
  })

  it('is retired once retired_on is set, even if still mounted', () => {
    expect(componentState({ retired_on: '2026-03-01', current_bikes: [] })).toBe('retired')
    expect(componentState({ retired_on: '2026-03-01', current_bikes: [bike] })).toBe('retired')
  })

  it('is retired when left on retired bikes only (effectively_retired), installed again once the bike is back', () => {
    expect(componentState({ retired_on: null, effectively_retired: true, current_bikes: [bike] })).toBe('retired')
    expect(componentState({ retired_on: null, effectively_retired: false, current_bikes: [bike] })).toBe('installed')
  })
})

describe('spareReadyLabel', () => {
  const spare = {
    retired_on: null,
    current_bikes: [],
    rotates: true,
    service_status: 'ok' as const,
    last_bike: { id: 1, name: 'Soloist', removed_at: '2026-03-01T10:00:00Z' },
    latest_service: { service_type_name: 'wax', performed_at: '2026-03-02T10:00:00Z' },
  }

  it('reads "<Service> · ready" when serviced after its last removal', () => {
    expect(spareReadyLabel(spare)).toBe('Wax · ready')
  })

  it('is ready when never installed but serviced', () => {
    expect(spareReadyLabel({ ...spare, last_bike: null })).toBe('Wax · ready')
  })

  it('is null when the latest service is before (or at) the removal', () => {
    expect(spareReadyLabel({ ...spare, latest_service: { service_type_name: 'wax', performed_at: '2026-02-20T10:00:00Z' } })).toBeNull()
    expect(spareReadyLabel({ ...spare, latest_service: { service_type_name: 'wax', performed_at: '2026-03-01T10:00:00Z' } })).toBeNull()
  })

  it('is null for a non-rotating category, with no service, or when due', () => {
    expect(spareReadyLabel({ ...spare, rotates: false })).toBeNull()
    expect(spareReadyLabel({ ...spare, latest_service: null })).toBeNull()
    expect(spareReadyLabel({ ...spare, service_status: 'due' })).toBeNull()
  })

  it('is null unless the component is a spare', () => {
    expect(spareReadyLabel({ ...spare, current_bikes: [bike] })).toBeNull()
    expect(spareReadyLabel({ ...spare, retired_on: '2026-03-05' })).toBeNull()
  })
})
