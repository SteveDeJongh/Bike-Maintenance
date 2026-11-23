import { Anchor } from '@mantine/core'

// A ride's name in any ride list: opens RideDetailModal (the list owns the
// modal and its rideId). Stops propagation so a row that's also clickable
// doesn't open it twice. Ride names never link out to Strava directly --
// the modal's "View on Strava" does.
export default function RideNameButton({ name, onOpen, fw }: { name: string; onOpen: () => void; fw?: number }) {
  return (
    <Anchor
      component="button"
      type="button"
      size="sm"
      fw={fw}
      ta="left"
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
    >
      {name}
    </Anchor>
  )
}
