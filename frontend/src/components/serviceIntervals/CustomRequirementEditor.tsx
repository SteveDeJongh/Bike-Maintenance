import { useState } from 'react'
import { Alert, Group, NumberInput, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core'
import { useComponentServiceRequirements } from '../../api/queries'
import { useUpdateComponentServiceRequirement } from '../../api/mutations'
import { formatApiError } from '../../api/errors'
import { SatisfiersEditor } from '../forms/serviceRequirementShared'
import {
  CALENDAR_UNIT_OPTIONS,
  RIDE_FILTER_OPTIONS,
  activeDimensionsOf,
  hoursToSeconds,
  kmToMeters,
  metersToKm,
  secondsToHours,
} from '../forms/serviceRequirementHelpers'
import type { CalendarUnit, ComponentServiceRequirementWithStatus, RideFilter } from '../../types/models'

// A custom row's own name/thresholds/ride_filter/satisfiers, edited inline
// -- same shared editor pieces (SatisfiersEditor + the plain
// constants/conversion helpers) CategoryServiceRequirementsModal uses for a
// template, per the plan's "Custom requirements edit satisfiers inline with
// same editor as Settings." A custom row has no inheritance of its own, so
// its effective values already ARE its raw ones -- no override concept.
export default function CustomRequirementEditor({
  requirement,
  componentId,
  category,
}: {
  requirement: ComponentServiceRequirementWithStatus
  componentId: number
  category: string
}) {
  const updateRequirement = useUpdateComponentServiceRequirement(requirement.id)
  // requirement.satisfiers (from GET /components/:id) is already resolved
  // (nil allowance -> this requirement's own threshold) -- fine for display
  // elsewhere, but wrong here: the editor needs the RAW, possibly-null
  // allowance columns so an unset override shows its "same as requirement"
  // placeholder instead of a resolved number that looks like someone typed
  // it in. The raw CRUD endpoint is the one source of truth for that.
  const { data: rawRequirements } = useComponentServiceRequirements(componentId)
  const rawSatisfiers = rawRequirements?.find((r) => r.id === requirement.id)?.satisfiers ?? []

  const [name, setName] = useState(requirement.requirement_name)
  const [km, setKm] = useState<number | ''>(metersToKm(requirement.distance_meters))
  const [hours, setHours] = useState<number | ''>(secondsToHours(requirement.moving_time_seconds))
  const [calendarAmount, setCalendarAmount] = useState<number | ''>(requirement.calendar_amount ?? '')
  const [calendarUnit, setCalendarUnit] = useState<CalendarUnit>(requirement.calendar_unit ?? 'month')
  const [rideFilter, setRideFilter] = useState<RideFilter>(requirement.ride_filter)

  function commitName() {
    const trimmed = name.trim()
    if (trimmed && trimmed !== requirement.requirement_name) updateRequirement.mutate({ name: trimmed })
  }

  return (
    <Stack gap="xs">
      <TextInput label="Name" value={name} onChange={(event) => setName(event.currentTarget.value)} onBlur={commitName} w={300} />
      <Group align="flex-end" wrap="wrap">
        <NumberInput
          label="Every (km)"
          placeholder="not used"
          value={km}
          onChange={(v) => {
            const next = v === '' ? '' : Number(v)
            setKm(next)
            updateRequirement.mutate({ distance_meters: kmToMeters(next) })
          }}
          min={0}
          w={120}
        />
        <NumberInput
          label="Every (hours)"
          placeholder="not used"
          value={hours}
          onChange={(v) => {
            const next = v === '' ? '' : Number(v)
            setHours(next)
            updateRequirement.mutate({ moving_time_seconds: hoursToSeconds(next) })
          }}
          min={0}
          w={120}
        />
        <Group gap={4} align="flex-end" wrap="nowrap">
          <NumberInput
            label="Every"
            placeholder="not used"
            value={calendarAmount}
            onChange={(v) => {
              const next = v === '' ? '' : Number(v)
              setCalendarAmount(next)
              updateRequirement.mutate({
                calendar_amount: next === '' ? null : next,
                calendar_unit: next === '' ? null : calendarUnit,
              })
            }}
            min={0}
            w={90}
          />
          <Select
            data={CALENDAR_UNIT_OPTIONS}
            value={calendarUnit}
            onChange={(v) => {
              const next = (v as CalendarUnit | null) ?? 'month'
              setCalendarUnit(next)
              if (calendarAmount !== '') updateRequirement.mutate({ calendar_unit: next })
            }}
            w={100}
            allowDeselect={false}
          />
        </Group>
      </Group>

      <div>
        <Text size="sm" fw={500} mb={4}>
          Counts
        </Text>
        <SegmentedControl
          data={RIDE_FILTER_OPTIONS}
          value={rideFilter}
          onChange={(v) => {
            const next = v as RideFilter
            setRideFilter(next)
            updateRequirement.mutate({ ride_filter: next })
          }}
        />
        {rideFilter !== 'all' && calendarAmount !== '' && (
          <Text size="xs" c="dimmed" mt={4}>
            Calendar time keeps counting on indoor rides.
          </Text>
        )}
      </div>

      {updateRequirement.isError && <Alert color="red">{formatApiError(updateRequirement.error)}</Alert>}

      <SatisfiersEditor
        owner={{ type: 'component', id: requirement.id }}
        category={category}
        satisfiers={rawSatisfiers}
        activeDimensions={activeDimensionsOf(requirement)}
      />
    </Stack>
  )
}

