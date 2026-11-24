import { categoryLabel, SERVICE_STATUS_SEVERITY, type ComponentListField, type ComponentListSort } from '../../constants'
import { componentState, type ComponentState } from '../../utils/componentState'
import type { ComponentListItem, TableViewPreferenceData } from '../../types/models'

// The Components list's pure helpers (docs/frontend-ui.md, "Components
// page"): state pills, tiles, filters, sort, grouping and band summaries.
// Installed / spare / retired always come from componentState.

export const COMPONENT_STATES: readonly ComponentState[] = ['installed', 'spare', 'retired']
export const DEFAULT_COMPONENT_STATES: ComponentState[] = ['installed', 'spare']

export const COMPONENT_STATE_LABELS: Record<ComponentState, string> = {
  installed: 'Installed',
  spare: 'Spare',
  retired: 'Retired',
}

// The pill dots: the primary accent, blue, grey.
export const COMPONENT_STATE_COLORS: Record<ComponentState, string> = {
  installed: 'var(--mantine-color-radar-6)',
  spare: 'var(--mantine-color-blue-6)',
  retired: 'var(--mantine-color-gray-6)',
}

export const COMPONENT_GROUP_BYS = ['category', 'bike', 'none'] as const
export type ComponentGroupBy = (typeof COMPONENT_GROUP_BYS)[number]

export function isComponentGroupBy(value: unknown): value is ComponentGroupBy {
  return typeof value === 'string' && (COMPONENT_GROUP_BYS as readonly string[]).includes(value)
}

export function isComponentState(value: unknown): value is ComponentState {
  return typeof value === 'string' && (COMPONENT_STATES as readonly string[]).includes(value)
}

// The Service status filter. "soon" is the warning status (BikeStatusChip
// says "N soon" too); "none" is no enabled requirement.
export const SERVICE_FILTERS = ['due', 'soon', 'ok', 'none'] as const
export type ServiceFilter = (typeof SERVICE_FILTERS)[number]

export const SERVICE_FILTER_LABELS: Record<ServiceFilter, string> = {
  due: 'Due',
  soon: 'Soon',
  ok: 'OK',
  none: 'No interval',
}

export function isServiceFilter(value: unknown): value is ServiceFilter {
  return typeof value === 'string' && (SERVICE_FILTERS as readonly string[]).includes(value)
}

export function serviceFilterOf(component: ComponentListItem): ServiceFilter {
  if (!component.has_enabled_requirement) return 'none'
  if (component.service_status === 'due') return 'due'
  if (component.service_status === 'warning') return 'soon'
  return 'ok'
}

export interface ComponentTileCounts {
  installed: number
  spare: number
  retired: number
  // Non-retired components (installed + spare): what due/soon and "with
  // intervals" count over -- a spare chain that needs waxing counts.
  active: number
  due: number
  soon: number
  withIntervals: number
}

export function componentTileCounts(components: readonly ComponentListItem[]): ComponentTileCounts {
  const counts: ComponentTileCounts = { installed: 0, spare: 0, retired: 0, active: 0, due: 0, soon: 0, withIntervals: 0 }
  for (const component of components) {
    const state = componentState(component)
    counts[state] += 1
    if (state === 'retired') continue
    counts.active += 1
    if (component.has_enabled_requirement) counts.withIntervals += 1
    if (component.service_status === 'due') counts.due += 1
    if (component.service_status === 'warning') counts.soon += 1
  }
  return counts
}

export interface ComponentFilters {
  states: readonly ComponentState[]
  q: string
  category: string | null
  bikeId: number | null
  service: ServiceFilter | null
}

// Search, Category, Bike and Service status -- not the state pills, which
// are a view choice like Activity's kind pills.
export function hasActiveFilters(filters: Omit<ComponentFilters, 'states'>): boolean {
  return Boolean(filters.q.trim() || filters.category || filters.bikeId != null || filters.service)
}

export function matchesSearch(component: ComponentListItem, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [component.label, component.brand, component.model].some((value) => value?.toLowerCase().includes(needle))
}

// Installed: on that bike now. Spare or retired: last on that bike -- so
// "Soloist" with the Spare pill on shows the chain off the Soloist.
export function matchesBike(component: ComponentListItem, bikeId: number): boolean {
  if (componentState(component) === 'installed') return component.current_bikes.some((bike) => bike.id === bikeId)
  return component.last_bike?.id === bikeId
}

export function filterComponents(components: readonly ComponentListItem[], filters: ComponentFilters): ComponentListItem[] {
  return components.filter(
    (component) =>
      filters.states.includes(componentState(component)) &&
      matchesSearch(component, filters.q) &&
      (filters.category == null || component.category === filters.category) &&
      (filters.bikeId == null || matchesBike(component, filters.bikeId)) &&
      (filters.service == null || serviceFilterOf(component) === filters.service),
  )
}

// The category's position in the app's order (useAllCategories: the
// baseline list, then custom categories); unknown ones after, A-Z.
export function categoryRank(category: string, categoryOrder: readonly string[]): [number, string] {
  const index = categoryOrder.indexOf(category)
  return [index === -1 ? categoryOrder.length : index, category]
}

function compareCategory(a: string, b: string, categoryOrder: readonly string[]): number {
  const [ai, an] = categoryRank(a, categoryOrder)
  const [bi, bn] = categoryRank(b, categoryOrder)
  return ai - bi || an.localeCompare(bn)
}

// Installed by bike name, then spares by last bike, then never installed,
// then retired by last bike.
export function bikeSortKey(component: ComponentListItem): string {
  const state = componentState(component)
  if (state === 'installed') return `0 ${sortedBikeNames(component)[0]}`
  if (state === 'spare') return component.last_bike ? `1 ${component.last_bike.name}` : '2'
  return `3 ${component.last_bike?.name ?? ''}`
}

function sortedBikeNames(component: ComponentListItem): string[] {
  return component.current_bikes.map((bike) => bike.name).sort((a, b) => a.localeCompare(b))
}

// Most urgent first: due, warning, ok, highest fraction_used first within
// each. Components with no interval compare equal here; sortComponents
// keeps them last in either direction.
function compareService(a: ComponentListItem, b: ComponentListItem): number {
  const severity = (c: ComponentListItem) => (c.service_status ? SERVICE_STATUS_SEVERITY[c.service_status] : 0)
  return severity(b) - severity(a) || (b.fraction_used ?? 0) - (a.fraction_used ?? 0)
}

// null sorts last whichever way.
function fieldValue(component: ComponentListItem, field: ComponentListField): string | number | null {
  switch (field) {
    case 'lifetime_distance':
      return component.lifetime_distance_meters
    case 'acquired_on':
      return component.acquired_on
    case 'brand':
      return component.brand || null
    case 'model':
      return component.model || null
    case 'category':
      return categoryLabel(component.category)
    case 'retired_on':
      return component.retired_on
  }
}

function compareValues(a: string | number, b: string | number): number {
  return typeof a === 'string' ? a.localeCompare(b as string) : a - (b as number)
}

// The list's order within each group. Ties fall back to the label, A-Z,
// so the order is stable. Service: "asc" is most urgent first, and no
// interval stays last either way, like a null field.
export function sortComponents(
  components: readonly ComponentListItem[],
  column: ComponentListSort,
  direction: 'asc' | 'desc',
): ComponentListItem[] {
  const flip = direction === 'asc' ? 1 : -1
  const byLabel = (a: ComponentListItem, b: ComponentListItem) => a.label.localeCompare(b.label)

  return [...components].sort((a, b) => {
    if (column === 'component') return flip * byLabel(a, b) || a.id - b.id
    if (column === 'bike') return flip * bikeSortKey(a).localeCompare(bikeSortKey(b)) || byLabel(a, b)
    if (column === 'service') {
      if (a.has_enabled_requirement !== b.has_enabled_requirement) return a.has_enabled_requirement ? -1 : 1
      if (!a.has_enabled_requirement) return byLabel(a, b)
      return flip * compareService(a, b) || byLabel(a, b)
    }
    const av = fieldValue(a, column)
    const bv = fieldValue(b, column)
    if (av === null || bv === null) return av === bv ? byLabel(a, b) : av === null ? 1 : -1
    return flip * compareValues(av, bv) || byLabel(a, b)
  })
}

// The first direction a header click picks: most urgent / largest first
// for Service and Lifetime, newest first for dates, A-Z otherwise.
export function firstSortDirection(column: ComponentListSort): 'asc' | 'desc' {
  return column === 'lifetime_distance' || column === 'acquired_on' || column === 'retired_on' ? 'desc' : 'asc'
}

// One rendered row. A shared indoor cassette is one component on two
// bikes, so under Group by Bike it's a row in each bike's band: the key
// carries the band's bike, and bikeId says which bike to name first.
export interface ComponentRow {
  key: string
  component: ComponentListItem
  bikeId: number | null
}

export interface ComponentGroup {
  key: string
  // null: the flat list (Group by None), drawn without a band.
  title: string | null
  rows: ComponentRow[]
}

const row = (component: ComponentListItem, bikeId: number | null = null): ComponentRow => ({
  key: bikeId == null ? String(component.id) : `${component.id}-${bikeId}`,
  component,
  bikeId,
})

// Bands, in order, over already-sorted components (so sorting applies
// within each band). Category: the app's category order. Bike: each bike
// with installed components, A-Z, then Spare, then Retired. Empty bands
// are left out.
export function groupComponents(
  sorted: readonly ComponentListItem[],
  groupBy: ComponentGroupBy,
  categoryOrder: readonly string[],
): ComponentGroup[] {
  if (groupBy === 'none') return sorted.length ? [{ key: 'all', title: null, rows: sorted.map((c) => row(c)) }] : []

  if (groupBy === 'category') {
    const byCategory = new Map<string, ComponentListItem[]>()
    for (const component of sorted) {
      byCategory.set(component.category, [...(byCategory.get(component.category) ?? []), component])
    }
    return [...byCategory.keys()]
      .sort((a, b) => compareCategory(a, b, categoryOrder))
      .map((category) => ({
        key: `category:${category}`,
        title: categoryLabel(category),
        rows: byCategory.get(category)!.map((c) => row(c)),
      }))
  }

  const bikes = new Map<number, { name: string; rows: ComponentRow[] }>()
  const spare: ComponentRow[] = []
  const retired: ComponentRow[] = []
  for (const component of sorted) {
    const state = componentState(component)
    if (state === 'spare') spare.push(row(component))
    else if (state === 'retired') retired.push(row(component))
    else {
      for (const bike of component.current_bikes) {
        const entry = bikes.get(bike.id) ?? { name: bike.name, rows: [] }
        entry.rows.push(row(component, bike.id))
        bikes.set(bike.id, entry)
      }
    }
  }

  const groups: ComponentGroup[] = [...bikes.entries()]
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([id, entry]) => ({ key: `bike:${id}`, title: entry.name, rows: entry.rows }))
  if (spare.length) groups.push({ key: 'spare', title: 'Spare', rows: spare })
  if (retired.length) groups.push({ key: 'retired', title: 'Retired', rows: retired })
  return groups
}

// A band's count line: "4 · 1 due · 2 soon", zero parts left out.
export function bandSummary(rows: readonly ComponentRow[]): string {
  const due = rows.filter((r) => r.component.service_status === 'due').length
  const soon = rows.filter((r) => r.component.service_status === 'warning').length
  return [String(rows.length), due ? `${due} due` : null, soon ? `${soon} soon` : null].filter(Boolean).join(' · ')
}

// The Bike cell's main line for an installed component: the band's bike
// (or the first A-Z) and "+N" for the others -- "Juan Solo +1".
export function installedBikeLine(component: ComponentListItem, preferBikeId: number | null): string {
  const bikes = [...component.current_bikes].sort((a, b) => a.name.localeCompare(b.name))
  const first = bikes.find((bike) => bike.id === preferBikeId) ?? bikes[0]
  return bikes.length > 1 ? `${first.name} +${bikes.length - 1}` : first.name
}

// Old saved views (before the redesign) stored the table's old column
// keys; columns made only of those would hide Lifetime, so they fall back
// to the defaults. Anything else saved (sort, view keys) is kept.
const OLD_ONLY_COLUMNS = ['service_status', 'current_bikes']

export function componentListPreferenceData(data: TableViewPreferenceData): TableViewPreferenceData {
  const columns = data.columns
  if (!columns || !columns.some((column) => OLD_ONLY_COLUMNS.includes(column))) return data
  const { columns: _old, ...rest } = data
  void _old
  return rest
}
