class ComponentAssignmentsController < ApplicationController
  before_action :set_component_assignment, only: %i[ show update destroy ]

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
  def create
    assignment_params = component_assignment_params
    return render_bike_or_component_not_found unless owns_referenced_records?(assignment_params)

    @component_assignment = ComponentAssignment.new(assignment_params)

    if @component_assignment.save
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

  private
    def set_component_assignment
      @component_assignment = current_user.component_assignments.find(params[:id])
    end

    def component_assignment_params
      params.require(:component_assignment).permit(:component_id, :bike_id, :started_at, :ended_at)
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
