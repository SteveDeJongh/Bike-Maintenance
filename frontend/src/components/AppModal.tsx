import type { ReactNode } from 'react'
import { Modal, type ModalProps } from '@mantine/core'
import { useIsMobile } from '../hooks/useIsMobile'

interface AppModalProps extends ModalProps {
  // A long form's submit/cancel row (Batch service, Category service
  // requirements, Maintenance event) -- rendered inline, right after
  // children, exactly like before on desktop; on mobile it's pulled out
  // of the modal's own scrolling content and pinned to the bottom of the
  // screen instead, so it's always reachable without scrolling to the end
  // of a long form. A short form has no reason to pass this -- its buttons
  // just stay part of `children`, inline, on both desktop and mobile.
  footer?: ReactNode
}

// The one shared wrapper every form modal in the app renders through
// (mobile step 3 of 4) -- new modals should use this instead of Mantine's
// Modal directly. On mobile (useIsMobile()) it goes fullScreen with a
// slide-up transition, since every modal is easier to use that way on a
// phone and the size="xl" ones (BatchServiceModal,
// CategoryServiceRequirementsModal) are cramped
// otherwise. Desktop keeps each modal's own `size` exactly as before --
// `fullScreen`/`transitionProps` are only ever set here, never passed in
// by a caller.
//
// No extra work was needed for "close always reachable" -- Mantine's own
// Modal header already renders `position: sticky; top: 0` unconditionally
// (confirmed in its compiled CSS), and fullScreen's Content is the one
// scrolling container (`overflow-y: auto`, `height: 100dvh`), so the
// header already stays pinned above a long scroll. The `footer` prop
// exists because Mantine has no equivalent built-in slot for the
// *bottom* of a form -- `position: sticky; bottom: 0` on an element inside
// `children` sticks to that same scrolling Content, which is exactly the
// mobile behavior wanted; it's simply skipped (rendered as a plain
// trailing element) on desktop.
export default function AppModal({ footer, children, ...modalProps }: AppModalProps) {
  const isMobile = useIsMobile()

  return (
    <Modal
      {...modalProps}
      fullScreen={isMobile}
      transitionProps={isMobile ? { transition: 'slide-up', duration: 200 } : modalProps.transitionProps}
    >
      {children}
      {footer &&
        (isMobile ? (
          <div
            style={{
              position: 'sticky',
              bottom: 0,
              marginTop: 'var(--mantine-spacing-md)',
              marginInline: 'calc(var(--mantine-spacing-md) * -1)',
              marginBottom: 'calc(var(--mantine-spacing-md) * -1)',
              padding: 'var(--mantine-spacing-md)',
              paddingBottom: 'calc(var(--mantine-spacing-md) + env(safe-area-inset-bottom))',
              background: 'var(--mantine-color-body)',
              borderTop: '1px solid var(--mantine-color-default-border)',
            }}
          >
            {footer}
          </div>
        ) : (
          footer
        ))}
    </Modal>
  )
}
