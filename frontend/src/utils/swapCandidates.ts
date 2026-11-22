import type { ComponentWithServiceStatus } from '../types/models'

// The components that could go into a slot in place of `currentComponentId`:
// same category, not that component itself, not retired. Shared by
// SwapComponentModal and RetireComponentModal's "Replace with", so the two
// always offer the same list (the backend's ComponentAssignments::Swap
// enforces the same rules).
export function swapCandidates(
  components: ComponentWithServiceStatus[],
  category: string,
  currentComponentId: number,
): ComponentWithServiceStatus[] {
  return components.filter((c) => c.category === category && c.id !== currentComponentId && !c.retired_on)
}

// "Retire" or "Retire and replace", for the modal's primary button.
export function retireButtonLabel(replacementId: string | null): string {
  return replacementId ? 'Retire and replace' : 'Retire'
}
