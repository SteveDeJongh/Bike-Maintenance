class MaintenanceEventsController < ApplicationController
  before_action :set_maintenance_event, only: %i[ show update destroy ]

  # GET /maintenance_events
  def index
    @maintenance_events = current_user.maintenance_events.includes(:component)
    render json: @maintenance_events
  end

  # GET /maintenance_events/1
  def show
    render json: @maintenance_event
  end

  # POST /maintenance_events
  def create
    event_params = maintenance_event_params
    return render_component_not_found unless owns_referenced_component?(event_params)

    @maintenance_event = MaintenanceEvent.new(event_params)

    if @maintenance_event.save
      render json: @maintenance_event, status: :created
    else
      render json: @maintenance_event.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /maintenance_events/1
  def update
    event_params = maintenance_event_params
    return render_component_not_found unless owns_referenced_component?(event_params)

    if @maintenance_event.update(event_params)
      render json: @maintenance_event
    else
      render json: @maintenance_event.errors, status: :unprocessable_content
    end
  end

  # DELETE /maintenance_events/1
  def destroy
    @maintenance_event.destroy!
    head :no_content
  end

  private
    def set_maintenance_event
      @maintenance_event = current_user.maintenance_events.find(params[:id])
    end

    def maintenance_event_params
      params.require(:maintenance_event).permit(:component_id, :event_type, :performed_at, :notes)
    end

    def owns_referenced_component?(attrs)
      !attrs.key?(:component_id) || current_user.components.exists?(attrs[:component_id])
    end

    def render_component_not_found
      render json: { base: ["Component not found"] }, status: :not_found
    end
end
