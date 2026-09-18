class ComponentAssignmentsController < ApplicationController
  before_action :set_component_assignment, only: %i[ show update destroy ]

  # GET /component_assignments
  def index
    @component_assignments = ComponentAssignment.includes(:component, :bike).all
    render json: @component_assignments
  end

  # GET /component_assignments/1
  def show
    render json: @component_assignment
  end

  # POST /component_assignments
  def create
    @component_assignment = ComponentAssignment.new(component_assignment_params)

    if @component_assignment.save
      render json: @component_assignment, status: :created
    else
      render json: @component_assignment.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /component_assignments/1
  def update
    if @component_assignment.update(component_assignment_params)
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
      @component_assignment = ComponentAssignment.find(params[:id])
    end

    def component_assignment_params
      params.require(:component_assignment).permit(:component_id, :bike_id, :started_on, :ended_on)
    end
end
