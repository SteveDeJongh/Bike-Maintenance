import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Menu,
  Select,
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { API_BASE_URL } from '../api/client'
import { useBikes, useIgnoredGear, useMappedGear, useStravaStatus, useUnmappedGear } from '../api/queries'
import {
  useCreateBike,
  useIgnoreGear,
  useReassignGear,
  useRefreshGear,
  useSyncStrava,
  useUnignoreGear,
  useUpdateBike,
} from '../api/mutations'
import BikeFormModal from '../components/forms/BikeFormModal'
import { formatDistance } from '../utils/distance'
import { formatRelativeTime, todayIsoDate } from '../utils/datetime'
import type { StravaGear, StravaIgnoredGear, StravaMappedBike } from '../types/models'

const CREATE_NEW_BIKE = '__create_new__'
const UNLINK_BIKE = '__unlink__'

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

      {connected && <Alert color="teal">Connected to Strava.</Alert>}
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
        <Button component="a" href={`${API_BASE_URL}/auth/strava`}>
          Connect to Strava
        </Button>
      )}

      {status && status.connected && (
        <>
          <Group>
            <Badge color="teal">Connected</Badge>
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
            <Button component="a" href={`${API_BASE_URL}/auth/strava`} variant="subtle">
              Reconnect to Strava
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            Reconnect if permissions change or the connection stops working — this
            re-approves the same account, it does not disconnect anything first.
          </Text>

          <MappedGearSection />
          <UnmappedGearSection />
          <IgnoredGearSection />
        </>
      )}
    </Stack>
  )
}

function MappedGearSection() {
  const { data: bikes, isPending, isError, error } = useMappedGear()

  return (
    <Stack>
      <Title order={3}>Mapped gear</Title>

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load mapped gear">
          {error.message}
        </Alert>
      )}

      {bikes && bikes.length === 0 && <Text c="dimmed">No bikes are mapped to Strava gear yet.</Text>}

      {bikes && bikes.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Strava gear</Table.Th>
              <Table.Th>Bike</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {bikes.map((bike) => (
              <MappedGearRow key={bike.bike_id} bike={bike} />
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  )
}

function MappedGearRow({ bike }: { bike: StravaMappedBike }) {
  const { data: allBikes } = useBikes()
  const reassignGear = useReassignGear()

  const brandModel = [bike.brand_name, bike.model_name].filter(Boolean).join(' ')
  const rideLabel = `${bike.activity_count} ${bike.activity_count === 1 ? 'ride' : 'rides'}`

  function handleChange(value: string | null) {
    if (!value) return
    const bikeId = value === UNLINK_BIKE ? null : Number(value)
    reassignGear.mutate({ gearId: bike.gear_id, bikeId })
  }

  // Reassignment targets are limited to bikes with no existing mapping, plus
  // the bike already assigned here (so its label still resolves) — the
  // strict one-gear-per-bike rule means an already-mapped bike can't be
  // offered as a target.
  const availableBikes = (allBikes ?? []).filter(
    (b) => b.id === bike.bike_id || !b.strava_gear_id,
  )
  const bikeOptions = [
    ...availableBikes.map((b) => ({ value: String(b.id), label: b.name })),
    { value: UNLINK_BIKE, label: 'Unlink' },
  ]

  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs">
          <div>
            <Text fw={500}>{bike.name || bike.gear_id}</Text>
            {brandModel && (
              <Text size="sm" c="dimmed">
                {brandModel}
              </Text>
            )}
            <Text size="sm" c="dimmed">
              {rideLabel} · {formatDistance(bike.distance_meters)}
            </Text>
          </div>
          {bike.retired && <Badge color="gray">Retired</Badge>}
        </Group>
      </Table.Td>
      <Table.Td>
        <Select
          data={bikeOptions}
          value={String(bike.bike_id)}
          onChange={handleChange}
          disabled={reassignGear.isPending}
        />
      </Table.Td>
    </Table.Tr>
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
              <Table.Th>Strava gear</Table.Th>
              <Table.Th>Bike</Table.Th>
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

// Shared by the plain "+ Create new bike" path and "Track as retired bike"'s
// failure fallback -- each sets its own defaults before opening the modal,
// so the plain create path never picks up make/model/retired_on.
interface GearBikeCreateDefaults {
  name: string
  make: string
  model: string
  strava_gear_id: string
  retired_on: string | null
}

function plainCreateDefaults(gear: StravaGear): GearBikeCreateDefaults {
  return { name: gear.name ?? '', make: '', model: '', strava_gear_id: gear.gear_id, retired_on: null }
}

function retiredBikeDefaults(gear: StravaGear): GearBikeCreateDefaults {
  return {
    name: gear.name ?? '',
    make: gear.brand_name ?? '',
    model: gear.model_name ?? '',
    strava_gear_id: gear.gear_id,
    // last_activity_on is preferred when available -- a bike retired on
    // Strava months ago shouldn't show today as its retirement date.
    retired_on: gear.last_activity_on ?? todayIsoDate(),
  }
}

function UnmappedGearRow({ gear }: { gear: StravaGear }) {
  const { data: bikes } = useBikes()
  const [bikeId, setBikeId] = useState<string | null>(null)
  const [createOpened, setCreateOpened] = useState(false)
  const [modalDefaults, setModalDefaults] = useState<GearBikeCreateDefaults>(() => plainCreateDefaults(gear))
  const updateBike = useUpdateBike(bikeId ? Number(bikeId) : -1)
  const createBike = useCreateBike()
  const ignoreGear = useIgnoreGear()

  function handleChange(value: string | null) {
    if (value === CREATE_NEW_BIKE) {
      setModalDefaults(plainCreateDefaults(gear))
      setCreateOpened(true)
      return
    }
    setBikeId(value)
    if (value) updateBike.mutate({ strava_gear_id: gear.gear_id })
  }

  function handleTrackAsRetired() {
    const defaults = retiredBikeDefaults(gear)
    createBike.mutate(
      { name: defaults.name, make: defaults.make || null, model: defaults.model || null,
        strava_gear_id: defaults.strava_gear_id, acquired_on: null, retired_on: defaults.retired_on },
      {
        onError: () => {
          setModalDefaults(defaults)
          setCreateOpened(true)
        },
      },
    )
  }

  function handleDontTrack() {
    ignoreGear.mutate(gear.gear_id)
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
          {gear.resurfaced && <Badge color="orange">New rides since ignored</Badge>}
        </Group>
      </Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Select
            data={bikeOptions}
            value={bikeId}
            onChange={handleChange}
            placeholder="Pick a bike"
            disabled={updateBike.isPending}
          />

          {gear.retired ? (
            <>
              <Button size="xs" variant="default" onClick={handleTrackAsRetired} loading={createBike.isPending}>
                Track as retired bike
              </Button>
              <Button size="xs" variant="subtle" c="dimmed" onClick={handleDontTrack} loading={ignoreGear.isPending}>
                Don't track
              </Button>
            </>
          ) : (
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="default" aria-label="More actions for this gear">
                  ⋯
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={handleTrackAsRetired}>Track as retired bike</Menu.Item>
                <Menu.Item onClick={handleDontTrack}>Don't track</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>

        <BikeFormModal opened={createOpened} onClose={() => setCreateOpened(false)} createDefaults={modalDefaults} />
      </Table.Td>
    </Table.Tr>
  )
}

function IgnoredGearSection() {
  const { data: gears, isPending, isError, error } = useIgnoredGear()
  const [expanded, setExpanded] = useState(false)

  if (!gears || gears.length === 0) return null

  return (
    <Stack>
      <UnstyledButton onClick={() => setExpanded((v) => !v)}>
        <Title order={3}>
          Ignored gear ({gears.length}) {expanded ? '▲' : '▼'}
        </Title>
      </UnstyledButton>

      {expanded && (
        <>
          {isPending && <Loader />}

          {isError && (
            <Alert color="red" title="Failed to load ignored gear">
              {error.message}
            </Alert>
          )}

          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Strava gear</Table.Th>
                <Table.Th>Ignored</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {gears.map((gear) => (
                <IgnoredGearRow key={gear.gear_id} gear={gear} />
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Stack>
  )
}

function IgnoredGearRow({ gear }: { gear: StravaIgnoredGear }) {
  const unignoreGear = useUnignoreGear()

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
        <Text size="sm" c="dimmed">
          {formatRelativeTime(gear.ignored_at)}
        </Text>
      </Table.Td>
      <Table.Td>
        <Button size="xs" variant="default" onClick={() => unignoreGear.mutate(gear.gear_id)} loading={unignoreGear.isPending}>
          Un-ignore
        </Button>
      </Table.Td>
    </Table.Tr>
  )
}
