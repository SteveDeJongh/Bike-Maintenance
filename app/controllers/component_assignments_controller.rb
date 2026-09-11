class ComponentAssignmentsController < ApplicationController
  before_action :set_component_assignment, only: %i[ show edit update destroy ]

  # GET /component_assignments or /component_assignments.json
  def index
    @component_assignments = ComponentAssignment.includes(:component, :bike).all
  end

  # GET /component_assignments/1 or /component_assignments/1.json
  def show
  end

  # GET /component_assignments/new
  def new
    @component_assignment = ComponentAssignment.new
  end

  # GET /component_assignments/1/edit
  def edit
  end

  # POST /component_assignments or /component_assignments.json
  def create
    @component_assignment = ComponentAssignment.new(component_assignment_params)

    respond_to do |format|
      if @component_assignment.save
        format.html { redirect_to @component_assignment, notice: "Component assignment was successfully created." }
        format.json { render :show, status: :created, location: @component_assignment }
      else
        format.html { render :new, status: :unprocessable_content }
        format.json { render json: @component_assignment.errors, status: :unprocessable_content }
      end
    end
  end

  # PATCH/PUT /component_assignments/1 or /component_assignments/1.json
  def update
    respond_to do |format|
      if @component_assignment.update(component_assignment_params)
        format.html { redirect_to @component_assignment, notice: "Component assignment was successfully updated.", status: :see_other }
        format.json { render :show, status: :ok, location: @component_assignment }
      else
        format.html { render :edit, status: :unprocessable_content }
        format.json { render json: @component_assignment.errors, status: :unprocessable_content }
      end
    end
  end

  # DELETE /component_assignments/1 or /component_assignments/1.json
  def destroy
    @component_assignment.destroy!

    respond_to do |format|
      format.html { redirect_to component_assignments_path, notice: "Component assignment was successfully destroyed.", status: :see_other }
      format.json { head :no_content }
    end
  end

  private
    # Use callbacks to share common setup or constraints between actions.
    def set_component_assignment
      @component_assignment = ComponentAssignment.find(params[:id])
    end

    # Only allow a list of trusted parameters through.
    def component_assignment_params
      params.require(:component_assignment).permit(:component_id, :bike_id, :started_on, :ended_on)
    end
end
