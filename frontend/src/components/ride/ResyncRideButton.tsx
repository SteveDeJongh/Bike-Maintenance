import { Button, Stack, Text } from '@mantine/core'
import { useResyncRide } from '../../api/mutations'

// One Strava API call, not a paginated history refresh -- fast enough to
// offer per-row, on every ride regardless of status, unlike "Refresh all
// rides" (see the Strava page). No toast on success: matches this app's
// existing no-modals/toasts convention outside the maintenance banners --
// the row's own data simply updates once the invalidated queries refetch.
export default function ResyncRideButton({ rideId }: { rideId: number }) {
  const resyncRide = useResyncRide()

  return (
    <Stack gap={2} align="flex-start">
      <Button size="xs" variant="subtle" onClick={() => resyncRide.mutate(rideId)} loading={resyncRide.isPending}>
        Re-sync
      </Button>
      {resyncRide.isError && (
        <Text size="xs" c="red">
          Resync failed
        </Text>
      )}
    </Stack>
  )
}
