import { useState } from 'react'
import { Button } from '@mantine/core'
import BatchServiceModal from '../forms/BatchServiceModal'
import { initialPerformedAtForRide } from '../../utils/rideTiming'

// "Log service after this ride": opens BatchServiceModal for the ride's
// bike with the session's date prefilled at the ride's end. Lives in
// RideDetailModal's actions row (ride lists no longer carry row actions).
// Renders nothing without a bike -- an unattributed or ignored ride has no
// bike to log service against.
//
// Owns its own modal state rather than having each page wire one up: the
// modal only mounts while open (and BatchServiceModal itself renders
// nothing while closed), so a closed button costs one useState, even with
// a full page of rows mounted.
export default function LogServiceAfterRideButton({
  bikeId,
  movedAt,
  elapsedTime,
  label = 'Log service',
  variant = 'subtle',
  size = 'xs',
}: {
  bikeId: number | null
  movedAt: string
  elapsedTime: number | null
  label?: string
  variant?: 'subtle' | 'filled'
  size?: 'xs' | 'sm'
}) {
  const [opened, setOpened] = useState(false)

  if (bikeId == null) return null

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpened(true)}>
        {label}
      </Button>
      {opened && (
        <BatchServiceModal
          opened
          onClose={() => setOpened(false)}
          bikeId={bikeId}
          initialPerformedAt={initialPerformedAtForRide({ moved_at: movedAt, elapsed_time: elapsedTime })}
        />
      )}
    </>
  )
}
