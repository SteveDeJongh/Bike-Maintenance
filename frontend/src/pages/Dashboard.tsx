import { Alert, Loader, Stack } from '@mantine/core'
import { useDashboard } from '../api/queries'
import { useStravaSyncRunner } from '../hooks/useStravaSyncRunner'
import DashboardHeader from '../components/dashboard/DashboardHeader'
import SummaryTiles from '../components/dashboard/SummaryTiles'
import BikeCards from '../components/dashboard/BikeCards'
import UpNext from '../components/dashboard/UpNext'
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
      <DashboardHeader sync={data.sync} onSync={sync} syncing={syncing} failure={failure} stillRunning={stillRunning} />
      <SummaryTiles stats={data.stats} attention={data.attention} />
      <UpNext attention={data.attention} upcoming={data.upcoming} />
      <BikeCards bikes={data.bikes} />
      <RecentRidesTable summary={data.recent_rides.summary} rides={data.recent_rides.rides} />
    </Stack>
  )
}
