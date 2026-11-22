import { useState } from 'react'
import { Alert, Button, Group, Loader, Select, Stack, Text } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useComponent } from '../../api/queries'
import { useRetireComponent } from '../../api/mutations'
import { parseApiError } from '../../api/errors'
import AppModal from '../AppModal'
import CandidateOption from './CandidateOption'
import { useSwapCandidates } from './useSwapCandidates'
import { isoUtcToDate, mantineLocalStringToIsoUtc, nowIsoUtc } from '../../utils/datetime'
import { retireButtonLabel } from '../../utils/swapCandidates'

interface RetireComponentModalProps {
  opened: boolean
  onClose: () => void
  componentId: number
}

// Retire… -- POST /components/:id/retire. Takes the component off every
// bike it's on at "When" and sets retired_on to that local date; with a
// replacement chosen (offered only when it's on exactly one bike), swaps
// it into the same slot at the same instant. Shared by ComponentDetail,
// the bike page's installed rows/cards, and the Components list.
export default function RetireComponentModal({ opened, onClose, componentId }: RetireComponentModalProps) {
  return (
    <AppModal opened={opened} onClose={onClose} title="Retire component">
      {opened && <RetireForm componentId={componentId} onDone={onClose} />}
    </AppModal>
  )
}

function RetireForm({ componentId, onDone }: { componentId: number; onDone: () => void }) {
  const { data: component } = useComponent(componentId)
  const retire = useRetireComponent()
  const { options, captionFor } = useSwapCandidates(component?.category ?? '', componentId)

  const [at, setAt] = useState<string | null>(nowIsoUtc())
  const [replacementId, setReplacementId] = useState<string | null>(null)
  const [baseErrors, setBaseErrors] = useState<string[]>([])

  if (!component) return <Loader />

  const bikes = component.current_bikes
  const mounted = bikes.length > 0
  const canReplace = bikes.length === 1

  function handleSubmit() {
    if (!at) return
    setBaseErrors([])
    retire.mutate(
      {
        componentId,
        at,
        replacement_component_id: canReplace && replacementId ? Number(replacementId) : undefined,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      {
        onSuccess: onDone,
        onError: (error) => setBaseErrors(parseApiError(error).baseErrors),
      },
    )
  }

  return (
    <Stack>
      <Text size="sm">
        Retire <b>{component.label}</b>.
      </Text>
      <DateTimePicker
        label="When"
        required
        value={isoUtcToDate(at)}
        onChange={(value) => setAt(mantineLocalStringToIsoUtc(value))}
      />

      {mounted && (
        <Text size="sm" c="dimmed">
          Currently on {bikes.map((bike) => bike.name).join(' and ')}. It will be removed from the bike at this time.
        </Text>
      )}

      {canReplace &&
        (options.length === 0 ? (
          <Text size="sm" c="dimmed">
            No other non-retired component in this category to put in its place.
          </Text>
        ) : (
          <Select
            label="Replace with"
            description="Optional. Installed in the same slot at the same time."
            placeholder="Don't replace"
            clearable
            data={options}
            value={replacementId}
            onChange={setReplacementId}
            renderOption={({ option }) => <CandidateOption label={option.label} caption={captionFor(Number(option.value))} />}
          />
        ))}
      {bikes.length > 1 && (
        <Text size="sm" c="dimmed">
          It's on more than one bike, so a replacement can't be fitted here. Install the new component on each bike
          afterwards.
        </Text>
      )}

      {baseErrors.length > 0 && (
        <Alert color="red">
          {baseErrors.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </Alert>
      )}

      <Group justify="flex-end">
        <Button variant="default" onClick={onDone}>
          Cancel
        </Button>
        <Button color="red" onClick={handleSubmit} disabled={!at} loading={retire.isPending}>
          {retireButtonLabel(canReplace ? replacementId : null)}
        </Button>
      </Group>
    </Stack>
  )
}
