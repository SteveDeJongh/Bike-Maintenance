import { useInfiniteQuery, useQuery, type Query, type QueryKey } from '@tanstack/react-query'
import { apiGet } from './client'
import type {
  ActivityFeedResponse,
  MaintenanceLogResponse,
  ActivityUiKind,
  BikeDetail,
  BikeType,
  BikeWithStats,
  CategoryServiceRequirement,
  ComponentAssignment,
  ComponentCategorySetting,
  ComponentDetail,
  ComponentServiceRequirement,
  ComponentListItem,
  DashboardSummary,
  MaintenanceAlert,
  MaintenanceAlertScope,
  NotificationSetting,
  RideDetail,
  ServiceableComponentsResponse,
  ServiceSession,
  ServiceType,
  StravaGear,
  StravaIgnoredGear,
  StravaMappedBike,
  StravaRidesResponse,
  StravaStatus,
  TableViewPreferenceData,
  User,
} from '../types/models'

// retry: false -- a 401 here means "not signed in," not a transient
// failure, so RequireAuth should see that right away rather than after
// react-query's default retries.
export function useCurrentUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<User>('/me'),
    retry: false,
  })
}

export function useBikes() {
  return useQuery({
    queryKey: ['bikes'],
    // tz: the viewer's zone, for distance_this_year's Jan 1 boundary.
    queryFn: () => apiGet<BikeWithStats[]>(`/bikes?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`),
  })
}

export function useBikeTypes() {
  return useQuery({
    queryKey: ['bike_types'],
    queryFn: () => apiGet<BikeType[]>('/bike_types'),
  })
}

export function useBike(id: number) {
  return useQuery({
    queryKey: ['bikes', id],
    // tz: the viewer's zone, for distance_this_year's Jan 1 boundary.
    queryFn: () => apiGet<BikeDetail>(`/bikes/${id}?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`),
    enabled: Number.isFinite(id),
  })
}

// BatchServiceModal's component picker -- refetches whenever `at` (the
// session's own performed_at) changes, since eligibility is evaluated at
// that point in time, not now.
export function useServiceableComponents(bikeId: number, at: string) {
  return useQuery({
    queryKey: ['serviceable_components', bikeId, at],
    queryFn: () => apiGet<ServiceableComponentsResponse>(`/bikes/${bikeId}/serviceable_components?at=${encodeURIComponent(at)}`),
    enabled: Number.isFinite(bikeId) && Boolean(at),
  })
}

export function useServiceSession(id: number) {
  return useQuery({
    queryKey: ['service_sessions', id],
    queryFn: () => apiGet<ServiceSession>(`/service_sessions/${id}`),
    enabled: Number.isFinite(id),
  })
}

export function useComponents() {
  return useQuery({
    queryKey: ['components'],
    queryFn: () => apiGet<ComponentListItem[]>('/components'),
  })
}

export function useComponent(id: number) {
  return useQuery({
    queryKey: ['components', id],
    queryFn: () => apiGet<ComponentDetail>(`/components/${id}`),
    enabled: Number.isFinite(id),
  })
}

export function useComponentAssignments() {
  return useQuery({
    queryKey: ['component_assignments'],
    queryFn: () => apiGet<ComponentAssignment[]>('/component_assignments'),
  })
}

export function useServiceTypes() {
  return useQuery({
    queryKey: ['service_types'],
    queryFn: () => apiGet<ServiceType[]>('/service_types'),
  })
}

export interface MaintenanceLogParams {
  kinds: ('session' | 'single')[]
  bikeId?: number
  category?: string
  serviceTypeId?: number
  from?: string
  to?: string
  tz: string
  q?: string
  group: 'month' | 'component' | 'none'
  sort: 'date' | 'component_km' | 'since_last'
  order: 'asc' | 'desc'
}

// The Maintenance page's log (Maintenance::EventLog). Date order with
// Month / None grouping pages by keyset cursor; Component grouping and the
// field sorts by page number -- next_cursor carries either.
export function useMaintenanceLog(params: MaintenanceLogParams) {
  const { kinds, bikeId, category, serviceTypeId, from, to, tz, q, group, sort, order } = params

  return useInfiniteQuery({
    queryKey: ['maintenance_events', 'log', kinds, bikeId, category, serviceTypeId, from, to, tz, q, group, sort, order],
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams()
      kinds.forEach((kind) => search.append('kinds[]', kind))
      if (bikeId) search.set('bike_id', String(bikeId))
      if (category) search.set('category', category)
      if (serviceTypeId) search.set('service_type_id', String(serviceTypeId))
      if (from) search.set('from', from)
      if (to) search.set('to', to)
      search.set('tz', tz)
      if (q) search.set('q', q)
      search.set('group', group)
      search.set('sort', sort)
      search.set('order', order)
      const byOffset = sort !== 'date' || group === 'component'
      if (pageParam) search.set(byOffset ? 'page' : 'cursor', pageParam)
      return apiGet<MaintenanceLogResponse>(`/maintenance_events?${search.toString()}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  })
}

// refetchInterval lets a sync-polling caller (useStravaSyncRunner) watch
// this without a second query, same convention as useDashboard's own
// options param below.
export function useStravaStatus(options?: {
  refetchInterval?: number | false | ((query: Query<StravaStatus, Error, StravaStatus, QueryKey>) => number | false)
}) {
  return useQuery({
    queryKey: ['strava', 'status'],
    queryFn: () => apiGet<StravaStatus>('/strava/status'),
    refetchInterval: options?.refetchInterval ?? false,
  })
}

export interface StravaRidesParams {
  status: 'attention' | 'ignored' | 'all'
  bikeId?: number
  sort: 'date' | 'distance'
  order: 'asc' | 'desc'
}

// Load-more pagination -- the query key includes
// every filter/sort param so changing any of them discards stale pages
// automatically.
export function useStravaRides({ status, bikeId, sort, order }: StravaRidesParams) {
  return useInfiniteQuery({
    queryKey: ['strava_rides', status, bikeId, sort, order],
    queryFn: ({ pageParam }) => {
      const bikeParam = status === 'all' && bikeId ? `&bike_id=${bikeId}` : ''
      return apiGet<StravaRidesResponse>(
        `/strava/rides?status=${status}&sort=${sort}&order=${order}&page=${pageParam}${bikeParam}`,
      )
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.meta.next_page,
  })
}

export function useUnmappedGear() {
  return useQuery({
    queryKey: ['strava', 'unmapped_gear'],
    queryFn: () => apiGet<StravaGear[]>('/strava/unmapped_gear'),
  })
}

export function useIgnoredGear() {
  return useQuery({
    queryKey: ['strava', 'ignored_gear'],
    queryFn: () => apiGet<StravaIgnoredGear[]>('/strava/ignored_gear'),
  })
}

export function useMappedGear() {
  return useQuery({
    queryKey: ['strava', 'mapped_gear'],
    queryFn: () => apiGet<StravaMappedBike[]>('/strava/mapped_gear'),
  })
}

export function useComponentCategorySettings() {
  return useQuery({
    queryKey: ['component_category_settings'],
    queryFn: () => apiGet<ComponentCategorySetting[]>('/component_category_settings'),
  })
}

export function useTableViewPreference(tableKey: string) {
  return useQuery({
    queryKey: ['table_view_preferences', tableKey],
    queryFn: () => apiGet<{ data: TableViewPreferenceData }>(`/table_view_preferences/${tableKey}`),
  })
}

export function useCategoryServiceRequirements() {
  return useQuery({
    queryKey: ['category_service_requirements'],
    queryFn: () => apiGet<CategoryServiceRequirement[]>('/category_service_requirements'),
  })
}

export function useComponentServiceRequirements(componentId: number) {
  return useQuery({
    queryKey: ['component_service_requirements', componentId],
    queryFn: () => apiGet<ComponentServiceRequirement[]>(`/component_service_requirements?component_id=${componentId}`),
    enabled: Number.isFinite(componentId),
  })
}

// Every component_service_requirement across all of the user's components
// -- used by the category template editor's "apply to" checklist, which
// needs to know which components already hold a linked row for a given
// template.
export function useAllComponentServiceRequirements() {
  return useQuery({
    queryKey: ['component_service_requirements'],
    queryFn: () => apiGet<ComponentServiceRequirement[]>('/component_service_requirements'),
  })
}

export function useNotificationSetting() {
  return useQuery({
    queryKey: ['notification_settings'],
    queryFn: () => apiGet<NotificationSetting>('/notification_settings'),
  })
}

// The query-param (and dismiss_all body) shape for a MaintenanceAlertScope
// -- shared with useDismissAllServiceAlerts (api/mutations.ts) so the two
// can never encode a scope differently.
export function maintenanceAlertScopeParams(scope: MaintenanceAlertScope): Record<string, number> {
  return 'bikeId' in scope ? { bike_id: scope.bikeId } : { component_id: scope.componentId }
}

// Banner-eligible alerts for one bike or one component (MaintenanceAlertBanners'
// two renderers, Bike/Component detail). Short staleTime since logging a
// service, a sync, or a dismissal should reflect quickly in the banners
// without needing a manual refresh.
export function useMaintenanceAlerts(scope: MaintenanceAlertScope) {
  return useQuery({
    queryKey: ['maintenance_alerts', scope],
    queryFn: () => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(maintenanceAlertScopeParams(scope))) {
        params.set(key, String(value))
      }
      return apiGet<MaintenanceAlert[]>(`/maintenance_alerts?${params.toString()}`)
    },
    staleTime: 30_000,
  })
}

// tz is the viewer's IANA zone name (Dashboard.tsx sends
// Intl.DateTimeFormat().resolvedOptions().timeZone) -- only used server-side
// to compute calendar boundaries (distance_this_month and the stats
// section's week/month/year windows), nothing is stored.
export function useDashboard(tz: string, options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ['dashboard', tz],
    queryFn: () => apiGet<DashboardSummary>(`/dashboard?tz=${encodeURIComponent(tz)}`),
    refetchInterval: options?.refetchInterval ?? false,
  })
}

export interface ActivityFeedFilters {
  kinds: ActivityUiKind[]
  bikeId?: number
  from?: string
  to?: string
  tz: string
  q?: string
  componentId?: number
  order: 'asc' | 'desc'
  // 'date', or a metric key (Activity::Feed::SORT_COLUMNS) -- see ACTIVITY_FIELDS.
  sort: string
}

// Same Load-more pagination shape as useStravaRides. pageParam
// is opaque -- a keyset cursor string for sort=date, or a page number
// string for a metric sort (Activity::Feed's own two branches) -- sent back
// as whichever param each branch actually reads. The query key includes
// every filter/kinds/order/sort so changing any of them discards stale
// pages automatically.
export function useActivityFeed(filters: ActivityFeedFilters) {
  const { kinds, bikeId, from, to, tz, q, componentId, order, sort } = filters

  return useInfiniteQuery({
    queryKey: ['activity', kinds, bikeId, from, to, tz, q, componentId, order, sort],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams()
      kinds.forEach((kind) => params.append('kinds[]', kind))
      if (bikeId) params.set('bike_id', String(bikeId))
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      params.set('tz', tz)
      if (q) params.set('q', q)
      if (componentId) params.set('component_id', String(componentId))
      params.set('order', order)
      params.set('sort', sort)
      if (sort !== 'date') {
        params.set('page', pageParam ?? '1')
      } else if (pageParam) {
        params.set('cursor', pageParam)
      }
      return apiGet<ActivityFeedResponse>(`/activity?${params.toString()}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  })
}

// One ride for RideDetailModal (GET /strava/rides/:id). In the rides,
// serviceStatus and history invalidation groups: a re-sync, a logged
// service or a swap all change what it shows.
export function useRideDetail(id: number | null) {
  return useQuery({
    queryKey: ['ride_detail', id],
    queryFn: () => apiGet<RideDetail>(`/strava/rides/${id}`),
    enabled: id != null,
  })
}

// The latest ride a component counted toward that started strictly before
// an instant (GET /activity's component_id filter -- its assignment
// windows and ride context -- with `before`): the Log service modal's
// "After last ride" and "Last ride before this". null when there's none.
// Keyed under ['activity'], so the rides invalidation group refreshes it.
export function useLastRideBefore(componentId: number | undefined, before: string | null) {
  return useQuery({
    queryKey: ['activity', 'last_ride', componentId, before],
    queryFn: async () => {
      const params = new URLSearchParams({ component_id: String(componentId), before: before ?? '', per_page: '1', order: 'desc' })
      params.append('kinds[]', 'ride')
      const response = await apiGet<ActivityFeedResponse>(`/activity?${params.toString()}`)
      const ride = response.items.find((item) => item.kind === 'ride')
      return ride ? { name: ride.name, moved_at: ride.moved_at, elapsed_time: ride.elapsed_time } : null
    },
    enabled: componentId != null && before != null,
  })
}
