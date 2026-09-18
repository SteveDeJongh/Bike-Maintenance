class Component < ApplicationRecord
  has_many :component_assignments, dependent: :destroy
  has_many :bikes, through: :component_assignments
  has_many :maintenance_events, dependent: :destroy

  validates :label, presence: true
  validates :category, presence: true

  # Sum of StravaActivity distance across all this component's assignment
  # windows (each window is [started_on, ended_on || today] on that
  # assignment's bike).
  def total_distance
    component_assignments.sum { |assignment| distance_during(assignment, assignment.started_on) }
  end

  # Same as total_distance, but only counting activity after the most
  # recent MaintenanceEvent of the given type (or all of it, if there is
  # no such event yet).
  def distance_since(event_type:)
    last_event = maintenance_events.where(event_type: event_type).order(performed_on: :desc).first
    return total_distance if last_event.nil?

    component_assignments.sum do |assignment|
      range_start = [assignment.started_on, last_event.performed_on].max
      distance_during(assignment, range_start)
    end
  end

  def distance_since_wax
    distance_since(event_type: "wax")
  end

  private

  def distance_during(assignment, range_start)
    range_end = assignment.ended_on || Date.current
    return 0 if range_start > range_end

    StravaActivity
      .where(bike_id: assignment.bike_id)
      .where(moved_on: range_start..range_end)
      .sum(:distance_meters)
  end
end
