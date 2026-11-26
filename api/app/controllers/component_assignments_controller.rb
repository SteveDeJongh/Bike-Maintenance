class ComponentAssignmentsController < ApplicationController
  before_action :set_component_assignment, only: %i[ show update destroy swap ]

  # GET /component_assignments
  def index
    @component_assignments = current_user.component_assignments.includes(:component, :bike)
    render json: @component_assignments
  end

  # GET /component_assignments/1
  def show
    render json: @component_assignment
  end

  # POST /component_assignments
  # An optional ended_at makes a closed, back-filled stint; it never ends
  # or moves any other assignment (the overlap validations reject
  # conflicts). `track_slot: true` also starts tracking the component's
  # category on the bike (its "both" slot) in the same transaction -- the
  # Install on bike modal's "Track <Category> on <bike>" -- so a failed
  # install never leaves a stray slot.
  def create
    assignment_params = component_assignment_params
    return render_bike_or_component_not_found unless owns_referenced_records?(assignment_params)

    @component_assignment = ComponentAssignment.new(assignment_params)
    slot = nil

    ActiveRecord::Base.transaction do
      if ActiveModel::Type::Boolean.new.cast(params[:track_slot]) && @component_assignment.bike && @component_assignment.component
        slot = @component_assignment.bike.bike_component_slots
          .find_or_initialize_by(category: @component_assignment.component.category, ride_context: "both")
        unless slot.save
          slot.errors.each { |error| @component_assignment.errors.add(:base, "Couldn't track this category: #{error.full_message}") }
          raise ActiveRecord::Rollback
        end
      end
      raise ActiveRecord::Rollback unless @component_assignment.save
    end

    if @component_assignment.persisted?
      render json: @component_assignment, status: :created
    else
      render json: @component_assignment.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /component_assignments/1
  def update
    assignment_params = component_assignment_params
    return render_bike_or_component_not_found unless owns_referenced_records?(assignment_params)

    if @component_assignment.update(assignment_params)
      render json: @component_assignment
    else
      render json: @component_assignment.errors, status: :unprocessable_content
    end
  end

  # DELETE /component_assignments/1
  def destroy
    @component_assignment.destroy!
    head :no_content
  end

  # POST /component_assignments/1/swap
  def swap
    component = current_user.components.find_by(id: params[:component_id])
    return render_bike_or_component_not_found unless component

    swapped_at = params[:swapped_at].present? ? Time.zone.parse(params[:swapped_at].to_s) : Time.current

    result = ComponentAssignments::Swap.call(assignment: @component_assignment, component: component, swapped_at: swapped_at)

    if result.success?
      render json: { assignment: result.new_assignment, ended_assignment: result.ended_assignment }, status: :created
    else
      render json: result.errors, status: :unprocessable_content
    end
  end

  private
    def set_component_assignment
      @component_assignment = current_user.component_assignments.find(params[:id])
    end

    def component_assignment_params
      params.require(:component_assignment).permit(:component_id, :bike_id, :started_at, :ended_at, :ride_context)
    end

    # Only checks ownership for keys actually present — update often omits
    # bike_id/component_id entirely (e.g. just changing ended_at).
    def owns_referenced_records?(attrs)
      bike_ok = !attrs.key?(:bike_id) || current_user.bikes.exists?(attrs[:bike_id])
      component_ok = !attrs.key?(:component_id) || current_user.components.exists?(attrs[:component_id])
      bike_ok && component_ok
    end

    def render_bike_or_component_not_found
      render json: { base: ["Bike or component not found"] }, status: :not_found
    end
end
