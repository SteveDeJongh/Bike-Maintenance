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
      keyword_init: true,
    ) do
      # Banner eligibility -- an ineligible interval still has a real
      # status (shown on the component/table pages), it just doesn't
      # appear in the app-wide due/warning banners.
      def banner_eligible?(credential:)
        return false if status == "ok"

        component = component_service_interval.component
        return false unless component.component_assignments.exists?(ended_at: nil)
        return false if component.retired_on.present?

        enabled = NotificationSetting.effective_for(user: component.user, category: component.category)[:enabled]
        return false unless enabled

        !dismissed?(credential: credential)
      end

      private

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
    end

    def self.for_component(component)
      distances = BatchedDistanceQuery.call(component.user)
      component.component_service_intervals.where(enabled: true).map { |interval| new(interval, distances[interval.id]).call }
    end

    def self.for_user(user)
      distances = BatchedDistanceQuery.call(user)
      ComponentServiceInterval.joins(:component).where(enabled: true, components: { user_id: user.id })
        .map { |interval| new(interval, distances[interval.id]).call }
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
