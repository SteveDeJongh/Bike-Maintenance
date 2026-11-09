import { Anchor, Tooltip } from '@mantine/core'

// Shared verbatim by Ride history and the Rides tab's Name column --
// Strava's own brand guideline for API-sourced content: "View on Strava"
// wording (here as the tooltip/accessible label) and the `orange` Mantine
// token (never a hardcoded hex), so it doesn't read as an in-app action
// against this app's own `radar` accent.
export default function ViewOnStravaLink({ stravaId, name }: { stravaId: number; name: string }) {
  return (
    <Tooltip label="View on Strava">
      <Anchor
        href={`https://www.strava.com/activities/${stravaId}`}
        target="_blank"
        rel="noopener noreferrer"
        c="orange"
        aria-label="View on Strava"
      >
        {name}
      </Anchor>
    </Tooltip>
  )
}
