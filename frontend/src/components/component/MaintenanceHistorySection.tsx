import { useEffect, useState } from 'react'
import { Button, Group, Paper, Stack, Text } from '@mantine/core'
import { IconTool } from '@tabler/icons-react'
import { useSearchParams } from 'react-router-dom'
import PageSection from '../PageSection'
import DataList from '../datalist/DataList'
import DataListRow from '../datalist/DataListRow'
import { dataListMinWidth, dataListTemplate } from '../datalist/dataListModel'
import MaintenanceEventFormModal from '../forms/MaintenanceEventFormModal'
import ServiceSessionViewModal from '../forms/ServiceSessionViewModal'
import { formatShortDate } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import { eventNoteLine, maintenanceSummary } from './componentPageModel'
import { COMPONENT_SECTION_STORAGE_KEYS } from './componentSections'
import type { ComponentMaintenanceEvent } from '../../types/models'

const SHOWN = 10
const HIGHLIGHT_MS = 2500
// Longer than PageSection's 200ms unfold.
const SCROLL_DELAY_MS = 250

const rowId = (eventId: number) => `maintenance-event-${eventId}`

// The component page's maintenance history (a PageSection): newest first,
// the first ten then "Show all". Each row is the date, a wrench, the
// service with a note line, and "at 1,160 km" -- the component's lifetime
// distance when it was done. A row opens the event: its service session's
// view for a batch service, else the event's edit form. The Activity log
// and the bike page link here as ?event=<id>: that row is shown, scrolled
// to, highlighted briefly and opened, once.
export default function MaintenanceHistorySection({
  componentId,
  events,
}: {
  componentId: number
  events: ComponentMaintenanceEvent[]
}) {
  const [searchParams] = useSearchParams()
  const linkedId = searchParams.get('event') ? Number(searchParams.get('event')) : null
  const linkedIndex = events.findIndex((event) => event.id === linkedId)

  // Seeded once: a deep-linked event past the first ten opens the full list.
  const [showAll, setShowAll] = useState(() => linkedIndex >= SHOWN)
  const [highlightedId, setHighlightedId] = useState<number | null>(() => (linkedIndex >= 0 ? linkedId : null))
  // The deep-linked event opens with the page, seeded once like the above.
  const [editing, setEditing] = useState<ComponentMaintenanceEvent | null>(() => {
    const linked = events[linkedIndex]
    return linked && linked.service_session_id == null ? linked : null
  })
  const [sessionId, setSessionId] = useState<number | null>(() => events[linkedIndex]?.service_session_id ?? null)

  function open(event: ComponentMaintenanceEvent) {
    if (event.service_session_id != null) setSessionId(event.service_session_id)
    else setEditing(event)
  }

  useEffect(() => {
    if (highlightedId == null) return
    // After PageSection's unfold (openOnMount) has rendered the row.
    const scroll = setTimeout(
      () => document.getElementById(rowId(highlightedId))?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      SCROLL_DELAY_MS,
    )
    const unhighlight = setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS)
    return () => {
      clearTimeout(scroll)
      clearTimeout(unhighlight)
    }
    // Once, for the link the page opened with (StrictMode's rerun sets the
    // timers again after its cleanup).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = showAll ? events : events.slice(0, SHOWN)
  const template = dataListTemplate({ leading: ['minmax(64px, auto)', '20px'], main: 'minmax(140px, 1fr)', fields: ['minmax(84px, auto)'] })
  const minWidth = dataListMinWidth({ leading: [64, 20], main: 140, fields: [84] })

  return (
    <PageSection
      id="component-maintenance"
      title="Maintenance history"
      summary={maintenanceSummary(events.length)}
      foldedSummary={maintenanceSummary(events.length)}
      storageKey={COMPONENT_SECTION_STORAGE_KEYS.maintenance}
      openOnMount={linkedIndex >= 0}
    >
      {events.length === 0 ? (
        <Paper withBorder radius="md" p="lg">
          <Text c="dimmed" ta="center" size="sm">
            No maintenance logged yet
          </Text>
        </Paper>
      ) : (
        <Stack gap="xs">
          <DataList template={template} minWidth={minWidth}>
            {shown.map((event) => {
              const note = eventNoteLine(event)
              return (
                <DataListRow
                  key={event.id}
                  id={rowId(event.id)}
                  ariaLabel={`${event.service_type_name}, ${formatShortDate(event.performed_at)}, open`}
                  onOpen={() => open(event)}
                  tone={event.id === highlightedId ? 'highlight' : undefined}
                >
                  <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    {formatShortDate(event.performed_at)}
                  </Text>
                  <IconTool size={16} color="var(--mantine-color-teal-6)" aria-hidden />
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>
                      {event.service_type_name}
                    </Text>
                    {note && (
                      <Text size="xs" c="dimmed" truncate>
                        {note}
                      </Text>
                    )}
                  </Stack>
                  <Text size="sm" c="dimmed" ta="right" style={{ whiteSpace: 'nowrap' }}>
                    at {formatDistance(event.component_distance_at_event_meters)}
                  </Text>
                </DataListRow>
              )
            })}
          </DataList>
          {!showAll && events.length > SHOWN && (
            <Group>
              <Button size="xs" radius="xl" variant="default" onClick={() => setShowAll(true)}>
                Show all ({events.length})
              </Button>
            </Group>
          )}
        </Stack>
      )}

      <MaintenanceEventFormModal
        opened={editing !== null}
        onClose={() => setEditing(null)}
        event={editing ?? undefined}
        defaultComponentId={componentId}
      />
      {sessionId !== null && <ServiceSessionViewModal opened onClose={() => setSessionId(null)} sessionId={sessionId} />}
    </PageSection>
  )
}
