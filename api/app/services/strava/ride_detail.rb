module Strava
  # GET /strava/rides/:id's payload -- one ride, for the ride details modal:
  # identity, every stored metric (nulls passed through, never zero-filled),
  # the components its distance counts toward with their current wear, and
  # the service sessions on its bike around it.
  class RideDetail
    # Sessions listed after the ride when the bike has no later ride.
    AFTER_LIMIT = 5

    def self.call(ride, user)
      new(ride, user).call
    end

    def initialize(ride, user)
      @ride = ride
      @user = user
    end

    def call
      ignored_gear_ids = StravaGear.ignored_for(user).pluck(:strava_gear_id)
      bike = ride.bike

      RideSerialization.base_json(ride).symbolize_keys.merge(
        trainer: ride.trainer,
        indoor: ride.indoor?,
        bike: bike && { id: bike.id, name: bike.name },
        gear_id: ride.gear_id,
        gear_mapped: ride.gear_id.present? && user.bikes.exists?(strava_gear_id: ride.gear_id),
        reason: ride.reason(ignored_gear_ids),
        components: components,
        service_nearby: service_nearby(bike),
      )
    end

    private

    attr_reader :ride, :user

    # CountedTowardQuery for this one ride (so the indoor/outdoor split
    # cassette resolves exactly as the feed's counted_toward does), each with
    # its worst requirement's wear (Maintenance::WearFields) -- or, with no
    # enabled requirement, its lifetime distance instead.
    def components
      counted = Maintenance::CountedTowardQuery.call(user, activity_ids: [ ride.id ])[ride.id] || []
      return [] if counted.empty?

      by_id = user.components.where(id: counted.map { |c| c[:component_id] }).index_by(&:id)
      worst = Maintenance::RequirementStatus.worst_result_by_component(user)

      counted.filter_map do |entry|
        component = by_id[entry[:component_id]]
        next unless component

        result = worst[component.id]
        { component_id: component.id, label: component.label, category: component.category }
          .merge(Maintenance::WearFields.call(result))
          .merge(total_distance_meters: result ? nil : component.total_distance)
      end.sort_by { |c| c[:label].to_s }
    end

    # The latest session at or before the ride ("before"), and the sessions
    # after it up to the bike's next ride ("after"; capped when there's no
    # later ride). Empty when the ride has no bike.
    def service_nearby(bike)
      return [] unless bike

      sessions = bike.service_sessions.includes(:maintenance_events)
      before = sessions.where(performed_at: ..ride.moved_at).order(performed_at: :desc, id: :desc).first

      next_ride_at = StravaActivity.where(bike_id: bike.id)
        .where("(moved_at, id) > (?, ?)", ride.moved_at, ride.id)
        .order(:moved_at, :id).pick(:moved_at)
      after = sessions.where("performed_at > ?", ride.moved_at)
      after = next_ride_at ? after.where("performed_at < ?", next_ride_at) : after.limit(AFTER_LIMIT)
      after = after.order(:performed_at, :id)

      [ before && session_json(before, bike, "before"), *after.map { |s| session_json(s, bike, "after") } ].compact
    end

    def session_json(session, bike, position)
      {
        id: session.id,
        occurred_at: session.performed_at,
        summary: Activity::Feed.session_summary(session.maintenance_events.size, bike.name),
        position: position,
      }
    end
  end
end
