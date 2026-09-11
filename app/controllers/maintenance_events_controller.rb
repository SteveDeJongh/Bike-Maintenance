class MaintenanceEventsController < ApplicationController
  before_action :set_maintenance_event, only: %i[ show edit update destroy ]

  # GET /maintenance_events or /maintenance_events.json
  def index
    @maintenance_events = MaintenanceEvent.includes(:component).all
  end

  # GET /maintenance_events/1 or /maintenance_events/1.json
  def show
  end

  # GET /maintenance_events/new
  def new
    @maintenance_event = MaintenanceEvent.new
  end

  # GET /maintenance_events/1/edit
  def edit
  end

  # POST /maintenance_events or /maintenance_events.json
  def create
    @maintenance_event = MaintenanceEvent.new(maintenance_event_params)

    respond_to do |format|
      if @maintenance_event.save
        format.html { redirect_to @maintenance_event, notice: "Maintenance event was successfully created." }
        format.json { render :show, status: :created, location: @maintenance_event }
      else
        format.html { render :new, status: :unprocessable_content }
        format.json { render json: @maintenance_event.errors, status: :unprocessable_content }
      end
    end
  end

  # PATCH/PUT /maintenance_events/1 or /maintenance_events/1.json
  def update
    respond_to do |format|
      if @maintenance_event.update(maintenance_event_params)
        format.html { redirect_to @maintenance_event, notice: "Maintenance event was successfully updated.", status: :see_other }
        format.json { render :show, status: :ok, location: @maintenance_event }
      else
        format.html { render :edit, status: :unprocessable_content }
        format.json { render json: @maintenance_event.errors, status: :unprocessable_content }
      end
    end
  end

  # DELETE /maintenance_events/1 or /maintenance_events/1.json
  def destroy
    @maintenance_event.destroy!

    respond_to do |format|
      format.html { redirect_to maintenance_events_path, notice: "Maintenance event was successfully destroyed.", status: :see_other }
      format.json { head :no_content }
    end
  end

  private
    # Use callbacks to share common setup or constraints between actions.
    def set_maintenance_event
      @maintenance_event = MaintenanceEvent.find(params[:id])
    end

    # Only allow a list of trusted parameters through.
    def maintenance_event_params
      params.require(:maintenance_event).permit(:component_id, :event_type, :performed_on, :notes)
    end
end
