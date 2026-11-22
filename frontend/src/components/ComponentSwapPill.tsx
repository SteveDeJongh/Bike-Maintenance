import { Anchor, Box, Combobox, Loader, UnstyledButton, useCombobox } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconChevronDown } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { parseApiError } from '../api/errors'
import { useSwapComponentAssignment } from '../api/mutations'
import CandidateOption from './forms/CandidateOption'
import { useSwapOptions } from './forms/useSwapOptions'
import { nowIsoUtc } from '../utils/datetime'
import { emptyOptionLabel } from '../utils/swapOptions'
import type { ComponentAssignment } from '../types/models'

const SEARCH_THRESHOLD = 6

export interface SwapPillAssignment {
  id: number
  bike_id: number
  component_id: number
  ride_context: 'both' | 'outdoor_only' | 'indoor_only'
  component: { label: string; category: string }
}

// An installed component's name as a two-segment pill: the label links to
// the component, and the chevron opens a dropdown of what this slot can
// swap to (swapOptions -- exactly what the swap endpoint accepts).
// Choosing one swaps immediately, at now, with a notification either way.
// The root stops click propagation so neither segment (nor the dropdown,
// whose portal still bubbles through React) triggers a row's own click.
export default function ComponentSwapPill({
  assignment,
  onSwapped,
}: {
  assignment: SwapPillAssignment
  onSwapped?: (newAssignment: ComponentAssignment) => void
}) {
  const swap = useSwapComponentAssignment()
  const [search, setSearch] = useState('')
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption()
      setSearch('')
    },
  })
  const { options } = useSwapOptions({
    assignmentId: assignment.id,
    bikeId: assignment.bike_id,
    componentId: assignment.component_id,
    category: assignment.component.category,
    rideContext: assignment.ride_context,
  })

  const searchable = options.length > SEARCH_THRESHOLD
  const query = search.trim().toLowerCase()
  const visible = searchable && query ? options.filter((o) => o.label.toLowerCase().includes(query)) : options

  function handleSubmit(value: string) {
    combobox.closeDropdown()
    const chosen = options.find((option) => option.value === value)
    if (!chosen) return

    const oldLabel = assignment.component.label
    swap.mutate(
      { assignmentId: assignment.id, component_id: Number(value), swapped_at: nowIsoUtc() },
      {
        onSuccess: (result) => {
          notifications.show({ color: 'teal', message: `Swapped ${oldLabel} → ${chosen.label}` })
          onSwapped?.(result.assignment)
        },
        onError: (error) => {
          const messages = parseApiError(error).baseErrors
          notifications.show({ color: 'red', title: 'Swap failed', message: messages.join(' ') || 'Could not swap.' })
        },
      },
    )
  }

  const pending = swap.isPending

  return (
    <Box
      component="span"
      onClick={(event) => event.stopPropagation()}
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        maxWidth: '100%',
        height: 26,
        verticalAlign: 'middle',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-xl)',
        overflow: 'hidden',
        opacity: pending ? 0.7 : 1,
      }}
    >
      <Anchor
        component={Link}
        to={`/components/${assignment.component_id}`}
        size="sm"
        px="xs"
        truncate
        style={{ display: 'flex', alignItems: 'center', minWidth: 0, pointerEvents: pending ? 'none' : undefined }}
      >
        {assignment.component.label}
      </Anchor>
      <Combobox store={combobox} onOptionSubmit={handleSubmit} withinPortal position="bottom-start" width={280}>
        <Combobox.Target>
          <UnstyledButton
            aria-label={`Swap ${assignment.component.label}`}
            disabled={pending}
            onClick={() => combobox.toggleDropdown()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              borderLeft: '1px solid var(--mantine-color-default-border)',
              color: 'var(--mantine-color-dimmed)',
            }}
          >
            {pending ? <Loader size={12} /> : <IconChevronDown size={14} />}
          </UnstyledButton>
        </Combobox.Target>
        <Combobox.Dropdown>
          {searchable && (
            <Combobox.Search
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search"
            />
          )}
          <Combobox.Options mah={320} style={{ overflowY: 'auto' }}>
            {options.length === 0 ? (
              <Combobox.Empty>{emptyOptionLabel(assignment.component.category)}</Combobox.Empty>
            ) : visible.length === 0 ? (
              <Combobox.Empty>Nothing found</Combobox.Empty>
            ) : (
              visible.map((option) => (
                <Combobox.Option key={option.value} value={option.value}>
                  <CandidateOption label={option.label} brandModel={option.brandModel} status={option.status} />
                </Combobox.Option>
              ))
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </Box>
  )
}
