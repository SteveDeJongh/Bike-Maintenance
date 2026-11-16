import { useMediaQuery } from '@mantine/hooks'

// The one shared mobile breakpoint -- Mantine's `sm` (48em / 768px), same
// cutoff Activity.tsx's own `isNarrow` check already used before this hook
// existed. Steps 2/3 of the mobile work (a responsive datatable kit, full-
// screen modals) reuse this rather than each picking their own query.
export const MOBILE_BREAKPOINT_QUERY = '(max-width: 768px)'

// getInitialValueInEffect: false makes this read window.matchMedia
// synchronously on the first render instead of returning a default value
// and correcting one render later in a useEffect -- this app is pure CSR
// (no SSR), so `window` is always available, and skipping the effect-timed
// correction is what avoids a flash of the desktop layout on a phone.
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_BREAKPOINT_QUERY, false, { getInitialValueInEffect: false })
}
