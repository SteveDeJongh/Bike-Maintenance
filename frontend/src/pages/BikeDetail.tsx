import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Alert, Anchor, Loader, Stack, Text, Title } from '@mantine/core'
import { ApiError } from '../api/client'
import { useBike, useComponentAssignments, useComponentCategorySettings, useComponents } from '../api/queries'
import BikePageHeader from '../components/bike/BikePageHeader'
import BikeStatTiles from '../components/bike/BikeStatTiles'
import BikeUpNext from '../components/bike/BikeUpNext'
import RotationCard from '../components/bike/RotationCard'
import HistoryTable from '../components/bike/HistorySection'
import InstalledComponentsCard from '../components/bike/InstalledComponentsCard'
import { orderSlots } from '../components/bike/installedComponentsModel'
import BikeRidesSection from '../components/bike/BikeRidesSection'
import AssignmentDetailModal from '../components/forms/AssignmentDetailModal'
import BatchServiceModal from '../components/forms/BatchServiceModal'
import MaintenanceAlertBanners from '../components/MaintenanceAlertBanners'
import { useAllCategories } from '../hooks/useAllCategories'
import { rotationGroups } from '../utils/bikeCard'

export default function BikeDetail() {
  const { id } = useParams<{ id: string }>()
  const bikeId = Number(id)

  const { data: bike, isPending: bikePending, error: bikeError } = useBike(bikeId)
  const { data: assignments, isPending: assignmentsPending } = useComponentAssignments()
  const { data: components } = useComponents()
  const { data: categorySettings } = useComponentCategorySettings()
  const allCategories = useAllCategories()

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null)
  const [batchServiceOpened, setBatchServiceOpened] = useState(false)

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

  const orderedSlots = orderSlots(bike.bike_component_slots, allCategories)

  const historyAssignments = bike.component_assignments.filter((a) => a.ended_at !== null)
  const rotations = rotationGroups(bike.overview.mounted, bike.overview.off_bike).groups

  return (
    <Stack>
      <BikePageHeader bike={bike} onLogService={() => setBatchServiceOpened(true)} />

      <BikeStatTiles bike={bike} />

      <MaintenanceAlertBanners scope={{ bikeId: bike.id }} />

      {/* Up next, with one rotation card per rotating category stacked in a
          right-hand column; with none, Up next takes the full width. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--mantine-spacing-md)', alignItems: 'flex-start' }}>
        <BikeUpNext overview={bike.overview} />
        {rotations.length > 0 && (
          <Stack gap="md" style={{ flex: '1 1 340px', minWidth: 0 }}>
            {rotations.map((group) => (
              <RotationCard key={group.category} group={group} />
            ))}
          </Stack>
        )}
      </div>

      <InstalledComponentsCard
        bike={bike}
        orderedSlots={orderedSlots}
        allCategories={allCategories}
        categorySettings={categorySettings}
        components={components ?? []}
        activeAssignmentsElsewhereByComponentId={activeAssignmentsElsewhereByComponentId}
        onOpenAssignment={(assignment) => setSelectedAssignmentId(assignment.id)}
      />

      <Title order={3}>Component History</Title>

      {historyAssignments.length === 0 && <Text c="dimmed">No past assignments.</Text>}

      {historyAssignments.length > 0 && (
        <HistoryTable historyAssignments={historyAssignments} onRowClick={(assignment) => setSelectedAssignmentId(assignment.id)} />
      )}

      <BikeRidesSection bike={bike} />

      <AssignmentDetailModal
        opened={selectedAssignmentId !== null}
        onClose={() => setSelectedAssignmentId(null)}
        bikeId={bike.id}
        assignmentId={selectedAssignmentId}
      />

      <BatchServiceModal opened={batchServiceOpened} onClose={() => setBatchServiceOpened(false)} bikeId={bike.id} />
    </Stack>
  )
}
