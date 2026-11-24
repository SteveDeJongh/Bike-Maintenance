import { describe, expect, it } from 'vitest'
import {
  bandSummary,
  bikeSortKey,
  componentListPreferenceData,
  componentTileCounts,
  filterComponents,
  groupComponents,
  hasActiveFilters,
  installedBikeLine,
  serviceFilterOf,
  sortComponents,
  type ComponentFilters,
} from './componentListModel'
import type { ComponentListItem } from '../../types/models'

const juan = { id: 1, name: 'Juan Solo', ride_context: 'indoor_only' as const }
const soloist = { id: 2, name: 'Soloist', ride_context: 'both' as const }

let nextId = 1
function component(overrides: Partial<ComponentListItem> = {}): ComponentListItem {
  const id = nextId++
  return {
    id,
    label: `Component ${id}`,
    category: 'chain',
    acquired_on: '2026-01-01',
    retired_on: null,
    brand: null,
    model: null,
    notes: null,
    service_status: null,
    current_bikes: [],
    last_bike: null,
    fraction_used: null,
    driving_dimension: null,
    distance_remaining_meters: null,
    moving_time_remaining_seconds: null,
    days_remaining: null,
    has_enabled_requirement: false,
    lifetime_distance_meters: 0,
    assigned_since: null,
    rotates: false,
    latest_service: null,
    ...overrides,
  }
}

const withStatus = (status: 'ok' | 'warning' | 'due', fraction: number, overrides: Partial<ComponentListItem> = {}) =>
  component({ service_status: status, fraction_used: fraction, has_enabled_requirement: true, ...overrides })

describe('componentTileCounts', () => {
  it('counts states, and due/soon/with intervals over non-retired components only', () => {
    const list = [
      withStatus('due', 1.2, { current_bikes: [soloist] }),
      withStatus('warning', 0.9), // a spare: still counts
      withStatus('ok', 0.1, { current_bikes: [soloist] }),
      component({ current_bikes: [soloist] }),
      withStatus('due', 1.5, { retired_on: '2026-02-01' }), // retired: not counted as due
    ]

    expect(componentTileCounts(list)).toEqual({
      installed: 3,
      spare: 1,
      retired: 1,
      active: 4,
      due: 1,
      soon: 1,
      withIntervals: 3,
    })
  })
})

describe('serviceFilterOf', () => {
  it('maps statuses to Due / Soon / OK, and no requirement to none', () => {
    expect(serviceFilterOf(withStatus('due', 1))).toBe('due')
    expect(serviceFilterOf(withStatus('warning', 0.8))).toBe('soon')
    expect(serviceFilterOf(withStatus('ok', 0.1))).toBe('ok')
    expect(serviceFilterOf(component())).toBe('none')
  })
})

describe('filterComponents', () => {
  const base: ComponentFilters = { states: ['installed', 'spare', 'retired'], q: '', category: null, bikeId: null, service: null }
  const installed = component({ label: 'KMC X11', brand: 'KMC', current_bikes: [soloist] })
  const spareOffSoloist = component({ label: 'Spare chain', last_bike: { id: 2, name: 'Soloist', removed_at: '2026-01-01' } })
  const retired = component({ label: 'Old tire', category: 'tire_front', retired_on: '2026-01-01' })
  const list = [installed, spareOffSoloist, retired]

  it('keeps only the chosen states', () => {
    expect(filterComponents(list, { ...base, states: ['installed', 'spare'] })).toEqual([installed, spareOffSoloist])
    expect(filterComponents(list, { ...base, states: [] })).toEqual([])
  })

  it('searches label, brand and model, ignoring case', () => {
    expect(filterComponents(list, { ...base, q: ' kmc ' })).toEqual([installed])
  })

  it('filters by category and service status', () => {
    expect(filterComponents(list, { ...base, category: 'tire_front' })).toEqual([retired])
    expect(filterComponents(list, { ...base, service: 'none' })).toHaveLength(3)
  })

  it('matches a bike by its installed components, plus spares last on it', () => {
    expect(filterComponents(list, { ...base, bikeId: 2 })).toEqual([installed, spareOffSoloist])
  })

  it('counts search, category, bike and service as active filters -- not states', () => {
    expect(hasActiveFilters({ q: '', category: null, bikeId: null, service: null })).toBe(false)
    expect(hasActiveFilters({ q: ' ', category: null, bikeId: null, service: null })).toBe(false)
    expect(hasActiveFilters({ q: '', category: null, bikeId: 3, service: null })).toBe(true)
    expect(hasActiveFilters({ q: '', category: null, bikeId: null, service: 'due' })).toBe(true)
  })
})

describe('sortComponents', () => {
  it('sorts Service most urgent first: due, warning, ok by fraction, then no interval', () => {
    const none = component({ label: 'A none' })
    const ok = withStatus('ok', 0.4, { label: 'ok' })
    const okHigher = withStatus('ok', 0.7, { label: 'ok higher' })
    const warning = withStatus('warning', 0.85, { label: 'warning' })
    const due = withStatus('due', 1.1, { label: 'due' })

    const asc = sortComponents([none, ok, warning, okHigher, due], 'service', 'asc').map((c) => c.label)
    expect(asc).toEqual(['due', 'warning', 'ok higher', 'ok', 'A none'])

    const desc = sortComponents([none, ok, warning, okHigher, due], 'service', 'desc').map((c) => c.label)
    expect(desc).toEqual(['ok', 'ok higher', 'warning', 'due', 'A none'])
  })

  it('sorts by label, and nulls last either way on a field', () => {
    const a = component({ label: 'Alpha', brand: 'Zipp' })
    const b = component({ label: 'Bravo', brand: null })
    const c = component({ label: 'Charlie', brand: 'Campagnolo' })

    expect(sortComponents([c, a, b], 'component', 'asc').map((x) => x.label)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(sortComponents([a, b, c], 'brand', 'asc').map((x) => x.label)).toEqual(['Charlie', 'Alpha', 'Bravo'])
    expect(sortComponents([a, b, c], 'brand', 'desc').map((x) => x.label)).toEqual(['Alpha', 'Charlie', 'Bravo'])
  })

  it('sorts Lifetime numerically', () => {
    const short = component({ label: 'short', lifetime_distance_meters: 900 })
    const long = component({ label: 'long', lifetime_distance_meters: 12_000 })
    expect(sortComponents([short, long], 'lifetime_distance', 'desc').map((x) => x.label)).toEqual(['long', 'short'])
  })
})

describe('bikeSortKey', () => {
  it('orders installed, then spares by last bike, then never installed, then retired', () => {
    const keys = [
      component({ retired_on: '2026-01-01', last_bike: { id: 1, name: 'Allez', removed_at: '' } }),
      component(),
      component({ last_bike: { id: 1, name: 'Allez', removed_at: '' } }),
      component({ current_bikes: [soloist] }),
    ].map(bikeSortKey)
    expect([...keys].sort((a, b) => a.localeCompare(b))).toEqual(['0 Soloist', '1 Allez', '2', '3 Allez'])
  })
})

describe('groupComponents', () => {
  const order = ['chain', 'cassette', 'tire_front']

  it('groups by category in the app order, custom categories after A-Z', () => {
    const list = [
      component({ category: 'tire_front' }),
      component({ category: 'zz_custom' }),
      component({ category: 'chain' }),
      component({ category: 'aa_custom' }),
      component({ category: 'chain' }),
    ]
    const groups = groupComponents(list, 'category', order)
    expect(groups.map((g) => g.key)).toEqual([
      'category:chain',
      'category:tire_front',
      'category:aa_custom',
      'category:zz_custom',
    ])
    expect(groups[0].rows).toHaveLength(2)
  })

  it('groups by bike A-Z, a shared cassette under each bike, then Spare and Retired', () => {
    const cassette = component({ category: 'cassette', current_bikes: [soloist, juan] })
    const chain = component({ current_bikes: [soloist] })
    const spare = component()
    const retired = component({ retired_on: '2026-01-01' })

    const groups = groupComponents([cassette, chain, spare, retired], 'bike', order)

    expect(groups.map((g) => g.title)).toEqual(['Juan Solo', 'Soloist', 'Spare', 'Retired'])
    expect(groups[0].rows.map((r) => r.key)).toEqual([`${cassette.id}-1`])
    expect(groups[1].rows.map((r) => r.key)).toEqual([`${cassette.id}-2`, `${chain.id}-2`])
    expect(groups[1].rows[0].bikeId).toBe(2)
  })

  it('leaves out empty Spare and Retired bands', () => {
    const groups = groupComponents([component({ current_bikes: [soloist] })], 'bike', order)
    expect(groups.map((g) => g.title)).toEqual(['Soloist'])
  })

  it('is one untitled group for None, and nothing for an empty list', () => {
    const list = [component(), component()]
    const groups = groupComponents(list, 'none', order)
    expect(groups).toHaveLength(1)
    expect(groups[0].title).toBeNull()
    expect(groupComponents([], 'none', order)).toEqual([])
  })

  it('keeps the sorted order within each band', () => {
    const b = component({ label: 'B' })
    const a = component({ label: 'A' })
    const groups = groupComponents(sortComponents([b, a], 'component', 'desc'), 'category', order)
    expect(groups[0].rows.map((r) => r.component.label)).toEqual(['B', 'A'])
  })
})

describe('bandSummary', () => {
  it('reads "4 · 1 due · 2 soon", leaving out zero parts', () => {
    const rows = [withStatus('due', 1), withStatus('warning', 0.9), withStatus('warning', 0.85), component()].map(
      (c) => ({ key: String(c.id), component: c, bikeId: null }),
    )
    expect(bandSummary(rows)).toBe('4 · 1 due · 2 soon')
    expect(bandSummary(rows.slice(3))).toBe('1')
  })
})

describe('installedBikeLine', () => {
  it('names one bike, or the band bike (else the first A-Z) plus the others', () => {
    expect(installedBikeLine(component({ current_bikes: [soloist] }), null)).toBe('Soloist')
    const shared = component({ current_bikes: [soloist, juan] })
    expect(installedBikeLine(shared, null)).toBe('Juan Solo +1')
    expect(installedBikeLine(shared, 2)).toBe('Soloist +1')
  })
})

describe('componentListPreferenceData', () => {
  it('drops columns saved by the old table, keeping the rest', () => {
    expect(
      componentListPreferenceData({ columns: ['category', 'service_status', 'current_bikes'], sort_column: 'label', states: ['spare'] }),
    ).toEqual({ sort_column: 'label', states: ['spare'] })
  })

  it('keeps columns saved by the new list', () => {
    const data = { columns: ['lifetime_distance', 'brand'] }
    expect(componentListPreferenceData(data)).toBe(data)
  })
})
