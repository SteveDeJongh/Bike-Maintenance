class MaintenanceEventsController < ApplicationController
  before_action :set_maintenance_event, only: %i[ show update destroy ]

  # GET /maintenance_events -- the Maintenance page's log (Maintenance::EventLog):
  # filtered, grouped and paged services with their sessions and meta.
  def index
    result = Maintenance::EventLog.call(
      current_user,
      kinds: Array(params[:kinds]),
      bike_id: params[:bike_id],
      category: params[:category],
      service_type_id: params[:service_type_id],
      from: params[:from],
      to: params[:to],
      tz: params[:tz],
      q: params[:q],
      group: params[:group],
      sort: params[:sort],
      order: params[:order],
      cursor: params[:cursor],
      page: params[:page],
      per_page: params[:per_page],
    )

    render json: { events: result.events, sessions: result.sessions, meta: result.meta, next_cursor: result.next_cursor }
  rescue Maintenance::EventLog::InvalidParamError => e
    render json: { base: [ e.message ] }, status: :unprocessable_content
  end

  # GET /maintenance_events/1
  def show
    render json: @maintenance_event
  end

  # POST /maintenance_events
  def create
    event_params = maintenance_event_params
    return render_component_not_found unless owns_referenced_component?(event_params)
    return render_service_type_not_found unless owns_referenced_service_type?(event_params)

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
    return render_service_type_not_found unless owns_referenced_service_type?(event_params)

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
      params.require(:maintenance_event).permit(:component_id, :service_type_id, :performed_at, :notes)
    end

    def owns_referenced_component?(attrs)
      !attrs.key?(:component_id) || current_user.components.exists?(attrs[:component_id])
    end

    def owns_referenced_service_type?(attrs)
      !attrs.key?(:service_type_id) || current_user.service_types.exists?(attrs[:service_type_id])
    end

    def render_component_not_found
      render json: { base: ["Component not found"] }, status: :not_found
    end

    def render_service_type_not_found
      render json: { base: ["Service type not found"] }, status: :not_found
    end
end
