class Component < ApplicationRecord
  has_many :component_assignments, dependent: :destroy
  has_many :bikes, through: :component_assignments
  has_many :maintenance_events, dependent: :destroy

  validates :label, presence: true
  validates :category, presence: true

  # Sum of StravaActivity distance across all this component's assignment
  # windows, on the bike it was mounted to for each one. Windows are
  # half-open — [started_at, ended_at) — so a component swapped mid-day is
  # credited only the rides that happened while it was actually mounted,
  # and an activity falling on a swap boundary is never counted twice.
  def total_distance
    component_assignments.sum { |assignment| distance_during(assignment, assignment.started_at) }
  end

  # Same as total_distance, but only counting activity after the most
  # recent MaintenanceEvent of the given type (or all of it, if there is
  # no such event yet).
  def distance_since(event_type:)
    last_event = maintenance_events.where(event_type: event_type).order(performed_at: :desc).first
    return total_distance if last_event.nil?

    component_assignments.sum do |assignment|
      range_start = [assignment.started_at, last_event.performed_at].max
      distance_during(assignment, range_start)
    end
  end

  def distance_since_wax
    distance_since(event_type: "wax")
  end

  private

  def distance_during(assignment, range_start)
    activities = StravaActivity.where(bike_id: assignment.bike_id)

    if assignment.ended_at
      return 0 if range_start >= assignment.ended_at

      activities.where(moved_at: range_start...assignment.ended_at).sum(:distance_meters)
    else
      activities.where(moved_at: range_start..).sum(:distance_meters)
    end
  end
end
