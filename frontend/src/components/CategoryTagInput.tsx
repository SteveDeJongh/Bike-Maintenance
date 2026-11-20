import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ActionIcon, Box, Combobox, Group, Stack, Text, TextInput, UnstyledButton, useCombobox } from '@mantine/core'
import { IconPlus, IconSearch, IconX } from '@tabler/icons-react'
import { categoryLabel } from '../constants'
import { availableCategories, emptyCategoriesMessage, splitMatch } from '../utils/categoryTagInput'
import { AllCategoriesPill } from './ServiceTypeTagPills'
import classes from './CategoryTagInput.module.css'

interface CategoryTagInputProps {
  value: string[]
  onChange: (value: string[]) => void
  // The canonical list of the user's categories (useAllCategories) -- there's
  // no "create category" here. A selected tag outside it still shows as a
  // removable chip.
  categories: string[]
  label?: string
}

// Multi-select of component categories as removable chips plus a search
// field whose dropdown (Mantine Combobox, portalled and flip-aware, so the
// surrounding modal never clips or resizes for it) lists the categories not
// yet selected. Keyboard: ↑/↓ highlight, Enter adds, Escape clears and
// closes, Backspace in an empty field removes the last chip. Adding keeps
// focus in the field, so several can be added in a row.
export default function CategoryTagInput({ value, onChange, categories, label = 'Applies to' }: CategoryTagInputProps) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  })

  const options = availableCategories(categories, value, search)

  // Highlight the first match once the filtered options have rendered --
  // calling this inside onChange would run against the previous list.
  useEffect(() => {
    if (search !== '') combobox.selectFirstOption()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the store object isn't stable across renders; only a new search should move the highlight.
  }, [search])

  function add(category: string) {
    if (value.includes(category)) return
    onChange([...value, category])
    setSearch('')
    combobox.resetSelectedOption()
    inputRef.current?.focus()
  }

  function remove(category: string) {
    onChange(value.filter((selected) => selected !== category))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setSearch('')
      combobox.closeDropdown()
    } else if (event.key === 'Backspace' && search === '' && value.length > 0) {
      event.preventDefault()
      remove(value[value.length - 1])
    }
  }

  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <Box p="xs" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-sm)' }}>
        <Stack gap="xs">
          {value.length === 0 ? (
            <Group gap="xs" wrap="wrap">
              <AllCategoriesPill />
              <Text size="xs" c="dimmed">
                Add a category to limit where this type appears
              </Text>
            </Group>
          ) : (
            <Group gap={6} wrap="wrap">
              {value.map((category) => (
                <span key={category} className={classes.chip}>
                  {categoryLabel(category)}
                  <UnstyledButton
                    className={classes.remove}
                    aria-label={`Remove ${categoryLabel(category)}`}
                    onClick={() => remove(category)}
                  >
                    <IconX size={11} stroke={2} />
                  </UnstyledButton>
                </span>
              ))}
            </Group>
          )}

          <Combobox store={combobox} onOptionSubmit={add}>
            <Combobox.Target>
              <TextInput
                ref={inputRef}
                aria-label="Add category"
                placeholder="Add category"
                leftSection={<IconSearch size={14} />}
                value={search}
                onChange={(event) => {
                  setSearch(event.currentTarget.value)
                  combobox.openDropdown()
                }}
                onFocus={() => combobox.openDropdown()}
                onClick={() => combobox.openDropdown()}
                onBlur={() => combobox.closeDropdown()}
                onKeyDown={handleKeyDown}
              />
            </Combobox.Target>

            <Combobox.Dropdown>
              <Combobox.Options mah={260} style={{ overflowY: 'auto' }}>
                {options.length === 0 ? (
                  <Combobox.Empty>{emptyCategoriesMessage(categories, value)}</Combobox.Empty>
                ) : (
                  options.map((category) => (
                    <Combobox.Option key={category} value={category}>
                      <Group justify="space-between" wrap="nowrap" gap="xs">
                        <Text size="sm">
                          {splitMatch(categoryLabel(category), search).map((part, index) =>
                            part.match ? (
                              <Text key={index} span fw={700} inherit>
                                {part.text}
                              </Text>
                            ) : (
                              <span key={index}>{part.text}</span>
                            ),
                          )}
                        </Text>
                        <ActionIcon
                          component="span"
                          size="sm"
                          variant="subtle"
                          aria-hidden
                          tabIndex={-1}
                        >
                          <IconPlus size={12} />
                        </ActionIcon>
                      </Group>
                    </Combobox.Option>
                  ))
                )}
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
        </Stack>
      </Box>
    </Stack>
  )
}
