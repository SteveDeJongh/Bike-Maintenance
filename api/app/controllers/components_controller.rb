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
    service_intervals = Maintenance::RequirementStatus.for_component(@component).map { |status| serialize_requirement_status(status) }
    current_bikes = @component.component_assignments.where(ended_at: nil).includes(:bike).map { |a| { id: a.bike.id, name: a.bike.name } }

    render json: @component.as_json(methods: %i[ total_distance ]).merge(
      service_intervals: service_intervals,
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

    # Increment-1 compatibility shim: keeps the OLD JSON shape
    # (service_type_id/distance_interval_meters/time_interval_days/
    # service_type_name) the existing frontend still reads, derived from the
    # new requirement/satisfier schema's single (position 1) satisfier.
    # Increment 3 replaces this with the real requirement/satisfiers payload.
    def serialize_requirement_status(status)
      requirement = status.component_service_requirement
      effective = requirement.effective
      satisfier = effective[:satisfiers].first

      requirement.as_json(only: %i[ id category_service_requirement_id enabled ]).merge(
        service_type_id: satisfier && satisfier[:service_type_id],
        distance_interval_meters: requirement.distance_meters,
        time_interval_days: requirement.calendar_unit == "day" ? requirement.calendar_amount : nil,
        effective_distance_interval_meters: effective[:distance_meters],
        effective_time_interval_days: effective[:calendar_unit] == "day" ? effective[:calendar_amount] : nil,
        service_type_name: satisfier && satisfier[:service_type_name],
        status: status.status,
        distance_remaining_meters: status.distance_remaining_meters,
        days_remaining: status.days_remaining,
        driving_dimension: status.driving_dimension,
      )
    end
end
