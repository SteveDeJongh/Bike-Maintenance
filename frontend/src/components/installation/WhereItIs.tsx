import { Fragment } from 'react'
import { Anchor, Group, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import RideContextChip from '../RideContextChip'
import { formatShortDate } from '../../utils/datetime'
import type { WhereItIs as Where } from './installationModel'

function BikeLink({ bike }: { bike: { id: number; name: string } }) {
  return (
    <Anchor component={Link} to={`/bikes/${bike.id}`} inherit>
      {bike.name}
    </Anchor>
  )
}

// The modal's dimmed "where it is" line (whereItIs): "On <bike> since
// <date>", the ride-context chip ("All rides" as text), and "· also on
// <bikes>" for a shared cassette; or "Was on <bike> · <range>" and the chip.
export default function WhereItIs({ where }: { where: Where }) {
  return (
    <Group gap={8} wrap="wrap" align="center">
      <Text size="sm" c="dimmed">
        {where.kind === 'current' ? (
          <>
            On <BikeLink bike={where.bike} />
            {where.retiredBike && ' (retired)'} since {formatShortDate(where.since)}
          </>
        ) : (
          <>
            Was on <BikeLink bike={where.bike} /> · {where.range}
          </>
        )}
      </Text>
      <RideContextChip rideContext={where.rideContext} showBoth />
      {where.kind === 'current' && where.alsoOn.length > 0 && (
        <Text size="sm" c="dimmed">
          · also on{' '}
          {where.alsoOn.map((bike, index) => (
            <Fragment key={bike.id}>
              {index > 0 && ', '}
              <BikeLink bike={bike} />
            </Fragment>
          ))}
        </Text>
      )}
    </Group>
  )
}
