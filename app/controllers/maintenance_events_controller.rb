class MaintenanceEventsController < ApplicationController
  before_action :set_maintenance_event, only: %i[ show update destroy ]

  # GET /maintenance_events
  def index
    @maintenance_events = MaintenanceEvent.includes(:component).all
    render json: @maintenance_events
  end

  # GET /maintenance_events/1
  def show
    render json: @maintenance_event
  end

  # POST /maintenance_events
  def create
    @maintenance_event = MaintenanceEvent.new(maintenance_event_params)

    if @maintenance_event.save
      render json: @maintenance_event, status: :created
    else
      render json: @maintenance_event.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /maintenance_events/1
  def update
    if @maintenance_event.update(maintenance_event_params)
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
      @maintenance_event = MaintenanceEvent.find(params[:id])
    end

    def maintenance_event_params
      params.require(:maintenance_event).permit(:component_id, :event_type, :performed_on, :notes)
    end
end
