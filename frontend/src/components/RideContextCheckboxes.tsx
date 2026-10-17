import { Checkbox, Group } from '@mantine/core'

type RideContext = 'both' | 'outdoor_only' | 'indoor_only'

interface RideContextCheckboxesProps {
  value: RideContext
  onChange: (value: RideContext) => void
  // Set on the "add the complementary component" affordance row (see
  // BikeDetail.tsx's SlotRow) — pins both checkboxes to the one valid
  // remaining context and disables them.
  locked?: 'outdoor_only' | 'indoor_only'
}

export default function RideContextCheckboxes({ value, onChange, locked }: RideContextCheckboxesProps) {
  const outdoor = locked ? locked === 'outdoor_only' : value !== 'indoor_only'
  const trainer = locked ? locked === 'indoor_only' : value !== 'outdoor_only'

  function setOutdoor(checked: boolean) {
    if (!checked && !trainer) return // the enum has no "neither" state
    onChange(checked ? (trainer ? 'both' : 'outdoor_only') : 'indoor_only')
  }

  function setTrainer(checked: boolean) {
    if (!checked && !outdoor) return
    onChange(checked ? (outdoor ? 'both' : 'indoor_only') : 'outdoor_only')
  }

  return (
    <Group gap="sm" wrap="nowrap">
      <Checkbox
        label="Outdoor"
        checked={outdoor}
        disabled={Boolean(locked)}
        onChange={(event) => setOutdoor(event.currentTarget.checked)}
      />
      <Checkbox
        label="Trainer"
        checked={trainer}
        disabled={Boolean(locked)}
        onChange={(event) => setTrainer(event.currentTarget.checked)}
      />
    </Group>
  )
}
