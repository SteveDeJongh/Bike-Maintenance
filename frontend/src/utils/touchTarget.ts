// A plain inline style (not a CSS class) so each call site can decide
// whether it applies at all -- gate it behind useIsMobile() wherever the
// same element is also used on desktop (e.g. the dashboard's compact
// "Log service" buttons), or apply it unconditionally in a component that
// only ever renders on mobile in the first place (e.g.
// InstalledComponentsCardList, which has no desktop counterpart).
// display: 'inline-flex' + centered content keeps a small Button's/Text's
// own visual size unchanged -- this only grows the tappable box around it,
// per mobile step 3 of 4's "bump the size, or wrap the target so it's
// bigger" instruction (the latter, here).
export const MOBILE_TAP_TARGET_STYLE = {
  minHeight: 44,
  minWidth: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const
