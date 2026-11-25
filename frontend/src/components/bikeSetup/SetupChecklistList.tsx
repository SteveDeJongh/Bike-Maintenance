import type { ReactNode } from 'react'
import DataList from '../datalist/DataList'
import DataListHeader, { type DataListColumn } from '../datalist/DataListHeader'
import { dataListMinWidth, dataListTemplate } from '../datalist/dataListModel'

// checkbox | Category | Label (the main track) | Brand | Model | Notes.
const TEMPLATE = dataListTemplate({
  leading: ['32px', 'minmax(150px, 1fr)'],
  main: 'minmax(170px, 1.2fr)',
  fields: ['minmax(130px, 1fr)', 'minmax(130px, 1fr)', 'minmax(90px, auto)'],
})
const MIN_WIDTH = dataListMinWidth({ leading: [32, 150], main: 170, fields: [130, 130, 90] })

const COLUMNS: DataListColumn<string>[] = [
  { key: 'check', sortable: false },
  { key: 'category', label: 'Category', sortable: false },
  { key: 'label', label: 'Label', hint: 'blank uses brand + model', sortable: false },
  { key: 'brand', label: 'Brand', sortable: false },
  { key: 'model', label: 'Model', sortable: false },
  { key: 'notes', label: 'Notes', sortable: false },
]

// The setup checklist: one DataList (Paper, header band, rows on the
// shared grid, sideways scroll below its min width). Its rows are plain
// DataListRows -- SetupRowItem and AlreadyTrackedRow -- not buttons.
// `stacked` (a phone) drops the grid and the header band.
export default function SetupChecklistList({ stacked, children }: { stacked: boolean; children: ReactNode }) {
  return (
    <DataList template={TEMPLATE} minWidth={MIN_WIDTH} stacked={stacked}>
      {!stacked && <DataListHeader columns={COLUMNS} />}
      {children}
    </DataList>
  )
}
