import { formatDateTime } from './datetime'
import type { SyncFailureCode } from '../types/models'

// Copy for a sync job failure reported via useStravaSyncRunner's polling
// (StravaSyncJob#classify_error's four categories) -- shared so the
// Dashboard and the Strava page never word these differently.
export function syncFailureMessage(code: SyncFailureCode, retryAt: string | null): string {
  switch (code) {
    case 'rate_limited':
      return `Strava's rate limit was reached. Try again after ${formatDateTime(retryAt)}.`
    case 'strava_unavailable':
      return "Strava didn't respond. Try again in a few minutes."
    case 'auth_failed':
      return 'Strava access needs reconnecting.'
    default:
      return 'Sync failed.'
  }
}
