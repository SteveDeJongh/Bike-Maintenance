import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { Bike, Component, MaintenanceEvent } from '../types/models'

export function useBikes() {
  return useQuery({
    queryKey: ['bikes'],
    queryFn: () => apiGet<Bike[]>('/bikes'),
  })
}

export function useComponents() {
  return useQuery({
    queryKey: ['components'],
    queryFn: () => apiGet<Component[]>('/components'),
  })
}

export function useMaintenanceEvents() {
  return useQuery({
    queryKey: ['maintenance_events'],
    queryFn: () => apiGet<MaintenanceEvent[]>('/maintenance_events'),
  })
}
