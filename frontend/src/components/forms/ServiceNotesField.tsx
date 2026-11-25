import { Textarea, type TextareaProps } from '@mantine/core'

// The notes field for a logged service -- the Log service modal's "Notes ·
// optional" and BatchServiceModal's session note -- one component, so the
// two forms keep the same field.
export default function ServiceNotesField({
  value,
  onChange,
  label = 'Notes · optional',
  placeholder = 'Products used, what you noticed',
  ...rest
}: {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
} & Omit<TextareaProps, 'value' | 'onChange' | 'label' | 'placeholder'>) {
  return (
    <Textarea
      label={label}
      placeholder={placeholder}
      autosize
      minRows={2}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      {...rest}
    />
  )
}
