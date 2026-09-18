import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type {
  Bike,
  Component,
  ComponentAssignment,
  ComponentDetail,
  MaintenanceEvent,
} from '../types/models'

export function useBikes() {
  return useQuery({
    queryKey: ['bikes'],
    queryFn: () => apiGet<Bike[]>('/bikes'),
  })
}

export function useBike(id: number) {
  return useQuery({
    queryKey: ['bikes', id],
    queryFn: () => apiGet<Bike>(`/bikes/${id}`),
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

export function useMaintenanceEvents() {
  return useQuery({
    queryKey: ['maintenance_events'],
    queryFn: () => apiGet<MaintenanceEvent[]>('/maintenance_events'),
  })
}
