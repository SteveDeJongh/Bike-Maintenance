module Strava
  # GET /strava/rides/:id's payload -- one ride, for the ride details modal:
  # identity, every stored metric (nulls passed through, never zero-filled),
  # and the components its distance counts toward with their current wear.
  class RideDetail
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
  end
end
