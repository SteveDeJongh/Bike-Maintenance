import { useMemo } from 'react'
import { Text } from '@mantine/core'
import DataList, { DataListBand } from '../datalist/DataList'
import DataListHeader, { type DataListColumn } from '../datalist/DataListHeader'
import { EventRow, SessionHeaderRow } from './MaintenanceLogRow'
import { isSortableField, maintenanceListLayout, MAINTENANCE_FIELD_LABELS, type MaintenanceField, type MaintenanceSort } from './maintenanceLogFields'
import { buildMaintenanceRenderList, type MaintenanceGroupBy, type MaintenanceLogPage } from './maintenanceLogModel'
import type { MaintenanceLogEvent } from '../../types/models'

// The Maintenance page's one list, on the shared DataList: the header
// band, Month / Component bands, session headers with their events, and
// plain services, all on one grid (buildMaintenanceRenderList decides the
// rows).
export default function MaintenanceLogList({
  pages,
  groupBy,
  fields,
  sortColumn,
  order,
  onSort,
  onOpenEvent,
  onOpenSession,
}: {
  pages: MaintenanceLogPage[]
  groupBy: MaintenanceGroupBy | 'flat'
  fields: MaintenanceField[]
  sortColumn: MaintenanceSort
  order: 'asc' | 'desc'
  onSort: (column: MaintenanceSort) => void
  onOpenEvent: (event: MaintenanceLogEvent) => void
  onOpenSession: (sessionId: number) => void
}) {
  const entries = useMemo(() => buildMaintenanceRenderList(pages, groupBy), [pages, groupBy])
  const { template, minWidth } = maintenanceListLayout(fields)
  const columns: DataListColumn<MaintenanceSort>[] = [
    { key: 'performed_at', label: 'Date' },
    { key: 'icon' },
    { key: 'service', label: 'Service', sortable: false },
    ...fields.map((field) => ({
      key: field,
      label: MAINTENANCE_FIELD_LABELS[field],
      sortable: isSortableField(field),
      align: (['component_km', 'since_last', 'bike_km'] as string[]).includes(field) ? ('right' as const) : undefined,
    })),
    { key: 'trailing' },
  ]

  return (
    <DataList template={template} minWidth={minWidth}>
      <DataListHeader columns={columns} sortColumn={sortColumn} order={order} onSort={onSort} />
      {entries.map((entry) => {
        switch (entry.type) {
          case 'month':
            return <Band key={entry.key} title={entry.title} aside={entry.totals} />
          case 'component':
            return <Band key={entry.key} title={entry.title} />
          case 'session':
            return (
              <SessionHeaderRow
                key={entry.key}
                session={entry.session}
                countLabel={entry.countLabel}
                showDate={entry.showDate}
                fields={fields}
                onOpen={() => onOpenSession(entry.session.id)}
              />
            )
          case 'event':
            return (
              <EventRow
                key={entry.key}
                event={entry.event}
                fields={fields}
                showDate={entry.showDate}
                inSession={entry.inSession}
                sessionLink={entry.sessionLink}
                onOpen={() => onOpenEvent(entry.event)}
                onOpenSession={onOpenSession}
              />
            )
        }
      })}
    </DataList>
  )
}

function Band({ title, aside }: { title: string; aside?: string }) {
  return (
    <DataListBand
      title={
        <Text size="sm" fw={600}>
          {title}
        </Text>
      }
      aside={
        aside && (
          <Text size="xs" c="dimmed">
            {aside}
          </Text>
        )
      }
    />
  )
}
