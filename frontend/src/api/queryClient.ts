import { QueryClient } from '@tanstack/react-query'

// Exported as a singleton (rather than created inline in main.tsx) so
// anything outside the component tree -- the client's 401 handler, in
// particular -- can clear it without needing a hook.
export const queryClient = new QueryClient()
