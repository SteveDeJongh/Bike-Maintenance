import { describe, expect, it } from 'vitest'
import { partitionServiceTypes, tagsLabel } from './serviceTypePicker'

const types = [
  { id: 1, name: 'inspect', categories: [] },
  { id: 2, name: 'Hot Wax', categories: ['chain'] },
  { id: 3, name: 'Fork 200 h', categories: ['front_suspension'] },
  { id: 4, name: 'drip wax', categories: ['chain'] },
  { id: 5, name: 'Clean', categories: [] },
  { id: 6, name: 'Degrease', categories: ['cassette', 'chain'] },
]

function names(rows: { type: { name: string } }[]): string[] {
  return rows.map((row) => row.type.name)
}

describe('partitionServiceTypes', () => {
  it('shows tagged types first, then universal ones, each alphabetical and case-insensitive', () => {
    const { visible } = partitionServiceTypes(types, 'chain', null)

    expect(names(visible)).toEqual(['Degrease', 'drip wax', 'Hot Wax', 'Clean', 'inspect'])
    expect(visible.map((row) => row.label)).toEqual(['Chain', 'Chain', 'Chain', 'any', 'any'])
  })

  it('puts types tagged only for other categories behind "Show all", labelled with their tags', () => {
    const { hidden } = partitionServiceTypes(types, 'chain', null)

    expect(names(hidden)).toEqual(['Fork 200 h'])
    expect(hidden[0].label).toBe('Front Suspension')
  })

  it('keeps the selected type visible even when the category would hide it', () => {
    const { visible, hidden } = partitionServiceTypes(types, 'chain', 3)

    expect(names(visible).at(-1)).toBe('Fork 200 h')
    expect(hidden).toEqual([])
  })

  it('shows everything, unlabelled and alphabetical, without a category', () => {
    const { visible, hidden } = partitionServiceTypes(types, undefined, null)

    expect(names(visible)).toEqual(['Clean', 'Degrease', 'drip wax', 'Fork 200 h', 'Hot Wax', 'inspect'])
    expect(visible.every((row) => row.label === null)).toBe(true)
    expect(hidden).toEqual([])
  })

  it('shows tagged and universal types for a category nothing is tagged with', () => {
    const { visible, hidden } = partitionServiceTypes(types, 'saddle', null)

    expect(names(visible)).toEqual(['Clean', 'inspect'])
    expect(hidden).toHaveLength(4)
  })
})

describe('tagsLabel', () => {
  it('is "any" for a universal type and the category labels otherwise', () => {
    expect(tagsLabel({ id: 1, name: 'x', categories: [] })).toBe('any')
    expect(tagsLabel({ id: 2, name: 'y', categories: ['cassette', 'chain'] })).toBe('Cassette, Chain')
  })
})
