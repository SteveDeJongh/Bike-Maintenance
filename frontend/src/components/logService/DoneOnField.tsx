import { useState } from 'react'
import { Anchor, Button, Group, Stack, Text } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { IconLock } from '@tabler/icons-react'
import { useLastRideBefore } from '../../api/queries'
import { isoUtcToDate, mantineLocalStringToIsoUtc, nowIsoUtc } from '../../utils/datetime'
import { lastRideEnd, lastRideLine } from './logServiceModel'

// "Done on": the date/time picker with Now and After last ride (when the
// component's latest counted ride before now ended), and the last ride
// before the chosen time under it. A service in a session is locked here
// -- its date is the session's -- with a link to the session instead.
export default function DoneOnField({
  value,
  onChange,
  componentId,
  error,
  disabled,
  locked,
}: {
  value: string | null
  onChange: (value: string | null) => void
  componentId: number | undefined
  error?: string
  disabled: boolean
  locked?: { text: string; onOpenSession: () => void }
}) {
  const [openedAt] = useState(nowIsoUtc)
  const latest = useLastRideBefore(locked ? undefined : componentId, openedAt)
  const beforeThis = useLastRideBefore(locked ? undefined : componentId, value)

  if (locked) {
    return (
      <Stack gap={4}>
        <DateTimePicker
          label="Done on"
          value={isoUtcToDate(value)}
          disabled
          leftSection={<IconLock size={14} />}
          onChange={() => {}}
        />
        <Text size="xs" c="dimmed">
          <Anchor component="button" type="button" size="xs" onClick={locked.onOpenSession}>
            {locked.text}
          </Anchor>{' '}
          · change the date there
        </Text>
      </Stack>
    )
  }

  const afterLastRide = latest.data ? lastRideEnd(latest.data).toISOString() : null

  return (
    <Stack gap={4}>
      <Group gap="xs" align="flex-end" wrap="wrap">
        <DateTimePicker
          label="Done on"
          required
          disabled={disabled}
          value={isoUtcToDate(value)}
          onChange={(next) => onChange(mantineLocalStringToIsoUtc(next))}
          error={error}
          style={{ flex: '1 1 220px' }}
        />
        <Group gap={6} wrap="nowrap" mb={error ? 22 : 4}>
          <Button size="xs" radius="xl" variant="default" disabled={disabled} onClick={() => onChange(nowIsoUtc())}>
            Now
          </Button>
          {afterLastRide && (
            <Button size="xs" radius="xl" variant="default" disabled={disabled} onClick={() => onChange(afterLastRide)}>
              After last ride
            </Button>
          )}
        </Group>
      </Group>
      {componentId != null && !beforeThis.isPending && (
        <Text size="xs" c="dimmed">
          {lastRideLine(beforeThis.data)}
        </Text>
      )}
    </Stack>
  )
}
