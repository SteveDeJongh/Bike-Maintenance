class ComponentAssignment < ApplicationRecord
  # Same clock-skew allowance as ComponentAssignments::Swap and
  # ServiceSession.
  FUTURE_TOLERANCE = 5.minutes

  belongs_to :component
  belongs_to :bike

  validates :started_at, presence: true
  validates :ride_context, inclusion: { in: %w[both outdoor_only indoor_only] }
  validate :ended_at_after_started_at
  validate :not_in_the_future
  validate :no_overlapping_assignment_for_component
  validate :no_overlapping_assignment_for_bike_slot
  validate :component_and_bike_have_same_owner

  # { component_id => { bike_id:, bike_name:, ended_at: } } -- each of the
  # user's components' most recently ended assignment, ended at or before
  # `at`, in one DISTINCT ON query. Shared by GET /components' last_bike and
  # Bikes::ServiceableComponents.off_bike_components_by_bike, so "which bike
  # was this last on" has one definition. Ties on ended_at break on the
  # higher id. Pass component_ids: to narrow it (e.g. one component's show).
  def self.last_ended_by_component(user, at: Time.current, component_ids: nil)
    scope = joins(:component, :bike).where(components: { user_id: user.id }).where(ended_at: ..at)
    scope = scope.where(component_id: component_ids) if component_ids
    scope
      .select("DISTINCT ON (component_assignments.component_id) component_assignments.component_id, " \
              "component_assignments.bike_id, bikes.name AS bike_name, component_assignments.ended_at")
      .order("component_assignments.component_id, component_assignments.ended_at DESC, component_assignments.id DESC")
      .to_h { |row| [ row.component_id, { bike_id: row.bike_id, bike_name: row.bike_name, ended_at: row.ended_at } ] }
  end

  # Activities on this assignment's bike from range_start onward, clipped to
  # ended_at if this assignment has already ended, and to only outdoor or only
  # indoor rides if ride_context restricts it (see StravaActivity#indoor/
  # #outdoor -- trainer rides and Zwift/virtual rides both count as indoor)
  # -- this is what makes a dedicated indoor-only component (e.g. a trainer
  # cassette) only accrue mileage from indoor rides, and its outdoor-only
  # counterpart only from real rides, even while both are "installed" on the
  # same bike at once. The shared windowing primitive both this assignment's
  # own stats and Component's lifetime stats (which need a custom, clipped
  # range_start for distance_since) are built on.
  def activities_from(range_start)
    scope = StravaActivity.where(bike_id: bike_id)
    scope = scope.outdoor if ride_context == "outdoor_only"
    scope = scope.indoor if ride_context == "indoor_only"
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

  # A new installation's end must come after its start (a closed, back-
  # filled stint needs some length); an update keeps the older "at or
  # after", so ending or editing an existing one behaves as it always has.
  def ended_at_after_started_at
    return if started_at.blank? || ended_at.blank?

    if new_record?
      errors.add(:ended_at, "must be after the installed date") if ended_at <= started_at
    elsif ended_at < started_at
      errors.add(:ended_at, "must be at or after started_at")
    end
  end

  # Neither date can be more than FUTURE_TOLERANCE ahead (clock skew, the
  # same allowance as a swap's date) -- only checked when that date is
  # being set, so older rows and unrelated updates are never affected.
  def not_in_the_future
    limit = Time.current + FUTURE_TOLERANCE
    errors.add(:started_at, "can't be in the future") if started_at.present? && will_save_change_to_started_at? && started_at > limit
    errors.add(:ended_at, "can't be in the future") if ended_at.present? && will_save_change_to_ended_at? && ended_at > limit
  end

  # Normally a component can only have one active assignment at a time --
  # it's a physical part, it can't be bolted to two bikes at once. The one
  # exception: a category with allows_multiple_assignments set (e.g.
  # cassette) also permits the SAME component to have concurrent indoor_only
  # assignments on different bikes -- for a part that actually lives on a
  # trainer rather than on any one bike's frame, "which bike" is just an
  # attribution label for a given ride, not a claim about where the part is
  # physically mounted. Both sides have to be indoor_only (not a
  # one-each-context pairing like the bike-slot carve-out below) since both
  # assignments are genuinely claiming the same kind of ride data.
  def no_overlapping_assignment_for_component
    return if component_id.blank? || component.blank? || started_at.blank?

    conflicting = ComponentAssignment.includes(:bike).where(component_id: component_id).where.not(id: id).order(:started_at)
      .find { |other| overlaps?(other) && !(allows_multiple_assignments? && ride_context == "indoor_only" && other.ride_context == "indoor_only") }
    return if conflicting.nil?

    errors.add(:base, "Overlaps its own installation on #{conflicting.bike.name}, #{range_text(conflicting)}")
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

    errors.add(:base, "Overlaps #{conflicting.component.label} on this slot, #{range_text(conflicting)}")
  end

  # "Jun 2 → Sep 30", "Jun 2 → now"; the year when it isn't this year, and
  # the times when both ends fall on the same day (a same-day swap).
  def range_text(other)
    start = other.started_at.in_time_zone
    finish = other.ended_at&.in_time_zone
    same_day = finish && start.to_date == finish.to_date
    day = ->(time) { time.year == Time.current.year ? time.strftime("%b %-d") : time.strftime("%b %-d, %Y") }
    clock = ->(time) { time.strftime("%-I:%M %p") }
    return "#{day.call(start)} → now" unless finish
    return "#{day.call(start)}, #{clock.call(start)} → #{clock.call(finish)}" if same_day

    "#{day.call(start)} → #{day.call(finish)}"
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
  # as allowed to have more than one active installation at once (e.g.
  # cassette) -- a per-category setting, not a blanket rule. Backs both: a
  # second, complementary-context component in the same bike+category slot
  # (no_overlapping_assignment_for_bike_slot), and the same component shared
  # across multiple bikes while indoor_only
  # (no_overlapping_assignment_for_component). No setting row yet means "no"
  # (single-install is the safe default, matching how every category
  # behaved before the ride-context feature existed).
  def allows_multiple_assignments?
    ComponentCategorySetting.find_by(user_id: component.user_id, category: component.category)
      &.allows_multiple_assignments || false
  end

  # Two half-open [started_at, ended_at) ranges overlap unless one starts
  # at or after the other ends -- matching attribution's own windowing
  # (ComponentAssignment#activities_from, Component#total_distance's half-
  # open window), so a swap's exact boundary (one assignment's ended_at
  # equal to the next one's started_at) is never flagged as an overlap: a
  # ride exactly on that boundary is already credited to exactly one of
  # the two assignments, never both, so there's nothing for this
  # validation to protect against at that exact instant. A nil ended_at
  # means the assignment is still ongoing.
  def overlaps?(other)
    return false if ended_at.present? && other.started_at >= ended_at
    return false if other.ended_at.present? && started_at >= other.ended_at

    true
  end
end
