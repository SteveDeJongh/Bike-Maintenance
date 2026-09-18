import { modals } from '@mantine/modals'

interface ConfirmDeleteOptions {
  title: string
  message: string
  onConfirm: () => void
}

export function confirmDelete({ title, message, onConfirm }: ConfirmDeleteOptions) {
  modals.openConfirmModal({
    title,
    children: message,
    labels: { confirm: 'Delete', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm,
  })
}
