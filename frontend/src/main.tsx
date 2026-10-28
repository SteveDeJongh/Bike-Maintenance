import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { ModalsProvider } from '@mantine/modals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import './index.css'
import App from './App.tsx'

// Applies to every DateTimePicker in the app in one place, rather than
// passing the same two props at each of its call sites. Both are needed:
// timePickerProps.format controls the dropdown's own time controls,
// valueFormat controls the text shown in the closed input -- Mantine
// doesn't tie these together.
const theme = createTheme({
  components: {
    DateTimePicker: {
      defaultProps: {
        timePickerProps: { format: '12h' },
        valueFormat: 'DD/MM/YYYY hh:mm A',
      },
    },
  },
})

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme}>
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
