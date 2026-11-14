class ComponentsController < ApplicationController
  before_action :set_component, only: %i[ show update destroy ]

  # GET /components
  def index
    @components = current_user.components
    statuses = Maintenance::RequirementStatus.worst_status_by_component(current_user)
    bikes_by_component = Component.current_bikes_by_component(current_user)
    render json: @components.map { |component|
      component.as_json.merge(
        service_status: statuses[component.id],
        current_bikes: bikes_by_component[component.id] || [],
      )
    }
  end

  # GET /components/1
  def show
    service_requirements = Maintenance::RequirementStatus.for_component(@component).map { |status| serialize_requirement_status(status) }
    current_bikes = @component.component_assignments.where(ended_at: nil).includes(:bike).map { |a| { id: a.bike.id, name: a.bike.name } }

    render json: @component.as_json(methods: %i[ total_distance ]).merge(
      service_requirements: service_requirements,
      current_bikes: current_bikes,
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

  # DELETE /components/1
  def destroy
    @component.destroy!
    head :no_content
  end

  private
    def set_component
      @component = current_user.components.find(params[:id])
    end

    def component_params
      params.require(:component).permit(:label, :category, :acquired_on, :retired_on, :brand, :model, :notes)
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
