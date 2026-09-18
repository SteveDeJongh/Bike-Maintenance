import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiPatch, apiPost } from './client'
import type { Bike, Component, ComponentAssignment, MaintenanceEvent } from '../types/models'

export type BikePayload = Omit<Bike, 'id'>
export type ComponentPayload = Omit<Component, 'id'>
export type ComponentAssignmentPayload = Omit<ComponentAssignment, 'id'>
export type MaintenanceEventPayload = Omit<MaintenanceEvent, 'id'>

// Bike

export function useCreateBike() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: BikePayload) => apiPost<Bike>('/bikes', { bike: values }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bikes'] }),
  })
}

export function useUpdateBike(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<BikePayload>) => apiPatch<Bike>(`/bikes/${id}`, { bike: values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bikes'] })
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
