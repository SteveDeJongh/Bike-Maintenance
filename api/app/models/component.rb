class Component < ApplicationRecord
  belongs_to :user
  has_many :component_assignments, dependent: :destroy
  has_many :bikes, through: :component_assignments
  has_many :maintenance_events, dependent: :destroy
  has_many :component_service_intervals, dependent: :destroy

  validates :label, presence: true
  validates :category, presence: true

  after_create :apply_category_service_intervals

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
