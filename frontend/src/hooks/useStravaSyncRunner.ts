import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStravaStatus } from '../api/queries'
import { useSyncStrava } from '../api/mutations'

const POLL_INTERVAL_MS = 2_000
const POLL_CAP_MS = 30_000
const FULL_POLL_CAP_MS = 3 * 60_000

// Every ride-derived key, invalidated once polling detects completion --
// the same fixed list regardless of caller or full/incremental.
const INVALIDATE_KEYS = [
  ['strava'], ['bikes'], ['bike_rides'], ['dashboard'], ['maintenance_alerts'], ['components'], ['strava_rides'],
]

// Fully self-contained: owns its own polling state and its own
// useStravaStatus poll (React Query dedupes this against any other
// useStravaStatus call on the same page -- it's not a second request).
// Deliberately doesn't ride on the caller's own query (e.g. Dashboard's
// useDashboard) the way the original Dashboard-only implementation did --
// that would mean this hook's "what changed" signal depends on data the
// caller fetched, which is awkward to order against the caller also
// needing this hook's `polling` for ITS OWN refetchInterval. Decoupling
// costs Dashboard a few seconds of bike-cards-not-live-updating-yet during
// the poll window -- the final ['dashboard'] invalidation on completion
// still gives the up-to-date view.
export function useStravaSyncRunner({ full = false }: { full?: boolean } = {}) {
  const queryClient = useQueryClient()
  const [polling, setPolling] = useState(false)
  const preSyncRef = useRef<string | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const syncMutation = useSyncStrava()
  const pollCapMs = full ? FULL_POLL_CAP_MS : POLL_CAP_MS

  const { data: status } = useStravaStatus({ refetchInterval: polling ? POLL_INTERVAL_MS : false })
  const watchedTimestamp = full ? status?.last_full_sync_at : status?.last_synced_at

  useEffect(() => {
    if (!polling || watchedTimestamp === undefined) return
    if (startedAtRef.current == null) startedAtRef.current = Date.now()

    const changed = watchedTimestamp !== preSyncRef.current
    const timedOut = Date.now() - startedAtRef.current > pollCapMs

    if (changed || timedOut) {
      setPolling(false)
      startedAtRef.current = null
      if (changed) INVALIDATE_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }))
    }
  }, [watchedTimestamp, polling, pollCapMs, queryClient])

  function sync() {
    preSyncRef.current = watchedTimestamp ?? null
    startedAtRef.current = null
    syncMutation.mutate({ full }, { onSuccess: () => setPolling(true) })
  }

  return { sync, syncing: syncMutation.isPending || polling, status, error: syncMutation.error }
}
