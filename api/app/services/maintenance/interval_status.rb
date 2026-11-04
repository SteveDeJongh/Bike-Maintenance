module Maintenance
  # Computes a ComponentServiceInterval's current status: how much of its
  # distance/time interval has been used since the baseline (the most
  # recent matching MaintenanceEvent, else the component's earliest
  # assignment, else when it was acquired), which dimension is driving that
  # (whichever fraction-used is higher), and due/warning/ok against the
  # category's effective warning threshold.
  class IntervalStatus
    Result = Struct.new(
      :component_service_interval, :status, :distance_remaining_meters, :days_remaining, :driving_dimension,
      :distance_used_meters, :days_used, :fraction_used,
      keyword_init: true,
    ) do
      # The individual sub-checks banner_eligible? composes -- each public
      # and reusable on its own (the dashboard needs mounted?/
      # notifications_enabled?/dismissed? as separate flags, not just the
      # single combined boolean banner_eligible? gives the alert banners).
      def mounted?
        component_service_interval.component.component_assignments.exists?(ended_at: nil)
      end

      def retired?
        component_service_interval.component.retired_on.present?
      end

      def notifications_enabled?
        component = component_service_interval.component
        NotificationSetting.effective_for(user: component.user, category: component.category)[:enabled]
      end

      # A dismissal only suppresses its own status -- if the status has
      # since escalated (warning dismissed, now due), it shows immediately.
      # It also only suppresses until the next completed sync after it was
      # dismissed.
      def dismissed?(credential:)
        dismissal = component_service_interval.service_alert_dismissals.order(dismissed_at: :desc).first
        return false if dismissal.nil?
        return false unless dismissal.dismissed_status == status

        credential.nil? || credential.last_synced_at.nil? || dismissal.dismissed_at > credential.last_synced_at
      end

      # Banner eligibility -- an ineligible interval still has a real
      # status (shown on the component/table pages), it just doesn't
      # appear in the app-wide due/warning banners.
      def banner_eligible?(credential:)
        return false if status == "ok"
        return false unless mounted?
        return false if retired?
        return false unless notifications_enabled?

        !dismissed?(credential: credential)
      end
    end

    # Every one of the component's intervals, enabled or not -- a disabled
    # interval is still shown (with its own computed status) so its Switch
    # can be flipped back on "in place", per CLAUDE.md's documented
    # disable-vs-remove distinction. Eligibility/banner/table-column
    # computations go through .for_user below instead, which does filter
    # to enabled -- this method backs the component detail page only.
    def self.for_component(component)
      distances = BatchedDistanceQuery.call(component.user)
      component.component_service_intervals.map { |interval| new(interval, distances[interval.id]).call }
    end

    def self.for_user(user)
      distances = BatchedDistanceQuery.call(user)
      ComponentServiceInterval.joins(:component).where(enabled: true, components: { user_id: user.id })
        .map { |interval| new(interval, distances[interval.id]).call }
    end

    SEVERITY = { "ok" => 0, "warning" => 1, "due" => 2 }.freeze

    # One Result per component -- whichever of its enabled intervals is
    # furthest along. A component with no enabled intervals has no entry in
    # the returned hash.
    def self.worst_result_by_component(user)
      for_user(user).each_with_object({}) do |result, hash|
        component_id = result.component_service_interval.component_id
        current = hash[component_id]
        hash[component_id] = result if current.nil? || SEVERITY[result.status] > SEVERITY[current.status]
      end
    end

    # The status-only projection of the above -- for table columns
    # (Components list, Bike detail's Installed components) that show a
    # single summary cell per row rather than the full Result.
    def self.worst_status_by_component(user)
      worst_result_by_component(user).transform_values(&:status)
    end

    def initialize(interval, interval_distance)
      @interval = interval
      @interval_distance = interval_distance
    end

    def call
      distance_interval = interval.effective_distance_interval_meters
      time_interval = interval.effective_time_interval_days
      distance_used = interval_distance&.distance_meters || 0
      baseline_at = interval_distance&.baseline_at || fallback_baseline
      days_used = (Date.current - baseline_at.to_date).to_i

      distance_fraction = fraction(distance_used, distance_interval)
      days_fraction = fraction(days_used, time_interval)
      max_fraction = [ distance_fraction, days_fraction ].compact.max || 0.0
      driving_dimension = distance_fraction == max_fraction ? :distance : :days

      threshold = NotificationSetting.effective_for(
        user: interval.component.user, category: interval.component.category,
      )[:warning_threshold_percent]

      Result.new(
        component_service_interval: interval,
        status: compute_status(max_fraction, threshold),
        distance_remaining_meters: distance_interval.present? ? distance_interval - distance_used : nil,
        days_remaining: time_interval.present? ? time_interval - days_used : nil,
        driving_dimension: driving_dimension,
        distance_used_meters: distance_used,
        days_used: days_used,
        fraction_used: max_fraction,
      )
    end

    private

    attr_reader :interval, :interval_distance

    def fraction(used, total)
      return nil if total.blank? || total <= 0

      used.to_f / total
    end

    def compute_status(max_fraction, threshold_percent)
      return "due" if max_fraction >= 1.0
      return "warning" if (1.0 - max_fraction) <= threshold_percent / 100.0

      "ok"
    end

    # Only exercised if this is constructed directly rather than through
    # .for_component/.for_user (which always have a batched distance for
    # every interval they pass in) -- mirrors BatchedDistanceQuery's own
    # baseline fallback so the two never disagree.
    def fallback_baseline
      last_event = interval.component.maintenance_events.where(service_type_id: interval.service_type_id)
        .order(performed_at: :desc).first
      return last_event.performed_at if last_event

      first_assignment = interval.component.component_assignments.order(:started_at).first
      return first_assignment.started_at if first_assignment

      interval.component.acquired_on
    end
  end
end
