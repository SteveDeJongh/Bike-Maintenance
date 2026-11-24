import { Stack } from '@mantine/core'
import BikeUpNext from './BikeUpNext'
import RotationCard from './RotationCard'
import { rotationGroups } from '../../utils/bikeCard'
import type { BikeDetail } from '../../types/models'

// Up next on this bike, with one rotation card per rotating category
// stacked in a right-hand column; with none, Up next takes the full width.
export default function BikeOverviewRow({ overview }: { overview: BikeDetail['overview'] }) {
  const rotations = rotationGroups(overview.mounted, overview.off_bike).groups

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--mantine-spacing-md)', alignItems: 'flex-start' }}>
      <BikeUpNext overview={overview} />
      {rotations.length > 0 && (
        <Stack gap="md" style={{ flex: '1 1 340px', minWidth: 0 }}>
          {rotations.map((group) => (
            <RotationCard key={group.category} group={group} />
          ))}
        </Stack>
      )}
    </div>
  )
}
