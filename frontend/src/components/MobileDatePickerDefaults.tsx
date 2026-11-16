import { useMemo, type ReactNode } from 'react'
import { createTheme, MantineThemeProvider } from '@mantine/core'
import { DatePickerInput, DateTimePicker } from '@mantine/dates'
import { useIsMobile } from '../hooks/useIsMobile'

// AppModal's full-screen mobile modals clip or push off-screen a
// popover-anchored date picker dropdown -- there's no good anchor point
// inside a fullScreen modal's own flow. dropdownType="modal" opens the
// picker as its own centered modal instead, which works regardless of
// what's already open behind it.
//
// Mantine's theme `components` defaultProps mechanism (main.tsx already
// uses it for DateTimePicker's own format props) can't take a responsive
// value directly -- a theme is a plain object, not reactive to viewport
// size. This nests a themed override, recomputed from useIsMobile(), so
// the same centralized-default pattern still applies without a usage
// site having to pass dropdownType itself: every DatePickerInput/
// DateTimePicker in the app picks it up automatically.
//
// DateInput (9 usages) is deliberately NOT included here -- unlike
// DatePickerInput/DateTimePicker, it doesn't extend PickerInputBase and
// has no dropdownType prop at all in this Mantine version (confirmed via
// its own .d.ts; passing it is a TS error, not just a no-op). Swapping
// those 9 usages to DatePickerInput just to gain modal mode would trade
// DateInput's direct-keyboard-entry typing for a click-to-open-calendar
// UX -- a real behavior change, not a drop-in. Left as a plain popover on
// mobile instead; least-repetitive tradeoff until/unless Mantine adds
// dropdownType to DateInput itself.
export default function MobileDatePickerDefaults({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile()

  const theme = useMemo(() => {
    const dropdownType = isMobile ? 'modal' : 'popover'
    return createTheme({
      components: {
        DatePickerInput: DatePickerInput.extend({ defaultProps: { dropdownType } }),
        DateTimePicker: DateTimePicker.extend({ defaultProps: { dropdownType } }),
      },
    })
  }, [isMobile])

  return <MantineThemeProvider theme={theme}>{children}</MantineThemeProvider>
}
