import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Alert, Anchor, Badge, Button, Group, Loader, Select, Stack, Text, Title } from '@mantine/core'
import { ApiError } from '../api/client'
import { useBike, useComponentAssignments, useComponentCategorySettings, useComponents } from '../api/queries'
import { useCreateBikeComponentSlot } from '../api/mutations'
import HistoryTable from '../components/bike/HistorySection'
import InstalledComponentsTable from '../components/bike/InstalledComponentsSection'
import RideHistorySection from '../components/bike/RideHistorySection'
import AssignmentDetailModal from '../components/forms/AssignmentDetailModal'
import BatchServiceModal from '../components/forms/BatchServiceModal'
import EndAssignmentModal from '../components/forms/EndAssignmentModal'
import MaintenanceAlertBanners from '../components/MaintenanceAlertBanners'
import { useAllCategories } from '../hooks/useAllCategories'
import { categoryLabel, RIDE_CONTEXT_LABELS } from '../constants'
import { formatDate } from '../utils/datetime'
import { formatDistance } from '../utils/distance'
import { formatDuration } from '../utils/duration'
import { formatElevation } from '../utils/elevation'
import { formatPower } from '../utils/power'
import type { ComponentAssignmentWithStats } from '../types/models'

export default function BikeDetail() {
  const { id } = useParams<{ id: string }>()
  const bikeId = Number(id)

  const { data: bike, isPending: bikePending, error: bikeError } = useBike(bikeId)
  const { data: assignments, isPending: assignmentsPending } = useComponentAssignments()
  const { data: components } = useComponents()
  const { data: categorySettings } = useComponentCategorySettings()
  const allCategories = useAllCategories()

  const [endingAssignment, setEndingAssignment] = useState<ComponentAssignmentWithStats | null>(null)
  const [selectedAssignment, setSelectedAssignment] = useState<ComponentAssignmentWithStats | null>(null)
  const [addCategory, setAddCategory] = useState<string | null>(null)
  const [batchServiceOpened, setBatchServiceOpened] = useState(false)
  const createSlot = useCreateBikeComponentSlot()

  if (!Number.isFinite(bikeId) || (bikeError instanceof ApiError && bikeError.status === 404)) {
    return (
      <Stack>
        <Text>Bike not found.</Text>
        <Anchor component={Link} to="/bikes">
          Back to bikes
        </Anchor>
      </Stack>
    )
  }

  if (bikePending || assignmentsPending) return <Loader />

  if (bikeError) {
    return (
      <Alert color="red" title="Failed to load bike">
        {bikeError.message}
      </Alert>
    )
  }

  if (!bike) return null

  // Cross-bike check: a component already actively mounted on a *different*
  // bike shouldn't normally be offered in this bike's assign dropdown --
  // unless every one of its active-elsewhere assignments is indoor_only and
  // its category allows_multiple_assignments, in which case it's offered
  // with its ride context locked to indoor_only (see EmptySlotRow) -- e.g. a
  // cassette that physically lives on the trainer, not on any one bike's
  // frame. Inherently cross-bike, so this still needs the global assignments
  // list rather than the new bike-scoped, enriched bike.component_assignments.
  const activeAssignmentsElsewhereByComponentId = new Map<number, ('both' | 'outdoor_only' | 'indoor_only')[]>()
  for (const a of assignments ?? []) {
    if (a.ended_at !== null || a.bike_id === bike.id) continue
    const rideContexts = activeAssignmentsElsewhereByComponentId.get(a.component_id) ?? []
    rideContexts.push(a.ride_context)
    activeAssignmentsElsewhereByComponentId.set(a.component_id, rideContexts)
  }

  const RIDE_CONTEXT_SORT_ORDER = { both: 0, outdoor_only: 1, indoor_only: 2 } as const

  // A category can now have more than one independent slot (an
  // outdoor_only one and an indoor_only one), so this is a flatMap over all
  // of a category's slots rather than finding just one.
  const orderedSlots = allCategories.flatMap((category) =>
    bike.bike_component_slots
      .filter((slot) => slot.category === category)
      .sort((a, b) => RIDE_CONTEXT_SORT_ORDER[a.ride_context] - RIDE_CONTEXT_SORT_ORDER[b.ride_context]),
  )

  // What's left to offer in "+ Track a new component type": a category with
  // no slot yet offers a plain entry, plus (when its
  // ComponentCategorySetting#allows_multiple_assignments) separate
  // "(Outdoor only)"/"(Indoor only)" entries so the user can start with just
  // the one they actually want -- e.g. only the shared trainer cassette,
  // with no complementary outdoor row attached. A category with an existing
  // "both" slot offers nothing further (mixing an unsplit slot with split
  // ones isn't a sensible state); one with existing split slot(s) offers
  // only whichever variant(s) aren't tracked yet.
  const addableSlotOptions = allCategories.flatMap((category) => {
    if (!(categorySettings?.find((setting) => setting.category === category)?.trackable ?? true)) return []

    const existing = bike.bike_component_slots.filter((slot) => slot.category === category)
    const allowsMultiple =
      categorySettings?.find((setting) => setting.category === category)?.allows_multiple_assignments ?? false

    if (existing.length === 0) {
      const rideContexts: ('both' | 'outdoor_only' | 'indoor_only')[] = allowsMultiple
        ? ['both', 'outdoor_only', 'indoor_only']
        : ['both']
      return rideContexts.map((rideContext) => ({ category, rideContext }))
    }

    if (existing.some((slot) => slot.ride_context === 'both')) return []

    const existingContexts = new Set(existing.map((slot) => slot.ride_context))
    return (['outdoor_only', 'indoor_only'] as const)
      .filter((rideContext) => !existingContexts.has(rideContext))
      .map((rideContext) => ({ category, rideContext }))
  })

  const historyAssignments = bike.component_assignments.filter((a) => a.ended_at !== null)

  const confirmedBikeId = bike.id

  function handleAddSlot(value: string | null) {
    setAddCategory(value)
    if (value) {
      const [category, rideContext] = value.split('::') as [string, 'both' | 'outdoor_only' | 'indoor_only']
      createSlot.mutate(
        { bike_id: confirmedBikeId, category, ride_context: rideContext },
        { onSuccess: () => setAddCategory(null) },
      )
    }
  }

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2}>{bike.name}</Title>
            {bike.retired_on && <Badge color="gray">Retired</Badge>}
          </Group>
          <Text c="dimmed">
            {[bike.make, bike.model].filter(Boolean).join(' ') || 'Unknown make/model'}
          </Text>
        </div>
        <Button variant="default" onClick={() => setBatchServiceOpened(true)}>
          Log service
        </Button>
      </Group>

      <MaintenanceAlertBanners scope={{ bikeId: bike.id }} />

      <Group gap="xl">
        <div>
          <Text size="sm" c="dimmed">
            Total distance
          </Text>
          <Text fw={500}>{formatDistance(bike.total_distance)}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            Total time
          </Text>
          <Text fw={500}>{formatDuration(bike.total_moving_time)}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            First ride
          </Text>
          <Text fw={500}>{bike.first_ride_on ? formatDate(bike.first_ride_on) : 'No rides yet'}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            Total elevation
          </Text>
          <Text fw={500}>{formatElevation(bike.total_elevation_gain)}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            Avg power
          </Text>
          <Text fw={500}>{formatPower(bike.average_power)}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            Installed components
          </Text>
          <Text fw={500}>{bike.installed_components_count}</Text>
        </div>
      </Group>

      <Title order={3}>Installed components</Title>

      {orderedSlots.length === 0 && (
        <Stack gap="xs">
          <Text c="dimmed">No component types tracked yet.</Text>
          <Button component={Link} to={`/bikes/${bike.id}/setup`} variant="default" w="fit-content">
            Set up components
          </Button>
        </Stack>
      )}

      {orderedSlots.length > 0 && (
        <InstalledComponentsTable
          bike={bike}
          orderedSlots={orderedSlots}
          components={components ?? []}
          activeAssignmentsElsewhereByComponentId={activeAssignmentsElsewhereByComponentId}
          onEndAssignment={setEndingAssignment}
          onRowClick={setSelectedAssignment}
        />
      )}

      {addableSlotOptions.length > 0 && (
        <Select
          placeholder="+ Track a new component type"
          data={addableSlotOptions.map(({ category, rideContext }) => ({
            value: `${category}::${rideContext}`,
            label:
              rideContext === 'both'
                ? categoryLabel(category)
                : `${categoryLabel(category)} (${RIDE_CONTEXT_LABELS[rideContext]})`,
          }))}
          value={addCategory}
          onChange={handleAddSlot}
          disabled={createSlot.isPending}
        />
      )}

      <Title order={3}>Component History</Title>

      {historyAssignments.length === 0 && <Text c="dimmed">No past assignments.</Text>}

      {historyAssignments.length > 0 && (
        <HistoryTable historyAssignments={historyAssignments} onRowClick={setSelectedAssignment} />
      )}

      <RideHistorySection bike={bike} />

      <EndAssignmentModal
        opened={endingAssignment !== null}
        onClose={() => setEndingAssignment(null)}
        assignment={endingAssignment}
        componentLabel={endingAssignment?.component.label ?? ''}
      />

      <AssignmentDetailModal
        opened={selectedAssignment !== null}
        onClose={() => setSelectedAssignment(null)}
        assignment={selectedAssignment}
      />

      <BatchServiceModal opened={batchServiceOpened} onClose={() => setBatchServiceOpened(false)} bikeId={bike.id} />
    </Stack>
  )
}
