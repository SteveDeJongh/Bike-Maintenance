class ComponentsController < ApplicationController
  before_action :set_component, only: %i[ show update destroy ]

  # GET /components
  def index
    @components = current_user.components
    render json: @components
  end

  # GET /components/1
  def show
    service_intervals = Maintenance::IntervalStatus.for_component(@component).map { |status| serialize_interval_status(status) }

    render json: @component.as_json(methods: %i[ total_distance ]).merge(service_intervals: service_intervals)
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
      params.require(:component).permit(:label, :category, :acquired_on, :retired_on)
    end

    def serialize_interval_status(status)
      interval = status.component_service_interval
      interval.as_json(only: %i[ id category_service_interval_id service_type_id distance_interval_meters
                                  time_interval_days enabled ]).merge(
        effective_distance_interval_meters: interval.effective_distance_interval_meters,
        effective_time_interval_days: interval.effective_time_interval_days,
        service_type_name: interval.service_type.name,
        status: status.status,
        distance_remaining_meters: status.distance_remaining_meters,
        days_remaining: status.days_remaining,
        driving_dimension: status.driving_dimension,
      )
    end
end
