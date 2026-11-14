class CategoryServiceRequirementsController < ApplicationController
  include RequirementSerialization

  before_action :set_category_service_requirement, only: %i[ show update destroy apply ]

  # GET /category_service_requirements
  def index
    render json: current_user.category_service_requirements.map { |requirement| serialize_requirement(requirement) }
  end

  # GET /category_service_requirements/1
  def show
    render json: serialize_requirement(@category_service_requirement)
  end

  # POST /category_service_requirements
  # Satisfiers are created inline with the requirement, in one transaction --
  # the only way "at least one satisfier" is enforceable without a window
  # where a zero-satisfier requirement exists.
  def create
    requirement = current_user.category_service_requirements.new(requirement_params)
    satisfiers = Array(params[:satisfiers])
    errors = nil

    ActiveRecord::Base.transaction do
      unless requirement.save
        errors = requirement.errors
        raise ActiveRecord::Rollback
      end

      if satisfiers.empty?
        errors = requirement.errors.tap { |e| e.add(:base, "Must have at least one satisfier") }
        raise ActiveRecord::Rollback
      end

      satisfiers.each_with_index do |attrs, index|
        satisfier = requirement.satisfiers.new(satisfier_attrs(attrs).merge(position: index + 1))
        unless satisfier.save
          errors = satisfier.errors
          raise ActiveRecord::Rollback
        end
      end
    end

    if errors
      render json: errors, status: :unprocessable_content
    else
      render json: serialize_requirement(requirement.reload), status: :created
    end
  end

  # PATCH/PUT /category_service_requirements/1
  # Columns only -- satisfiers are managed through the nested
  # service_requirement_satisfiers endpoints, never through this update.
  def update
    if @category_service_requirement.update(requirement_params)
      render json: serialize_requirement(@category_service_requirement)
    else
      render json: @category_service_requirement.errors, status: :unprocessable_content
    end
  end

  # DELETE /category_service_requirements/1
  # Cascades to delete every linked ComponentServiceRequirement (dependent:
  # :destroy) and this template's own satisfiers (dependent: :delete_all)
  # -- custom component requirements are untouched.
  def destroy
    @category_service_requirement.destroy!
    head :no_content
  end

  # POST /category_service_requirements/1/apply
  # Creates an enabled, linked ComponentServiceRequirement (inheriting the
  # template's satisfiers/thresholds live) for each given component that
  # doesn't already have a linked row for this template -- adding a
  # template never silently attaches to existing components.
  def apply
    component_ids = Array(params[:component_ids]).map(&:to_i)
    components = current_user.components.where(id: component_ids, category: @category_service_requirement.category)

    components.find_each do |component|
      next if component.component_service_requirements.exists?(category_service_requirement_id: @category_service_requirement.id)

      component.component_service_requirements.create!(category_service_requirement: @category_service_requirement)
    end

    head :no_content
  end

  private
    def set_category_service_requirement
      @category_service_requirement = current_user.category_service_requirements.find(params[:id])
    end

    def requirement_params
      params.require(:category_service_requirement).permit(
        :category, :name, :distance_meters, :moving_time_seconds, :calendar_amount, :calendar_unit, :ride_filter,
      )
    end

    def satisfier_attrs(attrs)
      attrs.permit(
        :service_type_id, :allowance_distance_meters, :allowance_moving_time_seconds,
        :allowance_calendar_amount, :allowance_calendar_unit,
      )
    end
end
