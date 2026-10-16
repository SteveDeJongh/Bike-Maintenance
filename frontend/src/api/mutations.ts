import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiPatch, apiPost } from './client'
import type {
  Bike,
  BikeComponentSlot,
  Component,
  ComponentAssignment,
  MaintenanceEvent,
} from '../types/models'

export type BikePayload = Omit<Bike, 'id' | 'created_at'>
export type ComponentPayload = Omit<Component, 'id'>
export type ComponentAssignmentPayload = Omit<ComponentAssignment, 'id'>
export type MaintenanceEventPayload = Omit<MaintenanceEvent, 'id'>
export type BikeComponentSlotPayload = Omit<BikeComponentSlot, 'id'>

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

// MaintenanceEvent

export function useCreateMaintenanceEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: MaintenanceEventPayload) =>
      apiPost<MaintenanceEvent>('/maintenance_events', { maintenance_event: values }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['maintenance_events'] }),
  })
}

export function useUpdateMaintenanceEvent(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<MaintenanceEventPayload>) =>
      apiPatch<MaintenanceEvent>(`/maintenance_events/${id}`, { maintenance_event: values }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['maintenance_events'] }),
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
