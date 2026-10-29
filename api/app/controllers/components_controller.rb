class ComponentsController < ApplicationController
  before_action :set_component, only: %i[ show update destroy ]

  # GET /components
  def index
    @components = current_user.components
    statuses = Maintenance::IntervalStatus.worst_status_by_component(current_user)
    bikes_by_component = current_bikes_by_component(current_user)
    render json: @components.map { |component|
      component.as_json.merge(
        service_status: statuses[component.id],
        current_bikes: bikes_by_component[component.id] || [],
      )
    }
  end

  # GET /components/1
  def show
    service_intervals = Maintenance::IntervalStatus.for_component(@component).map { |status| serialize_interval_status(status) }
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
      params.require(:component).permit(:label, :category, :acquired_on, :retired_on)
    end

    # { component_id => [{id:, name:}, ...] } for every currently-installed
    # (ended_at: nil) bike per component, batched for #index -- a component
    # can have more than one at once (see ComponentAssignment's documented
    # indoor_only-on-two-bikes exception), so this is never assumed to be
    # at most one.
    def current_bikes_by_component(user)
      ComponentAssignment.joins(:bike, :component)
        .where(ended_at: nil, components: { user_id: user.id })
        .pluck("component_assignments.component_id", "bikes.id", "bikes.name")
        .each_with_object(Hash.new { |h, k| h[k] = [] }) { |(cid, bid, bname), h| h[cid] << { id: bid, name: bname } }
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
