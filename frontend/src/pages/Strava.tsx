import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, Group, Loader, Select, Stack, Table, Text, Title } from '@mantine/core'
import { API_BASE_URL } from '../api/client'
import { useBikes, useStravaStatus, useUnmappedGear } from '../api/queries'
import { useSyncStrava, useUpdateBike } from '../api/mutations'

export default function Strava() {
  const [searchParams] = useSearchParams()
  const connected = searchParams.get('connected')
  const error = searchParams.get('error')

  const { data: status, isPending, isError, error: statusError } = useStravaStatus()
  const syncStrava = useSyncStrava()

  return (
    <Stack>
      <Title order={2}>Strava</Title>

      {connected && <Alert color="green">Connected to Strava.</Alert>}
      {error && (
        <Alert color="red">
          {error === 'access_denied' ? 'Strava connection was declined.' : `Connection failed: ${error}`}
        </Alert>
      )}

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load Strava status">
          {statusError.message}
        </Alert>
      )}

      {status && !status.connected && (
        <Button component="a" href={`${API_BASE_URL}/strava/authorize`}>
          Connect to Strava
        </Button>
      )}

      {status && status.connected && (
        <>
          <Group>
            <Badge color="green">Connected</Badge>
            <Text c="dimmed">Athlete #{status.athlete_id}</Text>
          </Group>

          <Button onClick={() => syncStrava.mutate()} loading={syncStrava.isPending} w="fit-content">
            Sync now
          </Button>

          <UnmappedGearSection />
        </>
      )}
    </Stack>
  )
}

function UnmappedGearSection() {
  const { data: gearIds, isPending, isError, error } = useUnmappedGear()

  return (
    <Stack>
      <Title order={3}>Unmapped gear</Title>

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load unmapped gear">
          {error.message}
        </Alert>
      )}

      {gearIds && gearIds.length === 0 && (
        <Text c="dimmed">No unmapped gear — every synced ride resolves to a bike.</Text>
      )}

      {gearIds && gearIds.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Strava gear ID</Table.Th>
              <Table.Th>Map to bike</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {gearIds.map((gearId) => (
              <UnmappedGearRow key={gearId} gearId={gearId} />
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  )
}

function UnmappedGearRow({ gearId }: { gearId: string }) {
  const { data: bikes } = useBikes()
  const [bikeId, setBikeId] = useState<string | null>(null)
  const updateBike = useUpdateBike(bikeId ? Number(bikeId) : -1)

  function handleChange(value: string | null) {
    setBikeId(value)
    if (value) updateBike.mutate({ strava_gear_id: gearId })
  }

  const bikeOptions = (bikes ?? []).map((bike) => ({ value: String(bike.id), label: bike.name }))

  return (
    <Table.Tr>
      <Table.Td>{gearId}</Table.Td>
      <Table.Td>
        <Select
          data={bikeOptions}
          value={bikeId}
          onChange={handleChange}
          placeholder="Pick a bike"
          disabled={updateBike.isPending}
        />
      </Table.Td>
    </Table.Tr>
  )
}
