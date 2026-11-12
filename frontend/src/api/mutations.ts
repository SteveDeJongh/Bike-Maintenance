import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiPatch, apiPost, apiPut } from './client'
import { BIKE_CHANGE_GROUPS, invalidate, RIDE_DATA_GROUPS } from './invalidation'
import type {
  Bike,
  BikeComponentSlot,
  BikeType,
  CategoryServiceInterval,
  Component,
  ComponentAssignment,
  ComponentCategorySetting,
  ComponentServiceInterval,
  MaintenanceAlertScope,
  MaintenanceEvent,
  NotificationSetting,
  ServiceSession,
  ServiceType,
  TableViewPreferenceData,
  User,
} from '../types/models'
import { maintenanceAlertScopeParams } from './queries'

// Auth

export interface RegisterPayload {
  name: string
  email: string
  password: string
}

export function useRegister() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: RegisterPayload) => apiPost<User>('/auth/register', { user: values }),
    onSuccess: (user) => queryClient.setQueryData(['me'], user),
  })
}

export interface LoginPayload {
  email: string
  password: string
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: LoginPayload) => apiPost<User>('/auth/login', values),
    onSuccess: (user) => queryClient.setQueryData(['me'], user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiDelete('/auth/logout'),
    onSuccess: () => queryClient.clear(),
  })
}

// Always resolves with a generic success, even when the email doesn't
// match an account -- the API deliberately never reveals that.
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => apiPost<void>('/auth/password/forgot', { email }),
  })
}

export interface ResetPasswordPayload {
  token: string
  password: string
}

export function useResetPassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: ResetPasswordPayload) => apiPost<User>('/auth/password/reset', values),
    onSuccess: (user) => queryClient.setQueryData(['me'], user),
  })
}

export function useVerifyEmail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => apiPost<User>('/auth/email/verify', { token }),
    onSuccess: (user) => queryClient.setQueryData(['me'], user),
  })
}

export function useResendVerification() {
  return useMutation({
    mutationFn: () => apiPost<void>('/auth/email/resend', {}),
  })
}

export interface UpdateMePayload {
  name?: string
  email?: string
}

export function useUpdateMe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: UpdateMePayload) => apiPatch<User>('/me', { user: values }),
    onSuccess: (user) => queryClient.setQueryData(['me'], user),
  })
}

export interface UpdateMyPasswordPayload {
  current_password?: string
  password: string
}

export function useUpdateMyPassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: UpdateMyPasswordPayload) => apiPut<User>('/me/password', values),
    onSuccess: (user) => queryClient.setQueryData(['me'], user),
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (password?: string) => apiDelete('/me', password ? { password } : undefined),
    onSuccess: () => queryClient.clear(),
  })
}

export function useUnlinkIdentity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (provider: string) => apiDelete(`/me/identities/${provider}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })
}

export type BikePayload = Omit<Bike, 'id' | 'created_at'>
export type BikeTypePayload = Omit<BikeType, 'id'>
export type ComponentPayload = Omit<Component, 'id'>
export type ComponentAssignmentPayload = Omit<ComponentAssignment, 'id'>
// service_session_id is never sent here -- it's only ever set via the batch
// service logger's own POST /bikes/:id/service_sessions, never through this
// single-event create/update path.
export type MaintenanceEventPayload = Omit<MaintenanceEvent, 'id' | 'service_session_id'>
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
    onSuccess: () => invalidate(queryClient, ...BIKE_CHANGE_GROUPS),
  })
}

export function useUpdateBike(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<BikePayload>) => apiPatch<Bike>(`/bikes/${id}`, { bike: values }),
    onSuccess: () => invalidate(queryClient, ...BIKE_CHANGE_GROUPS),
  })
}

export function useDeleteBike() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/bikes/${id}`),
    onSuccess: () => invalidate(queryClient, ...BIKE_CHANGE_GROUPS),
  })
}

export interface ComponentSetupRow {
  category: string
  // Drives both the new BikeComponentSlot's and ComponentAssignment's
  // ride_context -- lets a category that allows_multiple_assignments be
  // set up as two rows (one outdoor_only, one indoor_only) in the same batch.
  ride_context: 'both' | 'outdoor_only' | 'indoor_only'
  label: string
  brand: string | null
  model: string | null
  notes: string | null
}

export interface ComponentSetupPayload {
  installed_on: string
  components: ComponentSetupRow[]
}

// The batched "set up all components for a bike at once" step -- creates a
// BikeComponentSlot + Component + ComponentAssignment per row, all or
// nothing (see BikesController#component_setup).
export function useComponentSetup(bikeId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ComponentSetupPayload) => apiPost<Bike>(`/bikes/${bikeId}/component_setup`, payload),
    onSuccess: () => invalidate(queryClient, 'setup', 'serviceStatus', 'history', 'categorySettings'),
  })
}

// BikeType

export function useCreateBikeType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: BikeTypePayload) => apiPost<BikeType>('/bike_types', { bike_type: values }),
    onSuccess: () => invalidate(queryClient, 'bikeTypes'),
  })
}

export function useUpdateBikeType(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<BikeTypePayload>) => apiPatch<BikeType>(`/bike_types/${id}`, { bike_type: values }),
    onSuccess: () => invalidate(queryClient, 'bikeTypes'),
  })
}

export function useDeleteBikeType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/bike_types/${id}`),
    // A deleted bike type nullifies bike_type_id on bikes using it, so the
    // Bikes list's Type column needs refreshing too.
    onSuccess: () => invalidate(queryClient, 'bikeTypes', 'serviceStatus'),
  })
}

// BikeComponentSlot
// Slots are embedded in GET /bikes/:id ('serviceStatus' covers ['bikes']).

export function useCreateBikeComponentSlot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: BikeComponentSlotPayload) =>
      apiPost<BikeComponentSlot>('/bike_component_slots', { bike_component_slot: values }),
    onSuccess: () => invalidate(queryClient, 'serviceStatus'),
  })
}

export function useDeleteBikeComponentSlot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/bike_component_slots/${id}`),
    onSuccess: () => invalidate(queryClient, 'serviceStatus'),
  })
}

// Component

export function useCreateComponent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: ComponentPayload) => apiPost<Component>('/components', { component: values }),
    onSuccess: () => invalidate(queryClient, 'serviceStatus', 'categorySettings'),
  })
}

export function useUpdateComponent(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<ComponentPayload>) =>
      apiPatch<Component>(`/components/${id}`, { component: values }),
    onSuccess: () => invalidate(queryClient, 'serviceStatus', 'history', 'categorySettings'),
  })
}

export function useDeleteComponent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/components/${id}`),
    onSuccess: () => invalidate(queryClient, 'serviceStatus', 'history', 'setup', 'intervals'),
  })
}

// ComponentAssignment
// Moving a component on/off a bike changes which rides accrue to it, so
// service status (alerts, dashboard, picker) moves too, not just the views.


export function useCreateComponentAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: ComponentAssignmentPayload) =>
      apiPost<ComponentAssignment>('/component_assignments', { component_assignment: values }),
    onSuccess: () => invalidate(queryClient, 'setup', 'serviceStatus', 'history'),
  })
}

export function useUpdateComponentAssignment(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<ComponentAssignmentPayload>) =>
      apiPatch<ComponentAssignment>(`/component_assignments/${id}`, { component_assignment: values }),
    onSuccess: () => invalidate(queryClient, 'setup', 'serviceStatus', 'history'),
  })
}

export function useDeleteComponentAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/component_assignments/${id}`),
    onSuccess: () => invalidate(queryClient, 'setup', 'serviceStatus', 'history'),
  })
}

// ServiceType

export function useCreateServiceType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: ServiceTypePayload) => apiPost<ServiceType>('/service_types', { service_type: values }),
    onSuccess: () => invalidate(queryClient, 'serviceTypes'),
  })
}

export function useUpdateServiceType(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<ServiceTypePayload>) =>
      apiPatch<ServiceType>(`/service_types/${id}`, { service_type: values }),
    onSuccess: () => invalidate(queryClient, 'serviceTypes', 'serviceStatus', 'history', 'intervals'),
  })
}

export function useDeleteServiceType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/service_types/${id}`),
    onSuccess: () => invalidate(queryClient, 'serviceTypes'),
  })
}

// MaintenanceEvent
// Logging (or deleting) an event is what moves a service interval's
// baseline, so every mutation here refreshes service status too -- not just
// the event list itself.


export function useCreateMaintenanceEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: MaintenanceEventPayload) =>
      apiPost<MaintenanceEvent>('/maintenance_events', { maintenance_event: values }),
    onSuccess: () => invalidate(queryClient, 'history', 'serviceStatus'),
  })
}

export function useUpdateMaintenanceEvent(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<MaintenanceEventPayload>) =>
      apiPatch<MaintenanceEvent>(`/maintenance_events/${id}`, { maintenance_event: values }),
    onSuccess: () => invalidate(queryClient, 'history', 'serviceStatus'),
  })
}

export function useDeleteMaintenanceEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/maintenance_events/${id}`),
    onSuccess: () => invalidate(queryClient, 'history', 'serviceStatus'),
  })
}

// ServiceSession (the batch service logger)

export interface ServiceSessionEventPayload {
  component_id: number
  service_type_id: number
  notes?: string | null
}

export interface CreateServiceSessionPayload {
  bikeId: number
  performed_at: string
  notes?: string | null
  events: ServiceSessionEventPayload[]
}

export function useCreateServiceSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ bikeId, ...payload }: CreateServiceSessionPayload) =>
      apiPost<ServiceSession>(`/bikes/${bikeId}/service_sessions`, payload),
    onSuccess: () => invalidate(queryClient, 'history', 'serviceStatus'),
  })
}

export function useUpdateServiceSession(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: { performed_at?: string; notes?: string | null }) =>
      apiPatch<ServiceSession>(`/service_sessions/${id}`, values),
    onSuccess: () => invalidate(queryClient, 'history', 'serviceStatus'),
  })
}

export function useDeleteServiceSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/service_sessions/${id}`),
    onSuccess: () => invalidate(queryClient, 'history', 'serviceStatus'),
  })
}

// Strava

// full: true triggers a full refresh (re-reads the user's entire Strava
// history and reconciles rides gone from Strava) instead of an incremental
// sync -- see useStravaSyncRunner for the completion-polling that now
// covers both pages/both modes with one shared mechanism.
export function useSyncStrava() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload?: { full?: boolean }) => apiPost<void>('/strava/sync', payload ?? {}),
    onSuccess: () => invalidate(queryClient, ...RIDE_DATA_GROUPS),
  })
}

export function useRefreshGear() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<void>('/strava/refresh_gear', {}),
    onSuccess: () => invalidate(queryClient, 'gear'),
  })
}

export function useReassignGear() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ gearId, bikeId }: { gearId: string; bikeId: number | null }) =>
      apiPatch<void>(`/strava/mapped_gear/${gearId}`, { bike_id: bikeId }),
    onSuccess: () => invalidate(queryClient, ...RIDE_DATA_GROUPS),
  })
}

export function useIgnoreGear() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (gearId: string) => apiPost<void>('/strava/ignore_gear', { gear_id: gearId }),
    onSuccess: () => invalidate(queryClient, ...RIDE_DATA_GROUPS),
  })
}

export function useUnignoreGear() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (gearId: string) => apiPost<void>('/strava/unignore_gear', { gear_id: gearId }),
    onSuccess: () => invalidate(queryClient, ...RIDE_DATA_GROUPS),
  })
}

// Strava Rides tab -- ride-level ignore/un-ignore.

export function useIgnoreRides() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { activity_ids: number[] } | { all_matching: true; status: string }) =>
      apiPost<{ ignored_count: number }>('/strava/rides/ignore', payload),
    onSuccess: () => invalidate(queryClient, ...RIDE_DATA_GROUPS),
  })
}

export function useUnignoreRides() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { activity_ids: number[] }) =>
      apiPost<{ unignored_count: number }>('/strava/rides/unignore', payload),
    onSuccess: () => invalidate(queryClient, ...RIDE_DATA_GROUPS),
  })
}

// Re-fetches one ride from Strava (one API call, not a full paginated
// history refresh) and re-applies attribution -- can change bike_id/
// distance.
export function useResyncRide() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (rideId: number) => apiPost<{ deleted: boolean }>(`/strava/rides/${rideId}/resync`, {}),
    onSuccess: () => invalidate(queryClient, ...RIDE_DATA_GROUPS),
  })
}

// Bulk companion to useResyncRide, backing the Rides tab selection
// toolbar's "Resync selected" -- unlike useIgnoreRides, there's no
// all_matching variant here (see POST /strava/rides/resync's own comment:
// each row is its own live Strava call, so it's only ever offered for
// whatever's explicitly checked, not an unbounded "all N matching").
export interface ResyncRidesResult {
  resynced_count: number
  deleted_count: number
  failed_count: number
  // Only present when a rate limit stopped the batch early (a 200, not an
  // error -- the rows before it still committed).
  not_attempted_count?: number
  retry_at?: string
}

export function useResyncRides() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { activity_ids: number[] }) =>
      apiPost<ResyncRidesResult>('/strava/rides/resync', payload),
    onSuccess: () => invalidate(queryClient, ...RIDE_DATA_GROUPS),
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
    onSuccess: () => invalidate(queryClient, 'categorySettings'),
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
// Both affect components' live status, so every mutation here also
// refreshes service status.


export function useCreateCategoryServiceInterval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: CategoryServiceIntervalPayload) =>
      apiPost<CategoryServiceInterval>('/category_service_intervals', { category_service_interval: values }),
    onSuccess: () => invalidate(queryClient, 'intervals', 'serviceStatus'),
  })
}

export function useUpdateCategoryServiceInterval(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<CategoryServiceIntervalPayload>) =>
      apiPatch<CategoryServiceInterval>(`/category_service_intervals/${id}`, { category_service_interval: values }),
    onSuccess: () => invalidate(queryClient, 'intervals', 'serviceStatus'),
  })
}

export function useDeleteCategoryServiceInterval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/category_service_intervals/${id}`),
    onSuccess: () => invalidate(queryClient, 'intervals', 'serviceStatus'),
  })
}

// Applies a category template to the given, not-yet-covered components.
export function useApplyCategoryServiceInterval(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (componentIds: number[]) =>
      apiPost<void>(`/category_service_intervals/${id}/apply`, { component_ids: componentIds }),
    onSuccess: () => invalidate(queryClient, 'intervals', 'serviceStatus'),
  })
}

export function useCreateComponentServiceInterval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: ComponentServiceIntervalPayload) =>
      apiPost<ComponentServiceInterval>('/component_service_intervals', { component_service_interval: values }),
    onSuccess: () => invalidate(queryClient, 'intervals', 'serviceStatus'),
  })
}

export function useUpdateComponentServiceInterval(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<ComponentServiceIntervalPayload>) =>
      apiPatch<ComponentServiceInterval>(`/component_service_intervals/${id}`, { component_service_interval: values }),
    onSuccess: () => invalidate(queryClient, 'intervals', 'serviceStatus'),
  })
}

export function useDeleteComponentServiceInterval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/component_service_intervals/${id}`),
    onSuccess: () => invalidate(queryClient, 'intervals', 'serviceStatus'),
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
    onSuccess: () => invalidate(queryClient, 'intervals', 'serviceStatus'),
  })
}

// NotificationSetting
// A singleton per user, upserted the same way as TableViewPreference.

export function useUpdateNotificationSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<NotificationSettingPayload>) =>
      apiPatch<NotificationSetting>('/notification_settings', { notification_setting: values }),
    onSuccess: () => invalidate(queryClient, 'notificationSettings', 'alertVisibility'),
  })
}

// ServiceAlertDismissal
// A dismissal only ever affects alert visibility (the banners, and the
// dashboard's "dismissed" flag), not any interval's computed status.

export function useDismissServiceAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (componentServiceIntervalId: number) =>
      apiPost<void>('/service_alert_dismissals', { component_service_interval_id: componentServiceIntervalId }),
    onSuccess: () => invalidate(queryClient, 'alertVisibility'),
  })
}

// Dismisses every alert of one status within one scope (backs each
// banner's own "dismiss all" -- it must not also clear the other banner's
// alerts, or another bike/component's).
export function useDismissAllServiceAlerts(scope: MaintenanceAlertScope) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (status: 'warning' | 'due') =>
      apiPost<void>('/service_alert_dismissals/dismiss_all', { status, ...maintenanceAlertScopeParams(scope) }),
    onSuccess: () => invalidate(queryClient, 'alertVisibility'),
  })
}
