import { useEffect, useRef, useState } from 'react'
import { useStravaStatus } from '../api/queries'
import { useSyncStrava } from '../api/mutations'
import type { SyncFailureCode } from '../types/models'

const POLL_CAP_MS = 30_000
const FULL_POLL_CAP_MS = 3 * 60_000

export interface SyncFailure {
  code: SyncFailureCode
  retryAt: string | null
}

// Per-button state for one "Sync now"/"Refresh all rides" control: the
// pending state, a matching failure message, and the "still running" hint.
// It does NOT invalidate anything on completion and does NOT poll on its
// own: useSyncCompletionWatcher (mounted once, in Layout) is the single
// place a completed sync refreshes ride data, and its 2s poll of
// ['strava', 'status'] -- switched on by sync_in_progress -- is what feeds
// this hook's reads of the same query. Page-scoped polling used to die the
// moment the user navigated away mid-sync; the watcher doesn't.
export function useStravaSyncRunner({ full = false }: { full?: boolean } = {}) {
  const [polling, setPolling] = useState(false)
  const [failure, setFailure] = useState<SyncFailure | null>(null)
  const [stillRunning, setStillRunning] = useState(false)
  const preSyncRef = useRef<string | null>(null)
  const preFailureRef = useRef<string | null>(null)
  const syncMutation = useSyncStrava()
  const pollCapMs = full ? FULL_POLL_CAP_MS : POLL_CAP_MS

  // No refetchInterval of its own: the watcher's poll (switched on by
  // sync_in_progress) is what updates this query while a sync runs.
  const { data: status } = useStravaStatus()
  const watchedTimestamp = full ? status?.last_full_sync_at : status?.last_synced_at

  useEffect(() => {
    if (!polling || watchedTimestamp === undefined) return

    const changed = watchedTimestamp !== preSyncRef.current
    // last_sync_failed_kind matters because an incremental and a full sync
    // aren't mutually exclusive (only the full path is lock-guarded) -- each
    // hook instance should only react to a failure matching the run *it*
    // triggered, not one from a differently-triggered run that happens to
    // be in flight at the same time.
    const failed = status?.last_sync_failed_at != null
      && status.last_sync_failed_at !== preFailureRef.current
      && status.last_sync_failed_kind === (full ? 'full' : 'incremental')

    // A success needs nothing else here: the watcher invalidates ride data.
    if (changed) {
      setPolling(false)
    } else if (failed) {
      setPolling(false)
      setFailure({ code: status!.last_sync_error!, retryAt: status!.last_sync_retry_at })
    }
  }, [watchedTimestamp, status, polling, full])

  // The cap is a plain timer, not a check inside the effect above: that
  // effect only runs when a poll lands, and polling stops on its own once
  // sync_in_progress clears -- so a cap checked there could never fire for
  // a run whose flag was cleared early (e.g. by an overlapping run).
  useEffect(() => {
    if (!polling) return
    const timer = setTimeout(() => {
      setPolling(false)
      setStillRunning(true)
    }, pollCapMs)
    return () => clearTimeout(timer)
  }, [polling, pollCapMs])

  function sync() {
    preSyncRef.current = watchedTimestamp ?? null
    preFailureRef.current = status?.last_sync_failed_at ?? null
    setFailure(null)
    setStillRunning(false)
    syncMutation.mutate({ full }, { onSuccess: () => setPolling(true) })
  }

  return { sync, syncing: syncMutation.isPending || polling, status, error: syncMutation.error, failure, stillRunning }
}
