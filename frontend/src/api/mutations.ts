import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiPatch, apiPost } from './client'
import type {
  Bike,
  BikeComponentSlot,
  CategoryServiceInterval,
  Component,
  ComponentAssignment,
  ComponentCategorySetting,
  ComponentServiceInterval,
  MaintenanceEvent,
  NotificationSetting,
  ServiceType,
  TableViewPreferenceData,
} from '../types/models'

export type BikePayload = Omit<Bike, 'id' | 'created_at'>
export type ComponentPayload = Omit<Component, 'id'>
export type ComponentAssignmentPayload = Omit<ComponentAssignment, 'id'>
export type MaintenanceEventPayload = Omit<MaintenanceEvent, 'id'>
export type BikeComponentSlotPayload = Omit<BikeComponentSlot, 'id'>
export type ServiceTypePayload = Omit<ServiceType, 'id'>
export type CategoryServiceIntervalPayload = Omit<CategoryServiceInterval, 'id'>
export type ComponentServiceIntervalPayload = Omit<ComponentServiceInterval, 'id'>
export type NotificationSettingPayload = Omit<NotificationSetting, 'id'>

// Bike

export function useCreateBike() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: BikePayload) => apiPost<Bike>('/bikes', { bike: values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bikes'] })
      // A bike can be created with a strava_gear_id already set (the
      // gear-mapping screen's "create new bike" flow), so the unmapped-gear
      // list needs to reflect that too.
      queryClient.invalidateQueries({ queryKey: ['strava'] })
    },
  })
}

export function useUpdateBike(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<BikePayload>) => apiPatch<Bike>(`/bikes/${id}`, { bike: values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bikes'] })
      // A changed strava_gear_id triggers server-side reconciliation of
      // previously-unmapped activities, so the gear-mapping screen's list
      // needs to reflect that too.
      queryClient.invalidateQueries({ queryKey: ['strava'] })
    },
  })
}

export function useDeleteBike() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/bikes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bikes'] }),
  })
}

// BikeComponentSlot
// Slots are embedded in GET /bikes/:id, so invalidating ['bikes'] (which also
// covers ['bikes', id] via react-query's prefix matching) is enough to refresh them.

export function useCreateBikeComponentSlot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: BikeComponentSlotPayload) =>
      apiPost<BikeComponentSlot>('/bike_component_slots', { bike_component_slot: values }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bikes'] }),
  })
}

export function useDeleteBikeComponentSlot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/bike_component_slots/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bikes'] }),
  })
}

// Component

export function useCreateComponent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: ComponentPayload) => apiPost<Component>('/components', { component: values }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['components'] }),
  })
}

export function useUpdateComponent(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<ComponentPayload>) =>
      apiPatch<Component>(`/components/${id}`, { component: values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['components'] })
    },
  })
}

export function useDeleteComponent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/components/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['components'] }),
  })
}

// ComponentAssignment
// Assignments affect both a bike's and a component's view, so invalidate all
// three query keys broadly on every mutation — cheap at this data scale.

function invalidateAssignmentRelatedQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['component_assignments'] })
  queryClient.invalidateQueries({ queryKey: ['bikes'] })
  queryClient.invalidateQueries({ queryKey: ['components'] })
}

export function useCreateComponentAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: ComponentAssignmentPayload) =>
      apiPost<ComponentAssignment>('/component_assignments', { component_assignment: values }),
    onSuccess: () => invalidateAssignmentRelatedQueries(queryClient),
  })
}

export function useUpdateComponentAssignment(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<ComponentAssignmentPayload>) =>
      apiPatch<ComponentAssignment>(`/component_assignments/${id}`, { component_assignment: values }),
    onSuccess: () => invalidateAssignmentRelatedQueries(queryClient),
  })
}

export function useDeleteComponentAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/component_assignments/${id}`),
    onSuccess: () => invalidateAssignmentRelatedQueries(queryClient),
  })
}

// ServiceType

export function useCreateServiceType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: ServiceTypePayload) => apiPost<ServiceType>('/service_types', { service_type: values }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['service_types'] }),
  })
}

export function useUpdateServiceType(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<ServiceTypePayload>) =>
      apiPatch<ServiceType>(`/service_types/${id}`, { service_type: values }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['service_types'] }),
  })
}

export function useDeleteServiceType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/service_types/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['service_types'] }),
  })
}

// MaintenanceEvent
// Logging an event is what resets a service interval's baseline, so every
// mutation here also invalidates components (total_distance and each
// interval's computed status) and the alert banners -- not just the event
// list itself.

function invalidateMaintenanceEventRelatedQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['maintenance_events'] })
  queryClient.invalidateQueries({ queryKey: ['components'] })
  queryClient.invalidateQueries({ queryKey: ['maintenance_alerts'] })
}

export function useCreateMaintenanceEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: MaintenanceEventPayload) =>
      apiPost<MaintenanceEvent>('/maintenance_events', { maintenance_event: values }),
    onSuccess: () => invalidateMaintenanceEventRelatedQueries(queryClient),
  })
}

export function useUpdateMaintenanceEvent(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<MaintenanceEventPayload>) =>
      apiPatch<MaintenanceEvent>(`/maintenance_events/${id}`, { maintenance_event: values }),
    onSuccess: () => invalidateMaintenanceEventRelatedQueries(queryClient),
  })
}

export function useDeleteMaintenanceEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/maintenance_events/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['maintenance_events'] }),
  })
}

// Strava

export function useSyncStrava() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<void>('/strava/sync', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strava'] })
      queryClient.invalidateQueries({ queryKey: ['bikes'] })
    },
  })
}

export function useRefreshGear() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<void>('/strava/refresh_gear', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['strava'] }),
  })
}

export function useReassignGear() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ gearId, bikeId }: { gearId: string; bikeId: number | null }) =>
      apiPatch<void>(`/strava/mapped_gear/${gearId}`, { bike_id: bikeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strava'] })
      queryClient.invalidateQueries({ queryKey: ['bikes'] })
    },
  })
}

// ComponentCategorySetting

// Fires one PATCH per dirty category (the per-category upsert endpoint
// already creates a row for a category that's never been saved before --
// "adding" a new category is just upserting a previously-unused name), then
// invalidates once -- backs the Settings page's single page-level Save,
// which commits every pending row at once rather than auto-saving per click.
export function useSaveComponentCategorySettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (rows: { category: string; changes: Partial<Omit<ComponentCategorySetting, 'category'>> }[]) =>
      Promise.all(
        rows.map(({ category, changes }) =>
          apiPatch<ComponentCategorySetting>(`/component_category_settings/${category}`, {
            component_category_setting: changes,
          }),
        ),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['component_category_settings'] }),
  })
}

// TableViewPreference
// A PATCH replaces the whole data JSONB value (no deep merge server-side),
// so the caller must always send the complete object.

export function useUpdateTableViewPreference(tableKey: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: TableViewPreferenceData) =>
      apiPatch<{ data: TableViewPreferenceData }>(`/table_view_preferences/${tableKey}`, {
        table_view_preference: { data },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['table_view_preferences', tableKey] }),
  })
}

// CategoryServiceInterval / ComponentServiceInterval
// Both affect components' live status, so every mutation here invalidates
// broadly (components, their service intervals, and the alert banners) --
// cheap at this data scale, same reasoning ComponentAssignment's mutations
// already use.

function invalidateIntervalRelatedQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['category_service_intervals'] })
  queryClient.invalidateQueries({ queryKey: ['component_service_intervals'] })
  queryClient.invalidateQueries({ queryKey: ['components'] })
  queryClient.invalidateQueries({ queryKey: ['maintenance_alerts'] })
}

export function useCreateCategoryServiceInterval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: CategoryServiceIntervalPayload) =>
      apiPost<CategoryServiceInterval>('/category_service_intervals', { category_service_interval: values }),
    onSuccess: () => invalidateIntervalRelatedQueries(queryClient),
  })
}

export function useUpdateCategoryServiceInterval(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<CategoryServiceIntervalPayload>) =>
      apiPatch<CategoryServiceInterval>(`/category_service_intervals/${id}`, { category_service_interval: values }),
    onSuccess: () => invalidateIntervalRelatedQueries(queryClient),
  })
}

export function useDeleteCategoryServiceInterval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/category_service_intervals/${id}`),
    onSuccess: () => invalidateIntervalRelatedQueries(queryClient),
  })
}

// Applies a category template to the given, not-yet-covered components.
export function useApplyCategoryServiceInterval(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (componentIds: number[]) =>
      apiPost<void>(`/category_service_intervals/${id}/apply`, { component_ids: componentIds }),
    onSuccess: () => invalidateIntervalRelatedQueries(queryClient),
  })
}

export function useCreateComponentServiceInterval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: ComponentServiceIntervalPayload) =>
      apiPost<ComponentServiceInterval>('/component_service_intervals', { component_service_interval: values }),
    onSuccess: () => invalidateIntervalRelatedQueries(queryClient),
  })
}

export function useUpdateComponentServiceInterval(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<ComponentServiceIntervalPayload>) =>
      apiPatch<ComponentServiceInterval>(`/component_service_intervals/${id}`, { component_service_interval: values }),
    onSuccess: () => invalidateIntervalRelatedQueries(queryClient),
  })
}

export function useDeleteComponentServiceInterval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/component_service_intervals/${id}`),
    onSuccess: () => invalidateIntervalRelatedQueries(queryClient),
  })
}

// "+ Add from category defaults" on the component page.
export function useApplyDefaultComponentServiceIntervals() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ componentId, categoryServiceIntervalIds }: { componentId: number; categoryServiceIntervalIds: number[] }) =>
      apiPost<ComponentServiceInterval[]>('/component_service_intervals/apply_defaults', {
        component_id: componentId,
        category_service_interval_ids: categoryServiceIntervalIds,
      }),
    onSuccess: () => invalidateIntervalRelatedQueries(queryClient),
  })
}

// NotificationSetting
// A singleton per user, upserted the same way as TableViewPreference.

export function useUpdateNotificationSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<NotificationSettingPayload>) =>
      apiPatch<NotificationSetting>('/notification_settings', { notification_setting: values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification_settings'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance_alerts'] })
    },
  })
}
