import { useState } from 'react'
import { Alert, Button, Checkbox, Loader, NumberInput, Stack, Text, Title } from '@mantine/core'
import { useNotificationSetting } from '../../api/queries'
import { useUpdateNotificationSetting } from '../../api/mutations'
import type { NotificationSetting } from '../../types/models'

export default function NotificationsPage() {
  const { data: setting, isPending, isError, error } = useNotificationSetting()

  return (
    <Stack>
      <Title order={3}>Notifications</Title>
      <Text c="dimmed">
        Global defaults for due/warning service alerts. A category can override either of these on
        the Component Categories page.
      </Text>

      {isPending && <Loader />}
      {isError && (
        <Alert color="red" title="Failed to load notification settings">
          {error.message}
        </Alert>
      )}

      {setting && <NotificationsForm key={JSON.stringify(setting)} setting={setting} />}
    </Stack>
  )
}

function NotificationsForm({ setting }: { setting: NotificationSetting }) {
  const updateSetting = useUpdateNotificationSetting()

  const [enabled, setEnabled] = useState(setting.notifications_enabled)
  const [thresholdPercent, setThresholdPercent] = useState<number | ''>(setting.warning_threshold_percent)

  const dirty = enabled !== setting.notifications_enabled || thresholdPercent !== setting.warning_threshold_percent

  function handleSave() {
    if (thresholdPercent === '') return
    updateSetting.mutate({ notifications_enabled: enabled, warning_threshold_percent: thresholdPercent })
  }

  return (
    <Stack maw={360}>
      <Checkbox
        label="Show due/warning alerts"
        checked={enabled}
        onChange={(event) => setEnabled(event.currentTarget.checked)}
        disabled={updateSetting.isPending}
      />
      <NumberInput
        label="Warning threshold (%)"
        description="Show a warning when an interval is within this percent of being due"
        value={thresholdPercent}
        onChange={(value) => setThresholdPercent(value === '' ? '' : Number(value))}
        min={0}
        max={100}
        disabled={updateSetting.isPending}
      />

      {updateSetting.isError && <Alert color="red">{updateSetting.error.message}</Alert>}

      <Button onClick={handleSave} disabled={!dirty || thresholdPercent === ''} loading={updateSetting.isPending}>
        Save
      </Button>
    </Stack>
  )
}
