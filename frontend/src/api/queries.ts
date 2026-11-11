import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type {
  ActivityFeedResponse,
  ActivityUiKind,
  BikeDetail,
  BikeRidesResponse,
  BikeType,
  BikeWithStats,
  CategoryServiceInterval,
  ComponentAssignment,
  ComponentCategorySetting,
  ComponentDetail,
  ComponentServiceInterval,
  ComponentWithServiceStatus,
  DashboardSummary,
  MaintenanceAlert,
  MaintenanceEvent,
  NotificationSetting,
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
    queryFn: () => apiGet<BikeWithStats[]>('/bikes'),
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
    queryFn: () => apiGet<BikeDetail>(`/bikes/${id}`),
    enabled: Number.isFinite(id),
  })
}

// Ride history's "Load more" pagination -- the query key includes type/order
// so switching either discards stale pages automatically (react-query's own
// behavior on a changed key), rather than this hook managing that itself.
export function useBikeRides(bikeId: number, type: 'all' | 'outdoor' | 'indoor', order: 'asc' | 'desc') {
  return useInfiniteQuery({
    queryKey: ['bike_rides', bikeId, type, order],
    queryFn: ({ pageParam }) =>
      apiGet<BikeRidesResponse>(`/bikes/${bikeId}/rides?type=${type}&order=${order}&page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.meta.next_page,
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
    queryFn: () => apiGet<ComponentWithServiceStatus[]>('/components'),
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

export function useMaintenanceEvents() {
  return useQuery({
    queryKey: ['maintenance_events'],
    queryFn: () => apiGet<MaintenanceEvent[]>('/maintenance_events'),
  })
}

// refetchInterval lets a sync-polling caller (useStravaSyncRunner) watch
// this without a second query, same convention as useDashboard's own
// options param below.
export function useStravaStatus(options?: { refetchInterval?: number | false }) {
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

// Same Load-more pagination shape as useBikeRides -- the query key includes
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

export function useCategoryServiceIntervals() {
  return useQuery({
    queryKey: ['category_service_intervals'],
    queryFn: () => apiGet<CategoryServiceInterval[]>('/category_service_intervals'),
  })
}

export function useComponentServiceIntervals(componentId: number) {
  return useQuery({
    queryKey: ['component_service_intervals', componentId],
    queryFn: () => apiGet<ComponentServiceInterval[]>(`/component_service_intervals?component_id=${componentId}`),
    enabled: Number.isFinite(componentId),
  })
}

// Every component_service_interval across all of the user's components --
// used by the category template editor's "apply to" checklist, which needs
// to know which components already hold a row for a given service type.
export function useAllComponentServiceIntervals() {
  return useQuery({
    queryKey: ['component_service_intervals'],
    queryFn: () => apiGet<ComponentServiceInterval[]>('/component_service_intervals'),
  })
}

export function useNotificationSetting() {
  return useQuery({
    queryKey: ['notification_settings'],
    queryFn: () => apiGet<NotificationSetting>('/notification_settings'),
  })
}

// Banner-eligible alerts, polled by Layout.tsx app-wide. Short staleTime
// since logging a service, a sync, or a dismissal should reflect quickly in
// the banners without needing a manual refresh.
export function useMaintenanceAlerts() {
  return useQuery({
    queryKey: ['maintenance_alerts'],
    queryFn: () => apiGet<MaintenanceAlert[]>('/maintenance_alerts'),
    staleTime: 30_000,
  })
}

// tz is the viewer's IANA zone name (Dashboard.tsx sends
// Intl.DateTimeFormat().resolvedOptions().timeZone) -- only used server-side
// to compute the current-month boundary for distance_this_month, nothing is
// stored. refetchInterval lets SyncStrip poll for a completed sync without a
// second query -- see Dashboard.tsx's post-"Sync now" polling.
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
  sort: 'date' | 'distance'
}

// Same Load-more pagination shape as useBikeRides/useStravaRides. pageParam
// is opaque -- a keyset cursor string for sort=date, or a page number
// string for sort=distance (Activity::Feed's own two branches) -- sent back
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
      if (sort === 'distance') {
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
