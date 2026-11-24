// The component page's collapsible sections, remembered per device
// (PageSection's storageKey; never per account).
export const COMPONENT_SECTION_STORAGE_KEYS = {
  intervals: 'componentPage.collapsed.intervals',
  maintenance: 'componentPage.collapsed.maintenance',
  installations: 'componentPage.collapsed.installations',
} as const
