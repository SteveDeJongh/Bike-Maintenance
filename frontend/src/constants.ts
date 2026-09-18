export const COMPONENT_CATEGORIES = [
  'chain',
  'cassette',
  'chainring',
  'tire_front',
  'tire_rear',
  'wheel_front',
  'wheel_rear',
  'brake_pads_front',
  'brake_pads_rear',
  'bottom_bracket',
  'handlebar_tape',
  'saddle',
] as const

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number]

// Must match MaintenanceEvent::EVENT_TYPES in api/app/models/maintenance_event.rb exactly.
export const MAINTENANCE_EVENT_TYPES = ['wax', 'clean', 'replace', 'inspect'] as const
