import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Alert, Anchor, Loader, Stack, Text } from '@mantine/core'
import { ApiError } from '../api/client'
import { useBike } from '../api/queries'
import BikeOverviewRow from '../components/bike/BikeOverviewRow'
import BikePageHeader from '../components/bike/BikePageHeader'
import BikeRidesSection from '../components/bike/BikeRidesSection'
import BikeServiceHistorySection from '../components/bike/BikeServiceHistorySection'
import BikeStatTiles from '../components/bike/BikeStatTiles'
import InstalledComponentsCard from '../components/bike/InstalledComponentsCard'
import AssignmentDetailModal from '../components/forms/AssignmentDetailModal'
import BatchServiceModal from '../components/forms/BatchServiceModal'
import MaintenanceAlertBanners from '../components/MaintenanceAlertBanners'

// The bike page (docs/frontend-ui.md, "Bike page"): header, stat tiles,
// banners, Up next and rotation, then three PageSections -- installed
// components, service & component history, rides. Each section owns its
// own data and layout; this page holds the two modals more than one
// section opens.
export default function BikeDetail() {
  const { id } = useParams<{ id: string }>()
  const bikeId = Number(id)

  const { data: bike, isPending, error } = useBike(bikeId)
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null)
  const [batchServiceOpened, setBatchServiceOpened] = useState(false)

  if (!Number.isFinite(bikeId) || (error instanceof ApiError && error.status === 404)) {
    return (
      <Stack>
        <Text>Bike not found.</Text>
        <Anchor component={Link} to="/bikes">
          Back to bikes
        </Anchor>
      </Stack>
    )
  }

  if (isPending) return <Loader />

  if (error) {
    return (
      <Alert color="red" title="Failed to load bike">
        {error.message}
      </Alert>
    )
  }

  const openAssignment = (assignment: { id: number }) => setSelectedAssignmentId(assignment.id)

  return (
    <Stack>
      <BikePageHeader bike={bike} onLogService={() => setBatchServiceOpened(true)} />
      <BikeStatTiles bike={bike} />
      <MaintenanceAlertBanners scope={{ bikeId: bike.id }} />
      <BikeOverviewRow overview={bike.overview} />
      <InstalledComponentsCard bike={bike} onOpenAssignment={openAssignment} />
      <BikeServiceHistorySection bike={bike} onOpenAssignment={openAssignment} />
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
