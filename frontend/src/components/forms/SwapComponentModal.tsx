import { useState } from 'react'
import { Alert, Button, Group, Select, Stack, Text } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useComponents, useComponentsDetails } from '../../api/queries'
import { useSwapComponentAssignment } from '../../api/mutations'
import { parseApiError } from '../../api/errors'
import AppModal from '../AppModal'
import { formatDistance } from '../../utils/distance'
import { formatRemaining } from '../../utils/serviceInterval'
import { isoUtcToDate, mantineLocalStringToIsoUtc, nowIsoUtc } from '../../utils/datetime'
import { SERVICE_STATUS_SEVERITY } from '../../constants'
import type { ComponentDetail } from '../../types/models'

interface SwapComponentModalProps {
  opened: boolean
  onClose: () => void
  assignmentId: number
  category: string
  currentComponentId: number
}

// The one-step swap action's modal -- ends assignmentId and installs the
// chosen component in its place at "when", via POST
// /component_assignments/:id/swap. Shared by every row-actions surface
// that offers "Swap…" (the bike page's installed-components table and its
// mobile cards, ComponentDetail, the dashboard's BikeCard) -- one modal,
// not a copy per entry point.
export default function SwapComponentModal({
  opened,
  onClose,
  assignmentId,
  category,
  currentComponentId,
}: SwapComponentModalProps) {
  const { data: components } = useComponents()
  const swap = useSwapComponentAssignment()

  const eligible = (components ?? []).filter(
    (c) => c.category === category && c.id !== currentComponentId && !c.retired_on,
  )
  const eligibleIds = eligible.map((c) => c.id)
  const detailQueries = useComponentsDetails(eligibleIds)
  const detailsById = new Map<number, ComponentDetail>(
    detailQueries.filter((q) => q.data).map((q) => [q.data!.id, q.data!]),
  )

  const [componentId, setComponentId] = useState<string | null>(() =>
    eligible.length === 1 ? String(eligible[0].id) : null,
  )
  const [swappedAt, setSwappedAt] = useState<string | null>(nowIsoUtc())
  const [baseErrors, setBaseErrors] = useState<string[]>([])

  // The common case (the other chain) is one tap: when exactly one other
  // eligible component exists, it's preselected rather than making the
  // user pick from a list of one -- adjusted during render (not an
  // effect, which would need a setState-in-effect lint exception) the
  // same "resetting state when a dependency changes" pattern RidesTab's
  // own prevFilters and BatchServiceModal's own prevData already use.
  const [prevEligibleCount, setPrevEligibleCount] = useState(eligible.length)
  if (eligible.length !== prevEligibleCount) {
    setPrevEligibleCount(eligible.length)
    if (componentId === null && eligible.length === 1) setComponentId(String(eligible[0].id))
  }

  function captionFor(id: number): string | undefined {
    const detail = detailsById.get(id)
    if (!detail) return undefined

    const parts = [`Total ${formatDistance(detail.total_distance)}`]
    const worst = [...detail.service_requirements]
      .filter((r) => r.enabled)
      .sort((a, b) => SERVICE_STATUS_SEVERITY[b.status] - SERVICE_STATUS_SEVERITY[a.status])[0]
    if (worst) {
      const remaining = formatRemaining(worst.distance_remaining_meters, worst.days_remaining, worst.moving_time_remaining_seconds)
      if (remaining) parts.push(`${worst.requirement_name}: ${remaining}`)
    }
    return parts.join(' · ')
  }

  const options = eligible.map((c) => ({ value: String(c.id), label: c.label }))

  function handleClose() {
    setComponentId(null)
    setSwappedAt(nowIsoUtc())
    setBaseErrors([])
    onClose()
  }

  function handleSubmit() {
    if (!componentId || !swappedAt) return
    setBaseErrors([])
    swap.mutate(
      { assignmentId, component_id: Number(componentId), swapped_at: swappedAt },
      {
        onSuccess: handleClose,
        onError: (error) => setBaseErrors(parseApiError(error).baseErrors),
      },
    )
  }

  return (
    <AppModal opened={opened} onClose={handleClose} title="Swap component">
      {opened && (
        <Stack>
          {eligible.length === 0 ? (
            <Text c="dimmed">No other non-retired component in this category to swap in.</Text>
          ) : (
            <Select
              label="Install instead"
              required
              data={options}
              value={componentId}
              onChange={setComponentId}
              renderOption={({ option }) => {
                const caption = captionFor(Number(option.value))
                return (
                  <Stack gap={0}>
                    <Text size="sm">{option.label}</Text>
                    {caption && (
                      <Text size="xs" c="dimmed">
                        {caption}
                      </Text>
                    )}
                  </Stack>
                )
              }}
            />
          )}
          <DateTimePicker
            label="When"
            required
            value={isoUtcToDate(swappedAt)}
            onChange={(value) => setSwappedAt(mantineLocalStringToIsoUtc(value))}
          />

          {baseErrors.length > 0 && (
            <Alert color="red">
              {baseErrors.map((message) => (
                <div key={message}>{message}</div>
              ))}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!componentId} loading={swap.isPending}>
              Swap
            </Button>
          </Group>
        </Stack>
      )}
    </AppModal>
  )
}
