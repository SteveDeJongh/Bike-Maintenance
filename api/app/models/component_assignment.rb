class ComponentAssignment < ApplicationRecord
  belongs_to :component
  belongs_to :bike

  validates :started_at, presence: true
  validates :ride_context, inclusion: { in: %w[both outdoor_only indoor_only] }
  validate :ended_at_after_started_at
  validate :no_overlapping_assignment_for_component
  validate :no_overlapping_assignment_for_bike_slot
  validate :component_and_bike_have_same_owner

  # Activities on this assignment's bike from range_start onward, clipped to
  # ended_at if this assignment has already ended, and to only outdoor or only
  # indoor (trainer) rides if ride_context restricts it -- this is what makes
  # a dedicated indoor-only component (e.g. a trainer cassette) only accrue
  # mileage from trainer rides, and its outdoor-only counterpart only from
  # real rides, even while both are "installed" on the same bike at once.
  # The shared windowing primitive both this assignment's own stats and
  # Component's lifetime stats (which need a custom, clipped range_start for
  # distance_since) are built on.
  def activities_from(range_start)
    scope = StravaActivity.where(bike_id: bike_id)
    scope = scope.where(trainer: false) if ride_context == "outdoor_only"
    scope = scope.where(trainer: true) if ride_context == "indoor_only"
    return StravaActivity.none if ended_at && range_start >= ended_at

    ended_at ? scope.where(moved_at: range_start...ended_at) : scope.where(moved_at: range_start..)
  end

  def activities
    activities_from(started_at)
  end

  def distance_meters
    activities.sum(:distance_meters)
  end

  def moving_time
    activities.sum(:moving_time)
  end

  def elevation_gain
    activities.sum(:total_elevation_gain)
  end

  # nil (not 0) when this installation period has no device-metered
  # activities, consistent with Bike#average_power's "no data" convention.
  def average_power
    activities.where(device_watts: true).average(:average_watts)&.round
  end

  private

  def component_and_bike_have_same_owner
    return if component.blank? || bike.blank?

    errors.add(:base, "Component and bike must belong to the same user") if component.user_id != bike.user_id
  end

  def ended_at_after_started_at
    return if started_at.blank? || ended_at.blank?

    errors.add(:ended_at, "must be at or after started_at") if ended_at < started_at
  end

  def no_overlapping_assignment_for_component
    return if component_id.blank? || started_at.blank?

    conflicts = ComponentAssignment.where(component_id: component_id).where.not(id: id)
    if conflicts.any? { |other| overlaps?(other) }
      errors.add(:base, "This component is already assigned to a bike during that period")
    end
  end

  def no_overlapping_assignment_for_bike_slot
    return if bike_id.blank? || started_at.blank? || component.blank?

    conflicting = ComponentAssignment
      .includes(:component)
      .where(bike_id: bike_id, components: { category: component.category })
      .where.not(id: id)
      .order(:started_at)
      .find { |other| overlaps?(other) && !(allows_multiple_assignments? && mutually_exclusive_ride_contexts?(other)) }

    return if conflicting.nil?

    timeframe = conflicting.ended_at ? "#{format_timestamp(conflicting.started_at)} to " \
      "#{format_timestamp(conflicting.ended_at)}" : "#{format_timestamp(conflicting.started_at)} with no end date yet"

    if conflicting.ended_at
      errors.add(:base, "#{conflicting.component.label} was already installed as the #{component.category} " \
        "on this bike from #{timeframe}. The earliest this component can be installed is " \
        "#{format_timestamp(conflicting.ended_at)}.")
    else
      errors.add(:base, "#{conflicting.component.label} is already installed as the #{component.category} " \
        "on this bike, starting #{timeframe}. Remove or end that assignment before installing another " \
        "#{component.category} during an overlapping period.")
    end
  end

  def format_timestamp(time)
    time.strftime("%B %-d, %Y at %-I:%M %p")
  end

  # An outdoor-only assignment and an indoor-only assignment never actually
  # compete for the same mileage, so they're allowed to overlap in the same
  # bike+category slot -- e.g. a dedicated trainer cassette alongside a
  # dedicated road cassette. Any other pairing (two of the same restricted
  # context, or either paired with "both") can still claim the same ride, so
  # it's still a real conflict.
  def mutually_exclusive_ride_contexts?(other)
    [ride_context, other.ride_context].sort == %w[indoor_only outdoor_only]
  end

  # Whether this component's category is one the user has explicitly marked
  # as allowed to have a second, complementary-context component installed at
  # once (e.g. cassette) -- a per-category setting, not a blanket rule. No
  # setting row yet means "no" (single-install is the safe default, matching
  # how every category behaved before the ride-context feature existed).
  def allows_multiple_assignments?
    ComponentCategorySetting.find_by(user_id: component.user_id, category: component.category)
      &.allows_multiple_assignments || false
  end

  # Two [started_at, ended_at] ranges overlap unless one entirely precedes
  # the other. A nil ended_at means the assignment is still ongoing.
  def overlaps?(other)
    return false if ended_at.present? && other.started_at > ended_at
    return false if other.ended_at.present? && started_at > other.ended_at

    true
  end
end
