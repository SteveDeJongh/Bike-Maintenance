import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, Flex, Loader, Stack } from '@mantine/core'
import { useDashboard } from '../api/queries'
import { useSyncStrava } from '../api/mutations'
import SyncStrip from '../components/dashboard/SyncStrip'
import BikeCards from '../components/dashboard/BikeCards'
import NeedsAttention from '../components/dashboard/NeedsAttention'
import RecentRidesTable from '../components/dashboard/RecentRidesTable'

// After "Sync now", StravaSyncJob runs in the background -- POST /strava/sync
// just enqueues it. Polling GET /dashboard (not /strava/status, since the
// bike/attention sections need refreshing too) is how the strip notices the
// job finished: last_synced_at changing is the one "sync completed" signal
// the app has (see StravaCredential#last_synced_at in CLAUDE.md).
const POLL_INTERVAL_MS = 2_000
const POLL_CAP_MS = 30_000

export default function Dashboard() {
  const queryClient = useQueryClient()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [polling, setPolling] = useState(false)
  const preSyncTimestampRef = useRef<string | null>(null)
  const pollStartedAtRef = useRef<number | null>(null)

  const { data, isPending, isError, error } = useDashboard(tz, {
    refetchInterval: polling ? POLL_INTERVAL_MS : false,
  })
  const syncStrava = useSyncStrava()

  useEffect(() => {
    if (!polling || !data) return
    if (pollStartedAtRef.current == null) pollStartedAtRef.current = Date.now()

    const changed = data.sync.last_synced_at !== preSyncTimestampRef.current
    const timedOut = Date.now() - pollStartedAtRef.current > POLL_CAP_MS

    if (changed || timedOut) {
      setPolling(false)
      pollStartedAtRef.current = null
      if (changed) queryClient.invalidateQueries({ queryKey: ['maintenance_alerts'] })
    }
  }, [data, polling, queryClient])

  function handleSync() {
    preSyncTimestampRef.current = data?.sync.last_synced_at ?? null
    pollStartedAtRef.current = null
    syncStrava.mutate(undefined, { onSuccess: () => setPolling(true) })
  }

  if (isPending) return <Loader />

  if (isError) {
    return (
      <Alert color="red" title="Failed to load dashboard">
        {error.message}
      </Alert>
    )
  }

  return (
    <Stack gap="xl">
      <SyncStrip sync={data.sync} onSync={handleSync} syncing={syncStrava.isPending || polling} />
      <Flex gap="xl" wrap="wrap">
        <BikeCards bikes={data.bikes} />
        <NeedsAttention attention={data.attention} />
      </Flex>
      <RecentRidesTable summary={data.recent_rides.summary} rides={data.recent_rides.rides} />
    </Stack>
  )
}
