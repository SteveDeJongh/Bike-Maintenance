module Components
  # Read-only: every assignment that contradicts its component's retired_on
  # -- still open, or ending after the end of retired_on's day. Backs
  # `rails components:audit_retired_mounted`; changes nothing.
  #
  # "End of retired_on's day" is in the app's Time.zone, since there's no
  # viewer zone here -- an entry within a few hours of midnight can read
  # differently in the user's own zone, so rows carry both raw values.
  class RetiredMountedAudit
    Row = Struct.new(:reason, :user_id, :component_id, :label, :retired_on, :assignment_id, :bike_name,
      :started_at, :ended_at, keyword_init: true)

    def self.call(zone: Time.zone)
      ComponentAssignment.joins(:component).includes(:component, :bike)
        .where.not(components: { retired_on: nil })
        .order("components.user_id", "components.id", :started_at)
        .filter_map { |assignment| row_for(assignment, zone) }
    end

    def self.row_for(assignment, zone)
      component = assignment.component
      reason =
        if assignment.ended_at.nil?
          "open"
        elsif assignment.ended_at >= zone.local(component.retired_on.year, component.retired_on.month, component.retired_on.day).next_day
          "ends_after_retired_on"
        end
      return unless reason

      Row.new(
        reason: reason, user_id: component.user_id, component_id: component.id, label: component.label,
        retired_on: component.retired_on, assignment_id: assignment.id, bike_name: assignment.bike.name,
        started_at: assignment.started_at, ended_at: assignment.ended_at,
      )
    end
    private_class_method :row_for
  end
end
