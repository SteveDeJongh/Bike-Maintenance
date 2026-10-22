import { Checkbox, Group } from '@mantine/core'

type RideContext = 'both' | 'outdoor_only' | 'indoor_only'

interface RideContextCheckboxesProps {
  value: RideContext
  onChange: (value: RideContext) => void
}

export default function RideContextCheckboxes({ value, onChange }: RideContextCheckboxesProps) {
  const outdoor = value !== 'indoor_only'
  const trainer = value !== 'outdoor_only'

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
      <Checkbox label="Outdoor" checked={outdoor} onChange={(event) => setOutdoor(event.currentTarget.checked)} />
      <Checkbox label="Trainer" checked={trainer} onChange={(event) => setTrainer(event.currentTarget.checked)} />
    </Group>
  )
}
