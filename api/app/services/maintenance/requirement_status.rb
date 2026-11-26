module Maintenance
  # Computes a ComponentServiceRequirement's current status, independently
  # per active dimension (distance / moving time / calendar), then takes
  # the worst status and the furthest-along ("driving") dimension across
  # them.
  #
  # Per dimension, the candidates are every MaintenanceEvent whose service
  # type is one of the requirement's effective satisfiers, plus one
  # synthetic fallback point (position 0, allowance = the dimension's own
  # effective threshold, dated at the component's baseline -- its first
  # assignment, else acquired_on) -- this is what makes "no satisfying
  # event yet" fall out of the same formula with no special case: due =
  # 0 + threshold, setting_position = 0, i.e. a plain fraction.
  #
  # The due point is the MAX, over every candidate, of (that candidate's
  # own position + its own resolved allowance for this dimension) --
  # because it's a max, an earlier/shorter service can never pull the due
  # point earlier (a drip wax logged shortly after a hot wax doesn't move
  # the chain's next-due date backwards). The "setting event" is whichever
  # candidate produced that max, ties preferring the later one.
  class RequirementStatus
    Result = Struct.new(
      :component_service_requirement, :status, :distance_remaining_meters, :days_remaining, :driving_dimension,
      :distance_used_meters, :days_used, :fraction_used,
      :moving_time_used_seconds, :moving_time_remaining_seconds, :setting_event, :setting_position,
      keyword_init: true,
    ) do
      # The individual sub-checks banner_eligible? composes -- each public
      # and reusable on its own (the dashboard needs mounted?/
      # notifications_enabled?/dismissed? as separate flags, not just the
      # single combined boolean banner_eligible? gives the alert banners).
      def mounted?
        component_service_requirement.component.component_assignments.exists?(ended_at: nil)
      end

      # Out of the inventory: retired, or left on retired bikes only
      # (Component#effectively_retired?) -- alerts and Up next skip it.
      def retired?
        component_service_requirement.component.effectively_retired?
      end

      def notifications_enabled?
        component = component_service_requirement.component
        NotificationSetting.effective_for(user: component.user, category: component.category)[:enabled]
      end

      # A dismissal only suppresses its own status -- if the status has
      # since escalated (warning dismissed, now due), it shows immediately.
      # It also only suppresses until the next completed sync after it was
      # dismissed.
      def dismissed?(credential:)
        dismissal = component_service_requirement.service_alert_dismissals.order(dismissed_at: :desc).first
        return false if dismissal.nil?
        return false unless dismissal.dismissed_status == status

        credential.nil? || credential.last_synced_at.nil? || dismissal.dismissed_at > credential.last_synced_at
      end

      # Banner eligibility -- an ineligible requirement still has a real
      # status (shown on the component/table pages), it just doesn't
      # appear in the banners.
      def banner_eligible?(credential:)
        return false if status == "ok"
        return false unless mounted?
        return false if retired?
        return false unless notifications_enabled?

        !dismissed?(credential: credential)
      end
    end

    # Fixed priority when two dimensions tie exactly on fraction_used --
    # arbitrary but documented, applied by scanning in this order and
    # taking the first match.
    DIMENSION_PRIORITY = %i[ distance moving_time days ].freeze

    REQUIREMENT_INCLUDES = [ { component: { component_assignments: :bike } }, { category_service_requirement: { satisfiers: :service_type } }, { satisfiers: :service_type } ].freeze

    # Every one of the component's requirements, enabled or not -- a
    # disabled requirement is still shown (with its own computed status) so
    # its Switch can be flipped back on "in place". Eligibility/banner/table
    # columns go through .for_user below instead, which does filter to
    # enabled.
    def self.for_component(component)
      bundles = BatchedPositionQuery.call(component.user)
      component.component_service_requirements.includes(*REQUIREMENT_INCLUDES)
        .map { |requirement| new(requirement, bundles[requirement.id]).call }
    end

    def self.for_user(user)
      bundles = BatchedPositionQuery.call(user)
      ComponentServiceRequirement.joins(:component).where(enabled: true, components: { user_id: user.id })
        .includes(*REQUIREMENT_INCLUDES)
        .map { |requirement| new(requirement, bundles[requirement.id]).call }
    end

    # The one place that resolves "banner-eligible, optionally scoped to one
    # bike or one component" -- MaintenanceAlertsController#index and
    # ServiceAlertDismissalsController#dismiss_all both call this, so a
    # scoped "dismiss all" can never dismiss anything the matching banner
    # didn't actually show. Scoping is applied after eligibility, same order
    # the request specified. bike_id/component_id are safe against another
    # user's id without any extra check: for_user(user) already limits the
    # candidate statuses to this user's own components, so a foreign id
    # simply never matches any of them.
    def self.banner_eligible_for_user(user, bike_id: nil, component_id: nil)
      credential = user.strava_credential
      statuses = for_user(user).select { |status| status.banner_eligible?(credential: credential) }

      if bike_id.present?
        statuses = statuses.select do |status|
          status.component_service_requirement.component.component_assignments.exists?(bike_id: bike_id, ended_at: nil)
        end
      end

      if component_id.present?
        statuses = statuses.select { |status| status.component_service_requirement.component_id == component_id.to_i }
      end

      statuses
    end

    SEVERITY = { "ok" => 0, "warning" => 1, "due" => 2 }.freeze

    # One Result per component -- whichever of its enabled requirements is
    # furthest along: worst status first, then highest fraction_used among
    # requirements sharing that status (the "driving" requirement, e.g. for
    # a wear bar). A component with no enabled requirement has no entry in
    # the returned hash. Pass `results:` (a for_user list already loaded)
    # to avoid computing every status a second time.
    def self.worst_result_by_component(user, results: nil)
      (results || for_user(user)).each_with_object({}) do |result, hash|
        component_id = result.component_service_requirement.component_id
        current = hash[component_id]
        hash[component_id] = result if current.nil? || worse?(result, current)
      end
    end

    def self.worse?(result, other)
      ([ SEVERITY[result.status], result.fraction_used ] <=> [ SEVERITY[other.status], other.fraction_used ]) == 1
    end
    private_class_method :worse?

    # The status-only projection of the above -- for table columns
    # (Components list, Bike detail's Installed components) that show a
    # single summary cell per row rather than the full Result.
    def self.worst_status_by_component(user)
      worst_result_by_component(user).transform_values(&:status)
    end

    def initialize(requirement, bundle)
      @requirement = requirement
      @bundle = bundle || BatchedPositionQuery::Bundle.new(baseline_at: requirement.component.acquired_on, events: [], positions: {})
    end

    def call
      effective = requirement.effective
      allowances_by_type = effective[:satisfiers].index_by { |s| s[:service_type_id] }

      dims = {
        distance: numeric_dimension(:distance, effective, allowances_by_type),
        moving_time: numeric_dimension(:moving_time, effective, allowances_by_type),
        days: calendar_dimension(effective, allowances_by_type),
      }.compact

      max_fraction = dims.values.map { |d| d[:fraction] }.max || 0.0
      driving_dimension = DIMENSION_PRIORITY.find { |dim| dims[dim] && dims[dim][:fraction] == max_fraction }
      driving = dims[driving_dimension]

      threshold_percent = NotificationSetting.effective_for(
        user: requirement.component.user, category: requirement.component.category,
      )[:warning_threshold_percent]
      overall_status = dims.values.map { |d| compute_status(d[:fraction], threshold_percent) }
        .max_by { |s| SEVERITY[s] } || "ok"

      Result.new(
        component_service_requirement: requirement,
        status: overall_status,
        distance_remaining_meters: dims[:distance]&.fetch(:remaining),
        days_remaining: dims[:days]&.fetch(:remaining),
        driving_dimension: driving_dimension,
        distance_used_meters: dims[:distance]&.fetch(:used),
        days_used: dims[:days]&.fetch(:used),
        fraction_used: max_fraction,
        moving_time_used_seconds: dims[:moving_time]&.fetch(:used),
        moving_time_remaining_seconds: dims[:moving_time]&.fetch(:remaining),
        setting_event: driving&.fetch(:setting_event),
        setting_position: driving&.fetch(:setting_position),
      )
    end

    private

    attr_reader :requirement, :bundle

    def numeric_dimension(dimension, effective, allowances_by_type)
      threshold = dimension == :distance ? effective[:distance_meters] : effective[:moving_time_seconds]
      return nil unless threshold.present?

      allowance_key = dimension == :distance ? :allowance_distance_meters : :allowance_moving_time_seconds
      position_key = dimension == :distance ? :distance : :moving_time

      candidates = [ { position: 0, due: threshold, event: nil } ]
      bundle.events.each do |event|
        position_entry = bundle.positions[event.id]
        next unless position_entry # excluded by the batched query's bounding -- provably dominated

        allowance = allowances_by_type.fetch(event.service_type_id)[allowance_key]
        position = position_entry[position_key]
        candidates << { position: position, due: position + allowance, event: event }
      end

      winner = candidates.reduce { |best, candidate| candidate[:due] >= best[:due] ? candidate : best }
      now_position = bundle.positions.dig(:now, position_key) || 0

      due_point = winner[:due]
      setting_position = winner[:position]
      denominator = due_point - setting_position

      {
        fraction: denominator > 0 ? (now_position - setting_position).to_f / denominator : 1.0,
        used: now_position - setting_position,
        remaining: due_point - now_position,
        setting_event: winner[:event],
        setting_position: setting_position,
      }
    end

    def calendar_dimension(effective, allowances_by_type)
      amount = effective[:calendar_amount]
      unit = effective[:calendar_unit]
      return nil unless amount.present? && unit.present?

      baseline_date = bundle.baseline_at.to_date
      candidates = [ { date: baseline_date, due: baseline_date.advance(unit.pluralize.to_sym => amount), event: nil } ]

      bundle.events.each do |event|
        allowances = allowances_by_type.fetch(event.service_type_id)
        a_amount = allowances[:allowance_calendar_amount]
        a_unit = allowances[:allowance_calendar_unit]
        next unless a_amount.present? && a_unit.present?

        date = event.performed_at.to_date
        candidates << { date: date, due: date.advance(a_unit.pluralize.to_sym => a_amount), event: event }
      end

      winner = candidates.reduce { |best, candidate| candidate[:due] >= best[:due] ? candidate : best }

      today = Date.current
      setting_date = winner[:date]
      due_date = winner[:due]
      days_total = (due_date - setting_date).to_i

      {
        fraction: days_total > 0 ? (today - setting_date).to_i.to_f / days_total : 1.0,
        used: (today - setting_date).to_i,
        remaining: (due_date - today).to_i,
        setting_event: winner[:event],
        setting_position: setting_date,
      }
    end

    def compute_status(fraction, threshold_percent)
      return "due" if fraction >= 1.0
      return "warning" if (1.0 - fraction) <= threshold_percent / 100.0

      "ok"
    end
  end
end
