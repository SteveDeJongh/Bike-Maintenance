import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type {
  BikeDetail,
  BikeWithStats,
  CategoryServiceInterval,
  Component,
  ComponentAssignment,
  ComponentCategorySetting,
  ComponentDetail,
  ComponentServiceInterval,
  MaintenanceEvent,
  NotificationSetting,
  ServiceType,
  StravaGear,
  StravaMappedBike,
  StravaStatus,
  TableViewPreferenceData,
} from '../types/models'

export function useBikes() {
  return useQuery({
    queryKey: ['bikes'],
    queryFn: () => apiGet<BikeWithStats[]>('/bikes'),
  })
}

export function useBike(id: number) {
  return useQuery({
    queryKey: ['bikes', id],
    queryFn: () => apiGet<BikeDetail>(`/bikes/${id}`),
    enabled: Number.isFinite(id),
  })
}

export function useComponents() {
  return useQuery({
    queryKey: ['components'],
    queryFn: () => apiGet<Component[]>('/components'),
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

export function useStravaStatus() {
  return useQuery({
    queryKey: ['strava', 'status'],
    queryFn: () => apiGet<StravaStatus>('/strava/status'),
  })
}

export function useUnmappedGear() {
  return useQuery({
    queryKey: ['strava', 'unmapped_gear'],
    queryFn: () => apiGet<StravaGear[]>('/strava/unmapped_gear'),
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
