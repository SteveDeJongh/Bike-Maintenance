import { useComponentCategorySettings, useComponents } from '../../api/queries'
import { swapOptions, swapOptionStatus, type SwapSlot } from '../../utils/swapOptions'

export interface SwapOptionView {
  value: string
  label: string
  brandModel: string | null
  status: string
}

// The ordered, captioned swap options for one slot -- swapOptions over the
// Components list plus the category's allows_multiple_assignments setting
// (a missing settings row means false, as on the backend). Shared by
// ComponentSwapPill and RetireComponentModal's "Replace with".
export function useSwapOptions(slot: SwapSlot | null): { options: SwapOptionView[]; isPending: boolean } {
  const components = useComponents()
  const settings = useComponentCategorySettings()

  if (!slot) return { options: [], isPending: false }

  const allowsMultiple = settings.data?.find((s) => s.category === slot.category)?.allows_multiple_assignments ?? false
  const options = swapOptions(components.data ?? [], slot, allowsMultiple).map((option) => ({
    value: String(option.component.id),
    label: option.component.label,
    brandModel: [option.component.brand, option.component.model].filter(Boolean).join(' ') || null,
    status: swapOptionStatus(option),
  }))

  return { options, isPending: components.isPending || settings.isPending }
}
