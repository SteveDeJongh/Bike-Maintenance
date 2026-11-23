module Maintenance
  # The driving requirement's progress from a RequirementStatus result --
  # all nil when there's no enabled requirement (result is nil). Shared by
  # the dashboard's bike cards (Dashboard::Summary) and the ride details
  # endpoint (Strava::RideDetail), so the two always describe wear with the
  # same fields.
  module WearFields
    def self.call(result)
      {
        service_status: result&.status,
        fraction_used: result&.fraction_used,
        driving_dimension: result&.driving_dimension,
        distance_remaining_meters: result&.distance_remaining_meters,
        moving_time_remaining_seconds: result&.moving_time_remaining_seconds,
        days_remaining: result&.days_remaining,
      }
    end
  end
end
