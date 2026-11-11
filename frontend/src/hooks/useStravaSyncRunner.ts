import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStravaStatus } from '../api/queries'
import { useSyncStrava } from '../api/mutations'
import type { SyncFailureCode } from '../types/models'

const POLL_INTERVAL_MS = 2_000
const POLL_CAP_MS = 30_000
const FULL_POLL_CAP_MS = 3 * 60_000

// Every ride-derived key, invalidated once polling detects completion --
// the same fixed list regardless of caller or full/incremental. Exported
// so useResyncRide (api/mutations.ts) can invalidate the same set after a
// single-ride resync, which can also change bike_id/distance -- rather
// than hand-maintaining a second copy of "every key derived from ride data."
export const INVALIDATE_KEYS = [
  ['strava'], ['bikes'], ['bike_rides'], ['dashboard'], ['maintenance_alerts'], ['components'], ['strava_rides'],
  ['activity'],
]

export interface SyncFailure {
  code: SyncFailureCode
  retryAt: string | null
}

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
  const [failure, setFailure] = useState<SyncFailure | null>(null)
  const [stillRunning, setStillRunning] = useState(false)
  const preSyncRef = useRef<string | null>(null)
  const preFailureRef = useRef<string | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const syncMutation = useSyncStrava()
  const pollCapMs = full ? FULL_POLL_CAP_MS : POLL_CAP_MS

  const { data: status } = useStravaStatus({ refetchInterval: polling ? POLL_INTERVAL_MS : false })
  const watchedTimestamp = full ? status?.last_full_sync_at : status?.last_synced_at

  useEffect(() => {
    if (!polling || watchedTimestamp === undefined) return
    if (startedAtRef.current == null) startedAtRef.current = Date.now()

    const changed = watchedTimestamp !== preSyncRef.current
    // last_sync_failed_kind matters because an incremental and a full sync
    // aren't mutually exclusive (only the full path is lock-guarded) -- each
    // hook instance should only react to a failure matching the run *it*
    // triggered, not one from a differently-triggered run that happens to
    // be in flight at the same time.
    const failed = status?.last_sync_failed_at != null
      && status.last_sync_failed_at !== preFailureRef.current
      && status.last_sync_failed_kind === (full ? 'full' : 'incremental')
    const timedOut = Date.now() - startedAtRef.current > pollCapMs

    if (changed || failed || timedOut) {
      setPolling(false)
      startedAtRef.current = null
      if (changed) {
        // Nothing was deleted/changed by a failed run, so ride queries are
        // only ever invalidated on an actual success.
        INVALIDATE_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }))
      } else if (failed) {
        setFailure({ code: status!.last_sync_error!, retryAt: status!.last_sync_retry_at })
      } else if (timedOut) {
        setStillRunning(true)
      }
    }
  }, [watchedTimestamp, status, polling, pollCapMs, full, queryClient])

  function sync() {
    preSyncRef.current = watchedTimestamp ?? null
    preFailureRef.current = status?.last_sync_failed_at ?? null
    startedAtRef.current = null
    setFailure(null)
    setStillRunning(false)
    syncMutation.mutate({ full }, { onSuccess: () => setPolling(true) })
  }

  return { sync, syncing: syncMutation.isPending || polling, status, error: syncMutation.error, failure, stillRunning }
}
