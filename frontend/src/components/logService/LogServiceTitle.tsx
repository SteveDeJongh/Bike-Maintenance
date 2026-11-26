import { Fragment } from 'react'
import { Anchor, Badge, Group, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import { componentPlacement } from '../component/componentPageModel'
import { categoryLabel } from '../../constants'
import { formatDistance } from '../../utils/distance'
import { formatShortDate } from '../../utils/datetime'
import type { ComponentDetail } from '../../types/models'

const KICKER = { size: 'xs', c: 'dimmed', tt: 'uppercase', fw: 500, style: { letterSpacing: '0.04em' } } as const

// The modal's lifted title (as the installation modal's): "LOG SERVICE" /
// "EDIT SERVICE" over the component -- its label with a neutral category
// chip, then "On Soloist since Nov 2 · 1,356 km lifetime" (bikes linked;
// "Off the bike · last on Soloist" for a spare). Without a component (the
// picker version): "One component", and a way to a service session instead.
export default function LogServiceTitle({
  isEdit,
  component,
  onNavigate,
  onLogSession,
}: {
  isEdit: boolean
  component: ComponentDetail | undefined
  // A bike link leaves the page: the modal closes first.
  onNavigate: () => void
  onLogSession?: () => void
}) {
  const kicker = <Text {...KICKER}>{isEdit ? 'Edit service' : 'Log service'}</Text>

  if (!component) {
    return (
      <Stack gap={2}>
        {kicker}
        <Text fz="lg" fw={700} lh={1.25}>
          One component
        </Text>
        {onLogSession && (
          <Text size="xs" c="dimmed">
            Doing several on one bike?{' '}
            <Anchor component="button" type="button" size="xs" onClick={onLogSession}>
              Log a service session
            </Anchor>
          </Text>
        )}
      </Stack>
    )
  }

  const placement = componentPlacement(component)
  const lifetime = `${formatDistance(component.lifetime_stats.distance_meters)} lifetime`
  const bikeLink = (bike: { id: number; name: string }) => (
    <Anchor component={Link} to={`/bikes/${bike.id}`} size="xs" onClick={onNavigate}>
      {bike.name}
    </Anchor>
  )

  let where
  if (placement.kind === 'installed') {
    const listed = placement.bikes.length > 0 ? placement.bikes : placement.retiredBikes
    where = (
      <>
        {placement.bikes.length > 0 ? 'On' : 'On retired'}{' '}
        {listed.map((bike, index) => (
          <Fragment key={bike.id}>
            {index > 0 && ', '}
            {bikeLink(bike)}
          </Fragment>
        ))}
        {placement.since && ` since ${formatShortDate(placement.since)}`}
      </>
    )
  } else {
    const off = placement.kind === 'retired' ? 'Retired' : 'Off the bike'
    where = placement.lastBike ? (
      <>
        {off} · last on {bikeLink(placement.lastBike)}
      </>
    ) : (
      off
    )
  }

  return (
    <Stack gap={2}>
      {kicker}
      <Group gap="xs" wrap="nowrap" align="center">
        <Text fz="lg" fw={700} lh={1.25} style={{ overflowWrap: 'anywhere' }}>
          {component.label}
        </Text>
        <Badge size="sm" variant="default" tt="none" style={{ flexShrink: 0 }}>
          {categoryLabel(component.category)}
        </Badge>
      </Group>
      <Text size="xs" c="dimmed">
        {where} · {lifetime}
      </Text>
    </Stack>
  )
}
