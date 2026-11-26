import type { ComponentType } from 'react'
import {
  IconActivity,
  IconBike,
  IconBrandStrava,
  IconComponents,
  IconHome,
  IconSettings,
  IconTool,
} from '@tabler/icons-react'

// Loose on purpose -- a @tabler/icons-react icon's real type is a specific
// ForwardRefExoticComponent that won't structurally match another icon's,
// so anything that renders an icon coming from this config (or from
// Layout.tsx's own IconDots "More" tab, which isn't a route) types it as
// this instead.
export type NavIcon = ComponentType<{ size?: number | string; stroke?: number }>

export interface NavDestination {
  path: string
  label: string
  icon: NavIcon
  // Also one of the mobile bottom tab bar's fixed slots (see
  // MOBILE_TAB_ORDER below) -- every other destination lives only in the
  // desktop sidebar and the mobile "More" sheet.
  tab?: boolean
}

// The one place every top-level destination is defined -- the desktop
// sidebar (Layout.tsx) lists all of them in this order; the mobile tab bar
// uses the `tab: true` ones (see MOBILE_TAB_ORDER for its own order); the
// mobile "More" sheet lists the rest. Adding a page later means adding one
// entry here and deciding whether it's a tab or goes in More.
export const NAV_DESTINATIONS: NavDestination[] = [
  { path: '/', label: 'Home', icon: IconHome, tab: true },
  { path: '/activity', label: 'Activity', icon: IconActivity, tab: true },
  { path: '/bikes', label: 'Bikes', icon: IconBike, tab: true },
  { path: '/components', label: 'Components', icon: IconComponents, tab: true },
  { path: '/maintenance-events', label: 'Maintenance', icon: IconTool },
  { path: '/strava', label: 'Strava', icon: IconBrandStrava },
  { path: '/settings', label: 'Settings', icon: IconSettings },
]

// The mobile tab bar's own left-to-right order -- deliberately not the same
// as the sidebar's (Bikes before Activity): the four pages reached for
// most often, ordered for one-handed thumb reach, with "More" as a fixed
// fifth slot that isn't a route.
export const MOBILE_TAB_ORDER = ['/', '/bikes', '/activity', '/components']

export const TAB_DESTINATIONS: NavDestination[] = MOBILE_TAB_ORDER.map(
  (path) => NAV_DESTINATIONS.find((d) => d.path === path)!,
)

export const MORE_DESTINATIONS: NavDestination[] = NAV_DESTINATIONS.filter((d) => !d.tab)

// `/` matches only itself; every other destination matches its own path as
// a prefix, so /bikes/:id and /bikes/:id/setup highlight Bikes,
// /components/:id highlights Components, and /settings/* highlights
// Settings -- one rule for every destination, no per-item overrides.
export function isDestinationActive(destination: NavDestination, pathname: string): boolean {
  return destination.path === '/' ? pathname === '/' : pathname.startsWith(destination.path)
}
