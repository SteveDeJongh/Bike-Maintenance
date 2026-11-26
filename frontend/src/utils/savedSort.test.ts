import { describe, expect, it } from 'vitest'
import { savedSort } from './savedSort'

const columns = ['performed_at', 'component_km', 'since_last'] as const
const defaultSort = { column: 'performed_at' as const, direction: 'desc' as const }

describe('savedSort', () => {
  it('drops an invalid saved column together with its direction', () => {
    expect(savedSort({ sort_column: 'service_type', sort_direction: 'asc' }, columns, defaultSort)).toEqual(defaultSort)
    expect(savedSort({ sort_column: null, sort_direction: 'asc' }, columns, defaultSort)).toEqual(defaultSort)
  })

  it('keeps a valid saved column and its direction', () => {
    expect(savedSort({ sort_column: 'since_last', sort_direction: 'asc' }, columns, defaultSort)).toEqual({ column: 'since_last', direction: 'asc' })
    expect(savedSort({ sort_column: 'performed_at', sort_direction: 'asc' }, columns, defaultSort)).toEqual({ column: 'performed_at', direction: 'asc' })
  })

  it('uses the default direction for a valid column without one', () => {
    expect(savedSort({ sort_column: 'component_km' }, columns, defaultSort)).toEqual({ column: 'component_km', direction: 'desc' })
    expect(savedSort({}, columns, defaultSort)).toEqual(defaultSort)
  })
})
