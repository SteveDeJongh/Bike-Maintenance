import { useEffect, useRef, useState } from 'react'
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
  Tabs,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { API_BASE_URL } from '../api/client'
import { useBikes, useIgnoredGear, useMappedGear, useStravaRides, useStravaStatus, useUnmappedGear } from '../api/queries'
import {
  useCreateBike,
  useIgnoreGear,
  useReassignGear,
  useRefreshGear,
  useUnignoreGear,
  useUpdateBike,
} from '../api/mutations'
import { useStravaSyncRunner } from '../hooks/useStravaSyncRunner'
import BikeFormModal from '../components/forms/BikeFormModal'
import RidesTab from '../components/strava/RidesTab'
import { formatDistance } from '../utils/distance'
import { formatDateTime, formatRelativeTime, todayIsoDate } from '../utils/datetime'
import { syncFailureMessage } from '../utils/strava'
import type { StravaGear, StravaIgnoredGear, StravaMappedBike } from '../types/models'

const CREATE_NEW_BIKE = '__create_new__'
const UNLINK_BIKE = '__unlink__'

export default function Strava() {
  const [searchParams, setSearchParams] = useSearchParams()
  const connected = searchParams.get('connected')
  const error = searchParams.get('error')
  const tab = searchParams.get('tab') === 'rides' ? 'rides' : 'gear'

  const { data: status, isPending, isError, error: statusError } = useStravaStatus()
  const regularSync = useStravaSyncRunner({ full: false })
  const fullSync = useStravaSyncRunner({ full: true })
  const refreshGear = useRefreshGear()
  // The tab badge needs the attention count even while the Gear tab is
  // active -- same params the Rides tab's own "Needs attention" view uses
  // by default, so this shares its cache rather than issuing a second request.
  const { data: ridesData } = useStravaRides({ status: 'attention', sort: 'date', order: 'desc' })
  const attentionCount = ridesData?.pages[0]?.meta.status_counts.attention ?? 0

  function handleTabChange(value: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === 'rides') next.set('tab', 'rides')
      else next.delete('tab')
      return next
    })
  }

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
            <Button onClick={regularSync.sync} loading={regularSync.syncing}>
              Sync now
            </Button>
            <Tooltip label="Re-reads your full Strava history so rides you've edited or deleted on Strava are updated here. This re-reads your entire history, so it can take a minute or two.">
              <Button
                variant="default"
                onClick={fullSync.sync}
                loading={fullSync.syncing}
                disabled={Boolean(status.full_sync_available_at)}
              >
                Refresh all rides
              </Button>
            </Tooltip>
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
          {fullSync.syncing && (
            <Text size="xs" c="dimmed">
              Refreshing your full ride history from Strava — this re-reads everything, so it can take a minute or
              two depending on how many rides you have.
            </Text>
          )}
          {(regularSync.failure ?? fullSync.failure) && (
            <Alert color="red" title="Sync failed">
              <Group justify="space-between">
                <Text size="sm">
                  {syncFailureMessage(
                    (regularSync.failure ?? fullSync.failure)!.code,
                    (regularSync.failure ?? fullSync.failure)!.retryAt,
                  )}
                </Text>
                {(regularSync.failure ?? fullSync.failure)!.code === 'auth_failed' && (
                  <Button component="a" href={`${API_BASE_URL}/auth/strava`} size="xs">
                    Connect to Strava
                  </Button>
                )}
              </Group>
            </Alert>
          )}
          {(regularSync.stillRunning || fullSync.stillRunning) && (
            <Alert color="gray" title="Sync still running">
              <Text size="sm">Still running in the background. Check back shortly.</Text>
            </Alert>
          )}
          <Text size="xs" c="dimmed">
            Reconnect if permissions change or the connection stops working — this
            re-approves the same account, it does not disconnect anything first.
            {' '}Last full refresh: {formatRelativeTime(status.last_full_sync_at)}.
            {status.full_sync_available_at && ` Available again at ${formatDateTime(status.full_sync_available_at)}.`}
          </Text>

          <Tabs value={tab} onChange={handleTabChange}>
            <Tabs.List>
              <Tabs.Tab value="gear">Gear</Tabs.Tab>
              <Tabs.Tab value="rides" rightSection={attentionCount > 0 ? <Badge size="sm">{attentionCount}</Badge> : null}>
                Rides
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="gear" pt="md">
              <Stack>
                <MappedGearSection />
                <UnmappedGearSection />
                <IgnoredGearSection />
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="rides" pt="md">
              <RidesTab fullSync={fullSync} />
            </Tabs.Panel>
          </Tabs>
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
      <Text size="sm" c="dimmed">
        Map each row to a bike, track it as a retired bike, or choose not to track it.
      </Text>

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
  const [searchParams] = useSearchParams()
  const [bikeId, setBikeId] = useState<string | null>(null)
  const [createOpened, setCreateOpened] = useState(false)
  const [modalDefaults, setModalDefaults] = useState<GearBikeCreateDefaults>(() => plainCreateDefaults(gear))
  const updateBike = useUpdateBike(bikeId ? Number(bikeId) : -1)
  const createBike = useCreateBike()
  const ignoreGear = useIgnoreGear()
  const rowRef = useRef<HTMLTableRowElement>(null)
  // "Resolve gear" from the Rides tab links here as ?tab=gear&gear=<id> --
  // computed once at mount (not in an effect) so the highlight is already
  // active on first paint; the effect below only does the imperative scroll
  // and schedules the timed clear.
  const [highlighted, setHighlighted] = useState(() => searchParams.get('gear') === gear.gear_id)

  useEffect(() => {
    if (!highlighted) return
    rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timeout = setTimeout(() => setHighlighted(false), 2000)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        strava_gear_id: defaults.strava_gear_id, bike_type_id: null, acquired_on: null,
        retired_on: defaults.retired_on },
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
    <Table.Tr ref={rowRef} bg={highlighted ? 'var(--mantine-color-yellow-light)' : undefined}>
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
