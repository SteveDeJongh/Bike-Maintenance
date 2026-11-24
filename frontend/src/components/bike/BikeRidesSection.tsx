import { useMemo, useState } from 'react'
import { Alert, Anchor, Button, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import { useActivityFeed, useTableViewPreference } from '../../api/queries'
import ActivityList from '../activity/ActivityList'
import { ACTIVITY_FIELD_LABELS } from '../activity/activityFields'
import { effectiveGroupBy, readActivityView } from '../activity/activityListModel'
import { activityUrl } from '../activity/activityUrl'
import type { ActivitySort, Order } from '../activity/useActivityFilters'
import RideDetailModal from '../ride/RideDetailModal'
import type { ActivityItem, BikeDetail } from '../../types/models'

// The bike's rides, as the Activity page's own list (ActivityList) with a
// fixed filter -- this bike, rides only -- and no toolbar. Fields and Group
// by follow the Activity page's saved choices (read, never written); the
// header sort is this section's own and isn't saved. A row opens the ride
// details modal.
export default function BikeRidesSection({ bike }: { bike: BikeDetail }) {
  const { data: preferenceData, isPending } = useTableViewPreference('activity_log')
  const view = useMemo(() => (preferenceData ? readActivityView(preferenceData.data) : null), [preferenceData])
  const [sortColumn, setSortColumn] = useState<ActivitySort>('occurred_at')
  const [order, setOrder] = useState<Order>('desc')
  const [rideId, setRideId] = useState<number | null>(null)
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  const feed = useActivityFeed({
    kinds: ['ride'],
    bikeId: bike.id,
    tz,
    order,
    sort: sortColumn === 'occurred_at' ? 'date' : sortColumn,
  })
  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data])

  // Activity's header rule: the active column flips; a new field starts
  // biggest-first, Date newest-first.
  function onSort(column: ActivitySort) {
    if (column === sortColumn) setOrder(order === 'asc' ? 'desc' : 'asc')
    else {
      setSortColumn(column)
      setOrder('desc')
    }
  }

  function onOpen(item: ActivityItem) {
    if (item.kind === 'ride') setRideId(item.id)
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="xs">
        <div>
          <Title order={3}>Rides</Title>
          <Text size="sm" c="dimmed">
            {bike.ride_count.toLocaleString()} on this bike
          </Text>
        </div>
        <Anchor component={Link} to={activityUrl({ bikeId: bike.id, kinds: ['ride'] })} size="sm">
          Open in Activity →
        </Anchor>
      </Group>

      {sortColumn !== 'occurred_at' && (
        <Text size="xs" c="dimmed">
          Sorted by {ACTIVITY_FIELD_LABELS[sortColumn]}
        </Text>
      )}

      {(isPending || feed.isPending) && <Loader />}
      {feed.isError && (
        <Alert color="red" title="Failed to load rides">
          {feed.error.message}
        </Alert>
      )}

      {view && !feed.isPending && items.length === 0 && (
        <Paper withBorder radius="md" p="lg">
          <Text c="dimmed">No rides on this bike yet.</Text>
        </Paper>
      )}

      {view && items.length > 0 && (
        <>
          <ActivityList
            pages={feed.data?.pages ?? []}
            groupBy={effectiveGroupBy(sortColumn, view.groupBy)}
            fields={view.fields}
            sortColumn={sortColumn}
            order={order}
            onSort={onSort}
            onOpen={onOpen}
          />
          {feed.hasNextPage && (
            <Group justify="center">
              <Button variant="default" onClick={() => feed.fetchNextPage()} loading={feed.isFetchingNextPage}>
                Load more
              </Button>
            </Group>
          )}
        </>
      )}

      <RideDetailModal opened={rideId !== null} onClose={() => setRideId(null)} rideId={rideId} />
    </Stack>
  )
}
