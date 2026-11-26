import { useState } from 'react'
import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core'
import { IconBike } from '@tabler/icons-react'
import PageSection from '../PageSection'
import DataList from '../datalist/DataList'
import DataListRow from '../datalist/DataListRow'
import { dataListMinWidth, dataListTemplate } from '../datalist/dataListModel'
import AssignmentDetailModal from '../forms/AssignmentDetailModal'
import { formatDistance } from '../../utils/distance'
import { installationRangeText, installationRowId, installationsSummary } from './componentPageModel'
import { COMPONENT_SECTION_STORAGE_KEYS } from './componentSections'
import { installationStatus, sortInstallations } from '../../utils/installationStatus'
import type { ComponentInstallation } from '../../types/models'

// The component page's installation history (a PageSection): every
// assignment -- current ones, then open ones left on a retired bike (a grey
// "Retired bike" chip and icon), then past ones, each newest first
// (sortInstallations) -- a bike icon (primary while current), the bike
// with a "Current" chip and its range and ride context, and the stint's
// distance. A row opens that installation's AssignmentDetailModal, current
// or past.
// `onAddInstallation` (absent for a retired component) shows "+ Add
// installation" in the header, opening Install on bike; `highlightedId` is
// the row it just created.
export default function InstallationHistorySection({
  installations,
  highlightedId = null,
  onAddInstallation,
}: {
  installations: ComponentInstallation[]
  highlightedId?: number | null
  onAddInstallation?: () => void
}) {
  const [selected, setSelected] = useState<ComponentInstallation | null>(null)
  const template = dataListTemplate({ leading: ['20px'], main: 'minmax(160px, 1fr)', fields: ['minmax(80px, auto)'] })
  const minWidth = dataListMinWidth({ leading: [20], main: 160, fields: [80] })

  return (
    <PageSection
      id="component-installations"
      title="Installation history"
      summary={installationsSummary(installations)}
      foldedSummary={installationsSummary(installations)}
      storageKey={COMPONENT_SECTION_STORAGE_KEYS.installations}
      actions={
        onAddInstallation && (
          <Button size="xs" variant="default" radius="xl" onClick={onAddInstallation}>
            + Add installation
          </Button>
        )
      }
    >
      {installations.length === 0 ? (
        <Paper withBorder radius="md" p="lg">
          <Text c="dimmed" ta="center" size="sm">
            Never installed
          </Text>
        </Paper>
      ) : (
        <DataList template={template} minWidth={minWidth}>
          {sortInstallations(installations).map((installation) => {
            const status = installationStatus(installation, installation.bike)
            const current = status === 'current'
            return (
              <DataListRow
                key={installation.id}
                id={installationRowId(installation.id)}
                tone={installation.id === highlightedId ? 'highlight' : undefined}
                ariaLabel={`${installation.bike.name}${current ? ', current' : status === 'retired_bike' ? ', on a retired bike' : ''}, open installation`}
                onOpen={() => setSelected(installation)}
              >
                <IconBike
                  size={18}
                  aria-hidden
                  color={current ? 'var(--mantine-primary-color-filled)' : 'var(--mantine-color-gray-6)'}
                />
                <Stack gap={0} style={{ minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    <Text size="sm" fw={500} truncate>
                      {installation.bike.name}
                    </Text>
                    {current && (
                      <Badge size="xs" variant="light">
                        Current
                      </Badge>
                    )}
                    {status === 'retired_bike' && (
                      <Badge size="xs" variant="light" color="gray">
                        Retired bike
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed" truncate>
                    {installationRangeText(installation)}
                  </Text>
                </Stack>
                <Text size="sm" c={current ? undefined : 'dimmed'} fw={current ? 600 : undefined} ta="right" style={{ whiteSpace: 'nowrap' }}>
                  {formatDistance(installation.distance_meters)}
                </Text>
              </DataListRow>
            )
          })}
        </DataList>
      )}

      <AssignmentDetailModal
        opened={selected !== null}
        onClose={() => setSelected(null)}
        bikeId={selected?.bike.id ?? 0}
        assignmentId={selected?.id ?? null}
      />
    </PageSection>
  )
}
