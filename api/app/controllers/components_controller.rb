class ComponentsController < ApplicationController
  before_action :set_component, only: %i[ show update destroy retire ]

  # GET /components -- every component, with its batched wear (the worst
  # enabled requirement's WearFields), lifetime distance, current/last bike,
  # and the raw inputs for the list's "ready" spare reading (rotates,
  # latest_service). No per-component queries: each piece is one grouped
  # query across the user's components.
  def index
    @components = current_user.components.to_a
    ids = @components.map(&:id)
    worst = Maintenance::RequirementStatus.worst_result_by_component(current_user)
    bikes_by_component = Component.current_bikes_by_component(current_user)
    last_ended = ComponentAssignment.last_ended_by_component(current_user)
    lifetime = Maintenance::LifetimeDistanceQuery.call(current_user, component_ids: ids)
    latest_service = Maintenance::LatestServiceQuery.call(current_user, component_ids: ids)
    rotating = current_user.component_category_settings.where(rotates: true).pluck(:category).to_set

    render json: @components.map { |component|
      current_bikes = bikes_by_component[component.id] || []
      result = worst[component.id]
      component.as_json
        .merge(Maintenance::WearFields.call(result))
        .merge(
          has_enabled_requirement: !result.nil?,
          # The driving requirement's name, for a status chip ("Wax due").
          worst_requirement_name: result&.component_service_requirement&.effective_name,
          lifetime_distance_meters: lifetime[component.id] || 0,
          current_bikes: current_bikes.map { |bike| bike.except(:started_at) },
          # Retired, or left on retired bikes only (Component.effectively_retired).
          effectively_retired: Component.effectively_retired_from?(component.retired_on, current_bikes),
          effective_retired_on: Component.effective_retired_on_from(component.retired_on, current_bikes),
          # The earliest open assignment's start -- a shared indoor cassette
          # has one per bike.
          assigned_since: current_bikes.map { |bike| bike[:started_at] }.min,
          last_bike: current_bikes.empty? ? last_bike_json(last_ended[component.id]) : nil,
          rotates: rotating.include?(component.category),
          latest_service: latest_service[component.id],
        )
    }
  end

  # GET /components/1
  def show
    service_requirements = Maintenance::RequirementStatus.for_component(@component).map { |status| serialize_requirement_status(status) }
    current_bikes = @component.component_assignments.where(ended_at: nil).includes(:bike)
      .map { |a| { id: a.bike.id, name: a.bike.name, assignment_id: a.id, ride_context: a.ride_context, retired_on: a.bike.retired_on } }

    last_bike = if current_bikes.empty?
      last_bike_json(ComponentAssignment.last_ended_by_component(current_user, component_ids: [ @component.id ])[@component.id])
    end

    history = Components::LifeHistory.call(@component)

    render json: @component.as_json.merge(
      service_requirements: service_requirements,
      current_bikes: current_bikes,
      effectively_retired: Component.effectively_retired_from?(@component.retired_on, current_bikes),
      effective_retired_on: Component.effective_retired_on_from(@component.retired_on, current_bikes),
      last_bike: last_bike,
      assignments: history.assignments,
      lifetime_stats: history.lifetime_stats,
      maintenance_events: history.maintenance_events,
      maintenance_events_count: history.maintenance_events.size,
      deletable: history.assignments.empty? && history.maintenance_events.empty?,
    )
  end

  # POST /components
  def create
    @component = current_user.components.new(component_params)

    if @component.save
      render json: @component, status: :created
    else
      render json: @component.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /components/1
  def update
    if @component.update(component_params)
      render json: @component
    else
      render json: @component.errors, status: :unprocessable_content
    end
  end

  # DELETE /components/1 -- only a component with no history: no
  # assignment and no maintenance event. Anything that has been on a bike
  # or serviced is retired instead, so mileage and history are never lost.
  def destroy
    unless @component.deletable?
      return render json: { base: [ Component::UNDELETABLE_MESSAGE ] }, status: :unprocessable_content
    end

    @component.destroy!
    head :no_content
  end

  # POST /components/1/retire -- { at, replacement_component_id?, tz }.
  # Ends the component's active assignment(s) at `at` (swapping the
  # replacement in when given) and sets retired_on to at's local date in
  # tz -- see Components::Retire.
  def retire
    replacement = nil
    if params[:replacement_component_id].present?
      replacement = current_user.components.find_by(id: params[:replacement_component_id])
      return render json: { base: ["Bike or component not found"] }, status: :not_found unless replacement
    end

    at = params[:at].present? ? Time.zone.parse(params[:at].to_s) : Time.current
    zone = (params[:tz].present? && ActiveSupport::TimeZone[params[:tz]]) || Time.zone

    result = Components::Retire.call(component: @component, at: at, zone: zone, replacement: replacement)

    if result.success?
      render json: {
        component: result.component,
        ended_assignments: result.ended_assignments,
        new_assignment: result.new_assignment,
      }
    else
      render json: result.errors, status: :unprocessable_content
    end
  end

  private
    def set_component
      @component = current_user.components.find(params[:id])
    end

    def component_params
      params.require(:component).permit(:label, :category, :acquired_on, :retired_on, :brand, :model, :notes)
    end

    # {id, name, removed_at} | nil -- the bike of the component's most
    # recently ended assignment. Callers only pass an entry when the
    # component has no active assignment, so a mounted component reads nil.
    def last_bike_json(entry)
      return nil unless entry

      { id: entry[:bike_id], name: entry[:bike_name], removed_at: entry[:ended_at] }
    end

    # The real requirement/satisfiers payload (increment 3) -- effective_*
    # values already resolve template inheritance/overrides, and
    # satisfiers are already fully resolved (service_type id+name+position+
    # per-dimension allowance) via ComponentServiceRequirement#effective, so
    # this method only has to read, never re-derive.
    def serialize_requirement_status(status)
      requirement = status.component_service_requirement
      effective = requirement.effective

      requirement.as_json(only: %i[ id category_service_requirement_id enabled ]).merge(
        requirement_name: effective[:name],
        distance_meters: effective[:distance_meters],
        moving_time_seconds: effective[:moving_time_seconds],
        calendar_amount: effective[:calendar_amount],
        calendar_unit: effective[:calendar_unit],
        ride_filter: effective[:ride_filter],
        satisfiers: effective[:satisfiers],
        status: status.status,
        driving_dimension: status.driving_dimension,
        distance_used_meters: status.distance_used_meters,
        distance_remaining_meters: status.distance_remaining_meters,
        moving_time_used_seconds: status.moving_time_used_seconds,
        moving_time_remaining_seconds: status.moving_time_remaining_seconds,
        days_used: status.days_used,
        days_remaining: status.days_remaining,
        setting_event: setting_event_json(status),
        setting_position: status.setting_position,
      )
    end

    # {id:, service_type_name:, performed_at:} | nil -- nil in the
    # synthetic-fallback case (no real satisfying service logged yet). Same
    # shape as MaintenanceAlertsController/Dashboard::Summary's own helpers
    # of the same name -- duplicated rather than shared, three lines each.
    def setting_event_json(status)
      event = status.setting_event
      return nil unless event

      { id: event.id, service_type_name: event.service_type.name, performed_at: event.performed_at }
    end
end
