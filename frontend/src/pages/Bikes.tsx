import { useMemo, useState } from 'react'
import { Alert, Button, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import { useBikes, useBikeTypes, useTableViewPreference } from '../api/queries'
import AddBikeCard from '../components/bikes/AddBikeCard'
import BikeListCard from '../components/bikes/BikeListCard'
import BikesSummaryTiles from '../components/bikes/BikesSummaryTiles'
import BikesTable from '../components/bikes/BikesTable'
import BikesToolbar from '../components/bikes/BikesToolbar'
import RetiredBikeRows from '../components/bikes/RetiredBikeRows'
import { bikeTileTotals, bikesHeaderLine, sortBikeCards, type BikeCardSort } from '../components/bikes/bikesList'
import { useBikesView } from '../components/bikes/useBikesView'
import BikeFormModal from '../components/forms/BikeFormModal'
import { useIsMobile } from '../hooks/useIsMobile'
import { BIKE_LIST_COLUMNS, BIKE_LIST_COLUMN_LABELS } from '../constants'
import type { BikeWithStats, TableViewPreferenceData } from '../types/models'

const BIKE_LIST_FIELD_OPTIONS = BIKE_LIST_COLUMNS.map((column) => ({
  key: column,
  label: BIKE_LIST_COLUMN_LABELS[column],
}))

// The Bikes list (docs/frontend-ui.md, "Bikes page"): a header with
// + Add bike, a TileRow of totals, a toolbar (Cards | Table, the card sort,
// Show retired, Fields), then bike cards or the DataList table. A phone
// always gets cards. Rows and cards open the bike; Edit/Delete live there.
export default function Bikes() {
  const navigate = useNavigate()
  const { data, isPending, isError, error } = useBikes()
  const { data: preferenceData, isPending: preferencePending } = useTableViewPreference('bikes')
  const [createOpened, setCreateOpened] = useState(false)
  const totals = bikeTileTotals(data ?? [])

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={2}>Bikes</Title>
          {data && (
            <Text size="sm" c="dimmed">
              {bikesHeaderLine(totals)}
            </Text>
          )}
        </div>
        <Button onClick={() => setCreateOpened(true)}>+ Add bike</Button>
      </Group>

      {(isPending || preferencePending) && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load bikes">
          {error.message}
        </Alert>
      )}

      {/* useBikesView seeds from the preference once, on mount. */}
      {data && preferenceData && (
        <BikesContent bikes={data} initialData={preferenceData.data} onAdd={() => setCreateOpened(true)} />
      )}

      <BikeFormModal
        opened={createOpened}
        onClose={() => setCreateOpened(false)}
        onCreateSuccess={(bike) => navigate(`/bikes/${bike.id}/setup`)}
      />
    </Stack>
  )
}

function BikesContent({
  bikes,
  initialData,
  onAdd,
}: {
  bikes: BikeWithStats[]
  initialData: TableViewPreferenceData
  onAdd: () => void
}) {
  const state = useBikesView(initialData)
  const isMobile = useIsMobile()
  const { data: bikeTypes } = useBikeTypes()
  const typeNameById = useMemo(() => new Map((bikeTypes ?? []).map((type) => [type.id, type.name])), [bikeTypes])
  // A phone always gets cards: the table needs width it doesn't have.
  const showCards = state.view === 'cards' || isMobile

  return (
    <>
      <BikesSummaryTiles totals={bikeTileTotals(bikes)} />
      <BikesToolbar state={state} fieldOptions={BIKE_LIST_FIELD_OPTIONS} />
      {state.table.saveError && (
        <Alert color="red" withCloseButton onClose={state.table.clearSaveError}>
          {state.table.saveError}
        </Alert>
      )}
      {showCards ? (
        <BikeCardGrid
          bikes={bikes}
          sort={state.cardSort}
          showRetired={state.showRetired}
          typeNameById={typeNameById}
          onAdd={onAdd}
        />
      ) : (
        <BikesTable
          bikes={state.showRetired ? bikes : bikes.filter((bike) => !bike.retired_on)}
          table={state.table}
          typeNameById={typeNameById}
        />
      )}
    </>
  )
}

// Active bikes as cards in the chosen order, closed by the "Add a bike"
// card (also the empty state), then retired bikes as slim rows when shown,
// most recently retired first.
function BikeCardGrid({
  bikes,
  sort,
  showRetired,
  typeNameById,
  onAdd,
}: {
  bikes: BikeWithStats[]
  sort: BikeCardSort
  showRetired: boolean
  typeNameById: Map<number, string>
  onAdd: () => void
}) {
  const active = sortBikeCards(
    bikes.filter((bike) => !bike.retired_on),
    sort,
  )
  const retired = bikes
    .filter((bike) => bike.retired_on)
    .sort((a, b) => (b.retired_on ?? '').localeCompare(a.retired_on ?? ''))

  return (
    <Stack gap="lg">
      <div
        style={{
          display: 'grid',
          // min(): a 380px minimum alone would overflow a phone.
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(380px, 100%), 1fr))',
          gap: 'var(--mantine-spacing-md)',
        }}
      >
        {active.map((bike) => (
          <BikeListCard
            key={bike.id}
            bike={bike}
            typeName={bike.bike_type_id === null ? null : (typeNameById.get(bike.bike_type_id) ?? null)}
          />
        ))}
        <AddBikeCard onAdd={onAdd} />
      </div>
      {showRetired && <RetiredBikeRows bikes={retired} />}
    </Stack>
  )
}
