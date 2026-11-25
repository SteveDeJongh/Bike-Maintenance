import { useState } from 'react'
import { Button, Menu, Popover } from '@mantine/core'
import { DatePicker } from '@mantine/dates'
import { IconChevronDown } from '@tabler/icons-react'
import { DATE_PRESETS, type DatePreset } from '../activity/dateRanges'

// The toolbar's date-range pill (Activity, Maintenance): All time and the
// presets as a menu; "Custom range…" opens a range picker in a popover on
// the same pill. Highlighted while a range is set.
export default function DateRangePill({
  preset,
  onPresetChange,
  customRange,
  onCustomRangeChange,
}: {
  preset: DatePreset | null
  onPresetChange: (preset: DatePreset | null) => void
  customRange: [string | null, string | null]
  onCustomRangeChange: (range: [string | null, string | null]) => void
}) {
  const [pickerOpened, setPickerOpened] = useState(false)
  const option = DATE_PRESETS.find((p) => p.value === preset)
  const [start, end] = customRange
  const label =
    preset === 'custom' && start ? `${start}${end ? ` – ${end}` : ''}` : (option?.label.replace('…', '') ?? 'Date')

  return (
    <Popover opened={pickerOpened} onChange={setPickerOpened} position="bottom-start" shadow="md">
      <Popover.Target>
        <div>
          <Menu position="bottom-start" shadow="md" withinPortal>
            <Menu.Target>
              <Button size="xs" radius="xl" variant={preset ? 'light' : 'default'} rightSection={<IconChevronDown size={12} />}>
                {label}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => onPresetChange(null)}>All time</Menu.Item>
              <Menu.Divider />
              {DATE_PRESETS.map((item) => (
                <Menu.Item
                  key={item.value}
                  onClick={() => {
                    onPresetChange(item.value)
                    if (item.value === 'custom') setPickerOpened(true)
                  }}
                >
                  {item.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </div>
      </Popover.Target>
      <Popover.Dropdown>
        <DatePicker
          type="range"
          value={customRange}
          onChange={(value) => {
            onCustomRangeChange(value)
            if (value[0] && value[1]) setPickerOpened(false)
          }}
        />
      </Popover.Dropdown>
    </Popover>
  )
}
