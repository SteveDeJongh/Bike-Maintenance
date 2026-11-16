import { em } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'

// The one shared mobile breakpoint. Deliberately *not* `(max-width: 768px)`
// -- Mantine's `sm` breakpoint (the nav shell's own AppShell.Navbar
// `breakpoint="sm"`, and every other CSS breakpoint in this app) resolves
// to `min-width: 48em`, so at exactly 768px wide that CSS already shows the
// desktop sidebar. A JS query of `max-width: 768px` is inclusive of that
// same width, so the two would disagree right at the boundary -- this one
// stops just under it (`em(767.98)`, same unit Mantine's own breakpoints
// use) so this hook and the CSS breakpoint it has to agree with can never
// both be true at once. index.css's iOS-input-zoom fix (see "Layout and
// navigation" in CLAUDE.md) uses the literal `767.98px` for the same
// reason -- keep both in sync if this ever changes.
export const MOBILE_BREAKPOINT_QUERY = `(max-width: ${em(767.98)})`

// getInitialValueInEffect: false makes this read window.matchMedia
// synchronously on the first render instead of returning a default value
// and correcting one render later in a useEffect -- this app is pure CSR
// (no SSR), so `window` is always available, and skipping the effect-timed
// correction is what avoids a flash of the desktop layout on a phone.
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_BREAKPOINT_QUERY, false, { getInitialValueInEffect: false })
}
