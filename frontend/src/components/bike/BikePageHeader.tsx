import { Fragment, useState, type ReactNode } from 'react'
import { ActionIcon, Anchor, Badge, Button, Group, Menu, Stack, Text, Title } from '@mantine/core'
import { IconChevronLeft, IconDots } from '@tabler/icons-react'
import { Link, useNavigate } from 'react-router-dom'
import { useBikeTypes } from '../../api/queries'
import { useDeleteBike } from '../../api/mutations'
import BikeStatusChip from './BikeStatusChip'
import { confirmDelete } from '../confirmDelete'
import BikeFormModal from '../forms/BikeFormModal'
import { retiredLabel } from '../bikes/bikesList'
import { bikeStatusCounts } from '../../utils/bikeCard'
import { formatDate } from '../../utils/datetime'
import type { BikeDetail } from '../../types/models'

// The bike page's top: a "← Bikes" link, then the name with its type and
// status chips (or "Retired …"), a dimmed line (make/model · Strava gear ·
// riding since), and the actions -- Log service, Set up components, and a
// ⋯ menu with Edit bike (where "Retired on" lives; there's no separate
// retire action) and Delete bike.
export default function BikePageHeader({ bike, onLogService }: { bike: BikeDetail; onLogService: () => void }) {
  const navigate = useNavigate()
  const deleteBike = useDeleteBike()
  const { data: bikeTypes } = useBikeTypes()
  const [editOpened, setEditOpened] = useState(false)
  const typeName = bike.bike_type_id === null ? null : bikeTypes?.find((type) => type.id === bike.bike_type_id)?.name

  function handleDelete() {
    confirmDelete({
      title: 'Delete bike',
      message: `Delete "${bike.name}"? This also deletes all of its component assignment history.`,
      onConfirm: () => deleteBike.mutate(bike.id, { onSuccess: () => navigate('/bikes') }),
    })
  }

  const makeModel = [bike.make, bike.model].filter(Boolean).join(' ')
  const lineParts: ReactNode[] = [
    makeModel || null,
    bike.strava_gear ? (
      `Linked to Strava gear "${bike.strava_gear.name ?? bike.strava_gear.gear_id}"`
    ) : (
      <Anchor component={Link} to="/strava?tab=gear" size="sm" inherit>
        Not linked to Strava gear
      </Anchor>
    ),
    bike.first_ride_on ? `Riding since ${formatDate(bike.first_ride_on)}` : null,
  ].filter((part) => part !== null)

  return (
    <Stack gap="xs">
      <Anchor component={Link} to="/bikes" size="sm" c="dimmed" w="fit-content">
        <Group gap={2} wrap="nowrap">
          <IconChevronLeft size={14} />
          Bikes
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group gap="xs" wrap="wrap">
            <Title order={2} style={{ overflowWrap: 'anywhere' }}>
              {bike.name}
            </Title>
            {typeName && (
              <Badge variant="default" tt="none" fw={500}>
                {typeName}
              </Badge>
            )}
            {bike.retired_on ? (
              <Badge color="gray" variant="light" tt="none" fw={500}>
                {retiredLabel(bike.retired_on)}
              </Badge>
            ) : (
              <BikeStatusChip {...bikeStatusCounts(bike.overview.mounted)} />
            )}
          </Group>
          {lineParts.length > 0 && (
            <Text size="sm" c="dimmed">
              {lineParts.map((part, index) => (
                <Fragment key={index}>
                  {index > 0 && ' · '}
                  {part}
                </Fragment>
              ))}
            </Text>
          )}
        </Stack>

        <Group gap="xs" wrap="nowrap">
          <Button onClick={onLogService}>Log service</Button>
          <Button component={Link} to={`/bikes/${bike.id}/setup`} variant="default">
            Set up components
          </Button>
          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label="Bike actions">
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => setEditOpened(true)}>Edit bike</Menu.Item>
              <Menu.Item color="red" onClick={handleDelete}>
                Delete bike
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <BikeFormModal opened={editOpened} onClose={() => setEditOpened(false)} bike={bike} />
    </Stack>
  )
}
