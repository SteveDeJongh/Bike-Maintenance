// "Log service after this ride" prefills the session's performed_at at the
// ride's end, not its start -- the maintenance happened after riding it.
// Takes only the two fields it needs, so every ride payload type
// (ActivityRideItem, BikeRide, StravaRide, DashboardRecentRide) fits.
export function initialPerformedAtForRide(ride: { moved_at: string; elapsed_time: number | null }): string {
  const movedAtMs = new Date(ride.moved_at).getTime()
  const elapsedMs = (ride.elapsed_time ?? 0) * 1000
  return new Date(movedAtMs + elapsedMs).toISOString()
}
