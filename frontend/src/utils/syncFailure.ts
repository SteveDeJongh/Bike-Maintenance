import type { SyncFailure } from '../hooks/useStravaSyncRunner'
import type { DashboardSyncSection } from '../types/models'

// Prefers the live sync runner's failure (it's from the exact run this page
// just triggered) but falls back to the credential's own last_sync_* fields
// (GET /dashboard) so a failure survives a reload -- useStravaSyncRunner's
// `failure` is in-memory, set only from a live poll. Once a later sync
// succeeds, last_synced_at moves past last_sync_failed_at and this starts
// returning null again on its own -- no separate "clear" step needed.
export function resolveFailure(
  sync: Pick<DashboardSyncSection, 'last_synced_at' | 'last_sync_failed_at' | 'last_sync_error' | 'last_sync_retry_at'>,
  liveFailure: SyncFailure | null,
): SyncFailure | null {
  if (liveFailure) return liveFailure
  if (!sync.last_sync_failed_at) return null
  if (sync.last_synced_at && sync.last_synced_at >= sync.last_sync_failed_at) return null

  return { code: sync.last_sync_error ?? 'unknown', retryAt: sync.last_sync_retry_at }
}
