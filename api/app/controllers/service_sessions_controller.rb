class ServiceSessionsController < ApplicationController
  before_action :set_bike, only: %i[ create ]
  before_action :set_service_session, only: %i[ show update destroy ]

  # POST /bikes/1/service_sessions
  # { performed_at, notes?, events: [{ component_id, service_type_id, notes? }, ...] }
  # -- flat payload, same convention as #component_setup's own
  # { installed_on, components: [...] }. All-or-nothing: any row's error
  # rolls back the whole request. Eligibility is resolved once, against
  # Bikes::ServiceableComponents at the session's own performed_at -- the
  # same service the serviceable_components endpoint uses, so the picker and
  # this validation can never disagree.
  def create
    @service_session = @bike.service_sessions.new(service_session_params.merge(user: current_user))
    events_params = Array(params[:events])

    if events_params.blank?
      @service_session.errors.add(:base, "At least one service is required")
      return render json: @service_session.errors, status: :unprocessable_content
    end

    row_errors = {}

    ActiveRecord::Base.transaction do
      next unless @service_session.save

      eligible_ids = eligible_component_ids(@bike, @service_session.performed_at)
      seen_pairs = Set.new

      events_params.each_with_index do |event_params, index|
        component_id = event_params[:component_id].to_i
        service_type_id = event_params[:service_type_id].to_i
        pair = [ component_id, service_type_id ]

        errors = {}
        errors[:component_id] = [ "is not eligible for this bike at that time" ] unless eligible_ids.include?(component_id)
        errors[:service_type_id] = [ "not found" ] unless current_user.service_types.exists?(id: service_type_id)
        errors[:base] = [ "Duplicate service for this component in this session" ] if seen_pairs.include?(pair)
        seen_pairs << pair

        if errors.any?
          row_errors[index] = errors
          next
        end

        event = @service_session.maintenance_events.new(
          component_id: component_id, service_type_id: service_type_id,
          performed_at: @service_session.performed_at, notes: event_params[:notes],
        )
        row_errors[index] = event.errors unless event.save
      end

      raise ActiveRecord::Rollback if row_errors.any?
    end

    if @service_session.errors.any?
      render json: @service_session.errors, status: :unprocessable_content
    elsif row_errors.any?
      render json: { row_errors: row_errors }, status: :unprocessable_content
    else
      render json: service_session_json(@service_session.reload), status: :created
    end
  end

  # GET /service_sessions/1
  def show
    render json: service_session_json(@service_session)
  end

  # PATCH/PUT /service_sessions/1
  # Only performed_at/notes. Changing performed_at re-checks every event's
  # component against Bikes::ServiceableComponents at the *new* time first --
  # if any no longer qualifies, nothing is saved.
  def update
    new_performed_at = service_session_params[:performed_at]

    if new_performed_at.present?
      eligible_ids = eligible_component_ids(@service_session.bike, new_performed_at)
      ineligible = @service_session.maintenance_events.includes(:component)
        .reject { |event| eligible_ids.include?(event.component_id) }

      if ineligible.any?
        labels = ineligible.map { |event| event.component.label }.join(", ")
        @service_session.errors.add(:base, "#{labels} would no longer be eligible at that time")
        return render json: @service_session.errors, status: :unprocessable_content
      end
    end

    if @service_session.update(service_session_params)
      render json: service_session_json(@service_session)
    else
      render json: @service_session.errors, status: :unprocessable_content
    end
  end

  # DELETE /service_sessions/1
  def destroy
    @service_session.destroy!
    head :no_content
  end

  private
    def set_bike
      @bike = current_user.bikes.find(params[:bike_id])
    end

    def set_service_session
      @service_session = current_user.service_sessions.find(params[:id])
    end

    def service_session_params
      params.permit(:performed_at, :notes)
    end

    def eligible_component_ids(bike, at)
      result = Bikes::ServiceableComponents.call(bike, at: at)
      (result.mounted + result.off_bike).map(&:id).to_set
    end

    def service_session_json(session)
      session.as_json(only: %i[ id bike_id performed_at notes created_at updated_at ]).merge(
        events: session.maintenance_events.map { |event|
          event.as_json(only: %i[ id component_id service_type_id performed_at notes ])
        },
      )
    end
end
