import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, Group, Loader, Select, Stack, Table, Text, Title } from '@mantine/core'
import { API_BASE_URL } from '../api/client'
import { useBikes, useStravaStatus, useUnmappedGear } from '../api/queries'
import { useRefreshGear, useSyncStrava, useUpdateBike } from '../api/mutations'
import type { StravaGear } from '../types/models'

export default function Strava() {
  const [searchParams] = useSearchParams()
  const connected = searchParams.get('connected')
  const error = searchParams.get('error')

  const { data: status, isPending, isError, error: statusError } = useStravaStatus()
  const syncStrava = useSyncStrava()
  const refreshGear = useRefreshGear()

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

          <Group>
            <Button onClick={() => syncStrava.mutate()} loading={syncStrava.isPending}>
              Sync now
            </Button>
            <Button
              variant="default"
              onClick={() => refreshGear.mutate()}
              loading={refreshGear.isPending}
            >
              Refresh gear list
            </Button>
          </Group>

          <UnmappedGearSection />
        </>
      )}
    </Stack>
  )
}

function UnmappedGearSection() {
  const { data: gears, isPending, isError, error } = useUnmappedGear()

  return (
    <Stack>
      <Title order={3}>Unmapped gear</Title>

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load unmapped gear">
          {error.message}
        </Alert>
      )}

      {gears && gears.length === 0 && (
        <Text c="dimmed">No unmapped gear — every synced ride resolves to a bike.</Text>
      )}

      {gears && gears.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Gear</Table.Th>
              <Table.Th>Map to bike</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {gears.map((gear) => (
              <UnmappedGearRow key={gear.gear_id} gear={gear} />
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  )
}

function UnmappedGearRow({ gear }: { gear: StravaGear }) {
  const { data: bikes } = useBikes()
  const [bikeId, setBikeId] = useState<string | null>(null)
  const updateBike = useUpdateBike(bikeId ? Number(bikeId) : -1)

  function handleChange(value: string | null) {
    setBikeId(value)
    if (value) updateBike.mutate({ strava_gear_id: gear.gear_id })
  }

  const bikeOptions = (bikes ?? []).map((bike) => ({ value: String(bike.id), label: bike.name }))
  const brandModel = [gear.brand_name, gear.model_name].filter(Boolean).join(' ')

  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs">
          <div>
            <Text fw={500}>{gear.name || gear.gear_id}</Text>
            {brandModel && (
              <Text size="sm" c="dimmed">
                {brandModel}
              </Text>
            )}
          </div>
          {gear.retired && <Badge color="gray">Retired</Badge>}
        </Group>
      </Table.Td>
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
