import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStravaStatus } from '../api/queries'
import { invalidate, RIDE_DATA_GROUPS } from '../api/invalidation'

const POLL_INTERVAL_MS = 2_000

// The ONE place a completed Strava sync invalidates ride-derived data.
// Mounted once, in Layout (which wraps every authenticated route), because
// POST /strava/sync only enqueues StravaSyncJob: completion used to be
// noticed only by the page that pressed the button, and that page's polling
// died the moment the user navigated away -- leaving e.g. the Dashboard's
// sync strip stale until a reload.
//
// Polls GET /strava/status every 2s while it reports sync_in_progress (any
// kind, from any page, tab, device, or the scheduler), and not at all
// otherwise. A sync started elsewhere while nothing is polling is still
// caught on the next window focus (TanStack's default refetchOnWindowFocus),
// and a reload mid-sync resumes polling because the first status read
// already says sync_in_progress.
//
// useStravaSyncRunner reads this same ['strava', 'status'] query without an
// interval of its own -- two observers with their own timers would mean two
// requests per tick, since TanStack only dedupes fetches already in flight.
export function useSyncCompletionWatcher() {
  const queryClient = useQueryClient()
  const { data: status } = useStravaStatus({
    refetchInterval: (query) => (query.state.data?.sync_in_progress ? POLL_INTERVAL_MS : false),
  })
  // null until the first load; then the last-seen completion timestamps.
  const lastSeenRef = useRef<{ synced: string | null; fullSynced: string | null } | null>(null)

  const connected = status?.connected ?? false
  const synced = status?.last_synced_at ?? null
  const fullSynced = status?.last_full_sync_at ?? null

  useEffect(() => {
    if (!status || !connected) return

    const previous = lastSeenRef.current
    lastSeenRef.current = { synced, fullSynced }
    if (previous === null) return // first load: nothing has completed yet

    if (previous.synced !== synced || previous.fullSynced !== fullSynced) {
      invalidate(queryClient, ...RIDE_DATA_GROUPS)
    }
  }, [status, connected, synced, fullSynced, queryClient])
}
