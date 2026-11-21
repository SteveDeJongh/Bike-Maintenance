import { useRef } from 'react'
import { ActionIcon, Anchor, Box, Group, Stack, Text, Title } from '@mantine/core'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import BikeCard from './BikeCard'
import { useHorizontalOverflow } from '../../hooks/useHorizontalOverflow'
import { useIsMobile } from '../../hooks/useIsMobile'
import { sortBikesByUrgency } from '../../utils/bikeCard'
import type { DashboardBike } from '../../types/models'

const CARD_WIDTH = 420

// Bikes, most urgent first. On desktop a horizontal, snap-scrolling row of
// fixed-width cards (one bike stays 420px rather than stretching), sharing
// one height, with arrows and a right-edge fade while more is to the right.
// On a phone the cards stay stacked full-width.
export default function BikeCards({ bikes }: { bikes: DashboardBike[] }) {
  const isMobile = useIsMobile()
  const trackRef = useRef<HTMLDivElement>(null)
  const { overflowing, atStart, atEnd, scrollByItem } = useHorizontalOverflow(trackRef, `${bikes.length}-${isMobile}`)
  const sorted = sortBikesByUrgency(bikes)

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap="sm" align="baseline">
          <Title order={3}>Bikes</Title>
          {bikes.length > 0 && (
            <Text size="sm" c="dimmed">
              {bikes.length} {bikes.length === 1 ? 'bike' : 'bikes'} · sorted by most urgent
            </Text>
          )}
        </Group>
        <Group gap="xs">
          {!isMobile && overflowing && (
            <>
              <ActionIcon variant="default" radius="xl" aria-label="Scroll bikes left" disabled={atStart} onClick={() => scrollByItem(-1)}>
                <IconChevronLeft size={16} />
              </ActionIcon>
              <ActionIcon variant="default" radius="xl" aria-label="Scroll bikes right" disabled={atEnd} onClick={() => scrollByItem(1)}>
                <IconChevronRight size={16} />
              </ActionIcon>
            </>
          )}
          <Anchor component={Link} to="/bikes" size="sm">
            Manage bikes →
          </Anchor>
        </Group>
      </Group>

      {bikes.length === 0 ? (
        <Text c="dimmed">
          No bikes yet. <Link to="/bikes">Add a bike</Link> and <Link to="/strava">connect Strava</Link> to start
          tracking mileage.
        </Text>
      ) : isMobile ? (
        <Stack gap="md">
          {sorted.map((bike) => (
            <BikeCard key={bike.id} bike={bike} />
          ))}
        </Stack>
      ) : (
        <Box pos="relative">
          <Box
            ref={trackRef}
            style={{
              display: 'flex',
              gap: 'var(--mantine-spacing-md)',
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              paddingBottom: 'var(--mantine-spacing-xs)',
            }}
          >
            {sorted.map((bike) => (
              <BikeCard key={bike.id} bike={bike} style={{ flex: `0 0 ${CARD_WIDTH}px`, scrollSnapAlign: 'start' }} />
            ))}
          </Box>
          {!atEnd && (
            <Box
              pos="absolute"
              top={0}
              right={0}
              bottom={0}
              w={56}
              style={{ pointerEvents: 'none', background: 'linear-gradient(to right, transparent, var(--mantine-color-body))' }}
            />
          )}
        </Box>
      )}
    </Stack>
  )
}
