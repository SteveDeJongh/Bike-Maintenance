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

export const COMPONENT_CATEGORY_LABELS: Record<ComponentCategory, string> = {
  chain: 'Chain',
  cassette: 'Cassette',
  chainring: 'Chainring',
  tire_front: 'Front Tire',
  tire_rear: 'Rear Tire',
  wheel_front: 'Front Wheel',
  wheel_rear: 'Rear Wheel',
  brake_pads_front: 'Front Brake Pads',
  brake_pads_rear: 'Rear Brake Pads',
  bottom_bracket: 'Bottom Bracket',
  handlebar_tape: 'Handlebar Tape',
  saddle: 'Saddle',
}

export function categoryLabel(category: string): string {
  return COMPONENT_CATEGORY_LABELS[category as ComponentCategory] ?? category
}

// Must match MaintenanceEvent::EVENT_TYPES in api/app/models/maintenance_event.rb exactly.
export const MAINTENANCE_EVENT_TYPES = ['wax', 'clean', 'replace', 'inspect'] as const
