import { Flex, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import BikeCard from './BikeCard'
import type { DashboardBike } from '../../types/models'

// The wide column -- grows more than Needs attention, with a generous
// basis so it still reads well before it has room to wrap more than one
// card per row.
export default function BikeCards({ bikes }: { bikes: DashboardBike[] }) {
  return (
    <Stack gap="md" style={{ flex: '3 1 600px' }}>
      <Title order={3}>Bikes</Title>
      {bikes.length === 0 ? (
        <Text c="dimmed">
          No bikes yet. <Link to="/bikes">Add a bike</Link> and <Link to="/strava">connect Strava</Link> to start
          tracking mileage.
        </Text>
      ) : (
        <Flex gap="md" wrap="wrap">
          {bikes.map((bike) => (
            <BikeCard key={bike.id} bike={bike} />
          ))}
        </Flex>
      )}
    </Stack>
  )
}
