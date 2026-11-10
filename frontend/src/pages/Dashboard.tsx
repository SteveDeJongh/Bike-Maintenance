import { Alert, Flex, Loader, Stack } from '@mantine/core'
import { useDashboard } from '../api/queries'
import { useStravaSyncRunner } from '../hooks/useStravaSyncRunner'
import SyncStrip from '../components/dashboard/SyncStrip'
import BikeCards from '../components/dashboard/BikeCards'
import NeedsAttention from '../components/dashboard/NeedsAttention'
import RecentRidesTable from '../components/dashboard/RecentRidesTable'

export default function Dashboard() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const { data, isPending, isError, error } = useDashboard(tz)
  const { sync, syncing, failure, stillRunning } = useStravaSyncRunner({ full: false })

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
      <SyncStrip sync={data.sync} onSync={sync} syncing={syncing} failure={failure} stillRunning={stillRunning} />
      <Flex gap="xl" wrap="wrap">
        <BikeCards bikes={data.bikes} />
        <NeedsAttention attention={data.attention} />
      </Flex>
      <RecentRidesTable summary={data.recent_rides.summary} rides={data.recent_rides.rides} />
    </Stack>
  )
}
