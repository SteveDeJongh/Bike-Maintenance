import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, Group, Loader, Select, Stack, Table, Text, Title } from '@mantine/core'
import { API_BASE_URL } from '../api/client'
import { useBikes, useStravaStatus, useUnmappedGear } from '../api/queries'
import { useRefreshGear, useSyncStrava, useUpdateBike } from '../api/mutations'
import BikeFormModal from '../components/forms/BikeFormModal'
import { formatDistance } from '../utils/distance'
import type { StravaGear } from '../types/models'

const CREATE_NEW_BIKE = '__create_new__'

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
            <Button component="a" href={`${API_BASE_URL}/strava/authorize`} variant="subtle">
              Reconnect to Strava
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            Reconnect if permissions change or the connection stops working — this
            re-approves the same account, it does not disconnect anything first.
          </Text>

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
  const [createOpened, setCreateOpened] = useState(false)
  const updateBike = useUpdateBike(bikeId ? Number(bikeId) : -1)

  function handleChange(value: string | null) {
    if (value === CREATE_NEW_BIKE) {
      setCreateOpened(true)
      return
    }
    setBikeId(value)
    if (value) updateBike.mutate({ strava_gear_id: gear.gear_id })
  }

  const bikeOptions = [
    ...(bikes ?? []).map((bike) => ({ value: String(bike.id), label: bike.name })),
    { value: CREATE_NEW_BIKE, label: '+ Create new bike' },
  ]
  const brandModel = [gear.brand_name, gear.model_name].filter(Boolean).join(' ')
  const rideLabel = `${gear.activity_count} ${gear.activity_count === 1 ? 'ride' : 'rides'}`

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
            <Text size="sm" c="dimmed">
              {rideLabel} · {formatDistance(gear.distance_meters)}
            </Text>
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

        <BikeFormModal
          opened={createOpened}
          onClose={() => setCreateOpened(false)}
          createDefaults={{ name: gear.name ?? '', strava_gear_id: gear.gear_id }}
        />
      </Table.Td>
    </Table.Tr>
  )
}
