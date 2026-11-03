import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme, localStorageColorSchemeManager } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { ModalsProvider } from '@mantine/modals'
import { QueryClientProvider } from '@tanstack/react-query'
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import './index.css'
import App from './App.tsx'
import { queryClient } from './api/queryClient'

// Applies to every DateTimePicker in the app in one place, rather than
// passing the same two props at each of its call sites. Both are needed:
// timePickerProps.format controls the dropdown's own time controls,
// valueFormat controls the text shown in the closed input -- Mantine
// doesn't tie these together.
const theme = createTheme({
  colors: {
    // True-black body with layered greys for surfaces (Paper/Modal/AppShell
    // header -- see index.css, which lifts those to shade 6) and off-white/
    // grey text at a few strengths (0 primary, 2 dimmed). Index 0 = lightest,
    // 9 = darkest -- this mirrors the CSS-variable wiring Mantine's own
    // stylesheet uses (text=0, dimmed=2, placeholder=3, border=4, hover=5,
    // default/surface=6, body=7), just with a near-black shade 7 instead of
    // Mantine's default charcoal.
    dark: [
      '#EDEDEC',
      '#D6D6D4',
      '#A8A8A6',
      '#828280',
      '#4A4A48',
      '#333331',
      '#1C1C1A',
      '#0A0A0A',
      '#050505',
      '#000000',
    ],
    // Phosphor "radar screen" green accent, used as primaryColor in both
    // modes -- shade 8 for light mode (deep enough to stay readable on
    // white), shade 4 for dark mode (the bright phosphor green itself).
    // Same lightness ramp as pure hue-120 green, saturation pulled down to
    // ~80% so it reads as phosphor green rather than maximum-saturation neon.
    radar: [
      '#E9FDE9',
      '#BBF7BB',
      '#8DF28D',
      '#5FED5F',
      '#2BE82B',
      '#17CF17',
      '#13AE13',
      '#0F8A0F',
      '#0C690C',
      '#084508',
    ],
  },
  primaryColor: 'radar',
  primaryShade: { light: 8, dark: 4 },
  autoContrast: true,
  components: {
    DateTimePicker: {
      defaultProps: {
        timePickerProps: { format: '12h' },
        valueFormat: 'DD/MM/YYYY hh:mm A',
      },
    },
  },
})

const colorSchemeManager = localStorageColorSchemeManager()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto" colorSchemeManager={colorSchemeManager}>
      {/* Sunday-start weeks for every Calendar-based picker (DateInput,
          DateTimePicker) app-wide -- weekendDays already defaults to
          [0, 6] regardless of firstDayOfWeek, so no change needed there. */}
      <DatesProvider settings={{ firstDayOfWeek: 0 }}>
        <ModalsProvider>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  </StrictMode>,
)
