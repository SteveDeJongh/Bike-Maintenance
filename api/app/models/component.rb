class Component < ApplicationRecord
  belongs_to :user
  has_many :component_assignments, dependent: :destroy
  has_many :bikes, through: :component_assignments
  has_many :maintenance_events, dependent: :destroy
  has_many :component_service_intervals, dependent: :destroy

  validates :label, presence: true
  validates :category, presence: true

  # Same convention as User#normalizes :email -- collapses whitespace
  # (including internal runs, not just leading/trailing) and turns a blank
  # value into nil, so "Shimano", "shimano ", and "Shimano  " don't drift
  # into different stored strings. Casing itself is left alone here; the
  # brand/model autocomplete suggests a canonical casing client-side instead
  # of this normalizing it away server-side. apply_to_nil stays at its
  # default (false), so a nil brand/model never reaches the lambda.
  normalizes :brand, :model, with: ->(value) { value.squish.presence }

  after_create :apply_category_service_intervals

  # { component_id => [{id:, name:}, ...] } for every currently-installed
  # (ended_at: nil) bike per component, batched for a many-row list (the
  # Components list's current_bikes column, the dashboard's off_bike/
  # attention bike lookups) -- a component can have more than one at once
  # (see ComponentAssignment's documented indoor_only-on-two-bikes
  # exception), so this is never assumed to be at most one.
  def self.current_bikes_by_component(user)
    ComponentAssignment.joins(:bike, :component)
      .where(ended_at: nil, components: { user_id: user.id })
      .pluck("component_assignments.component_id", "bikes.id", "bikes.name")
      .each_with_object(Hash.new { |h, k| h[k] = [] }) { |(cid, bid, bname), h| h[cid] << { id: bid, name: bname } }
  end

  # Lifetime sums across all this component's assignment windows, on the
  # bike it was mounted to for each one. Windows are half-open —
  # [started_at, ended_at) — so a component swapped mid-day is credited
  # only the rides that happened while it was actually mounted, and an
  # activity falling on a swap boundary is never counted twice. The
  # windowing itself lives on ComponentAssignment (#activities_from) so
  # both the lifetime and per-installation-period views share one
  # implementation.
  def total_distance
    component_assignments.sum(&:distance_meters)
  end

  def total_moving_time
    component_assignments.sum(&:moving_time)
  end

  def total_elevation_gain
    component_assignments.sum(&:elevation_gain)
  end

  # nil (not 0) when the component has no device-metered activities across
  # any assignment. Can't just average each assignment's own average_power
  # (weighting bias) — pools the actual matching activity ids first, then
  # takes one real average over them.
  def average_power
    activity_ids = component_assignments.flat_map { |assignment| assignment.activities.pluck(:id) }
    StravaActivity.where(id: activity_ids, device_watts: true).average(:average_watts)&.round
  end

  # Same as total_distance, but only counting activity after the most
  # recent MaintenanceEvent of the given service type (or all of it, if
  # there is no such event yet).
  def distance_since(service_type:)
    last_event = maintenance_events.where(service_type: service_type).order(performed_at: :desc).first
    return total_distance if last_event.nil?

    component_assignments.sum do |assignment|
      range_start = [assignment.started_at, last_event.performed_at].max
      assignment.activities_from(range_start).sum(:distance_meters)
    end
  end

  private

  # Creating a component in a category auto-creates an enabled, linked
  # ComponentServiceInterval for each of that category's suggested
  # templates -- adding a template later does NOT retroactively attach to
  # existing components (that's a deliberate, explicit "apply to" action
  # instead, since silently attaching to everything would be surprising).
  def apply_category_service_intervals
    CategoryServiceInterval.where(user_id: user_id, category: category).find_each do |template|
      component_service_intervals.create!(
        category_service_interval: template,
        service_type_id: template.service_type_id,
      )
    end
  end
end
