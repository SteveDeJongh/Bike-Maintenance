import react from '@vitejs/plugin-react'
// vitest/config re-exports Vite's own defineConfig, just typed to also
// know about the `test` key below -- plain `vite`'s defineConfig doesn't.
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // node environment, not jsdom -- these tests exercise plain functions
  // (date-range math, activity-item helpers), nothing renders. Add jsdom
  // (or React Testing Library) only once a test actually needs to mount a
  // component.
  test: {
    environment: 'node',
  },
})
