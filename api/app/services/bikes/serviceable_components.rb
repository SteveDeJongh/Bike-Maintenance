module Bikes
  # "What could a service session on this bike cover, as of `at`?" -- the
  # components mounted on it then, plus the ones most recently taken off it
  # (as opposed to another bike) by then. Shared by the batch-logger's
  # component picker and its create validation, so the two can never
  # disagree about what's eligible.
  class ServiceableComponents
    Result = Struct.new(:mounted, :off_bike, keyword_init: true)

    def self.call(bike, at: Time.current)
      off_bike_by_bike = off_bike_components_by_bike(bike.user, at: at)
      new(bike, at, off_bike_by_bike[bike.id] || []).call
    end

    # { bike_id => [Component, ...] }, non-retired-as-of-`at`, with no
    # active assignment anywhere at `at`, grouped by the bike their most
    # recent assignment ending at-or-before `at` was on. Dashboard::Summary
    # calls this at: Time.current instead of keeping its own separate
    # "now"-only query -- same result, one implementation.
    def self.off_bike_components_by_bike(user, at: Time.current)
      mounted_ids = ComponentAssignment.joins(:component).where(components: { user_id: user.id })
        .where(started_at: ..at).where("ended_at IS NULL OR ended_at > ?", at)
        .distinct.pluck(:component_id)

      # retired_on is a date; cast to a timestamp before comparing against
      # `at` so a component retired *today* (retired_on's midnight) still
      # reads as "before" any later moment today -- this is what keeps the
      # at: Time.current behavior identical to the old blanket
      # `retired_on: nil` check, not just approximately equal.
      candidates = user.components.where.not(id: mounted_ids)
        .where("retired_on IS NULL OR retired_on::timestamp >= ?", at)

      # Each candidate's most recent assignment ending at-or-before `at`,
      # batched (ComponentAssignment.last_ended_by_component) rather than
      # one query per candidate.
      last_ended = ComponentAssignment.last_ended_by_component(user, at: at)
      candidates.each_with_object(Hash.new { |h, k| h[k] = [] }) do |component, hash|
        entry = last_ended[component.id]
        hash[entry[:bike_id]] << component if entry
      end
    end

    def initialize(bike, at, off_bike_components)
      @bike = bike
      @at = at
      @off_bike_components = off_bike_components
    end

    def call
      Result.new(mounted: mounted_components, off_bike: off_bike_components)
    end

    private

    attr_reader :bike, :at, :off_bike_components

    # Nothing counts as mounted on a bike retired by `at`: its parts went
    # with it (Component.effectively_retired) -- retired_on cast to a
    # timestamp, the same rule as a component's own retired_on above.
    def mounted_components
      return Component.none if bike.retired_on.present? && bike.retired_on.to_time(:utc) <= at

      Component.where(id: bike.component_assignments.where(started_at: ..at)
        .where("ended_at IS NULL OR ended_at > ?", at).select(:component_id)).order(:label)
    end
  end
end
