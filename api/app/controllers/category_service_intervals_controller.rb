# Increment-1 compatibility shim: keeps the OLD /category_service_intervals
# wire contract (service_type_id, distance_interval_meters,
# time_interval_days) working against the new CategoryServiceRequirement +
# ServiceRequirementSatisfier schema, so the existing frontend keeps
# working unchanged. Increment 3 replaces this with a real
# CategoryServiceRequirementsController exposing the full requirement/
# satisfier payload.
class CategoryServiceIntervalsController < ApplicationController
  before_action :set_category_service_requirement, only: %i[ show update destroy apply ]

  # GET /category_service_intervals
  def index
    render json: current_user.category_service_requirements.map { |requirement| serialize(requirement) }
  end

  # GET /category_service_intervals/1
  def show
    render json: serialize(@category_service_requirement)
  end

  # POST /category_service_intervals
  # The old contract always sends service_type_id on create -- translated
  # into the requirement's name (same convention the data migration used)
  # plus its sole, position-1 satisfier, both in one transaction so "at
  # least one satisfier" never has a gap.
  def create
    service_type = current_user.service_types.find_by(id: category_service_interval_params[:service_type_id])
    return render_service_type_not_found unless service_type

    requirement = current_user.category_service_requirements.new(
      category: category_service_interval_params[:category],
      name: service_type.name,
      **threshold_attrs(category_service_interval_params),
    )

    ActiveRecord::Base.transaction do
      if requirement.save
        requirement.satisfiers.create!(service_type_id: service_type.id, position: 1)
      end
    end

    if requirement.persisted?
      render json: serialize(requirement), status: :created
    else
      render json: requirement.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /category_service_intervals/1
  # The frontend never sends service_type_id on update -- only
  # distance_interval_meters/time_interval_days/category change here. A
  # sent service_type_id has no effect on the row (the satisfier it would
  # have changed isn't touched by this shim), but is still checked for
  # ownership, same defensive 404 the old contract gave.
  def update
    return render_service_type_not_found unless owns_referenced_service_type?(category_service_interval_params)

    if @category_service_requirement.update(threshold_attrs(category_service_interval_params))
      render json: serialize(@category_service_requirement)
    else
      render json: @category_service_requirement.errors, status: :unprocessable_content
    end
  end

  # DELETE /category_service_intervals/1
  # Cascades to delete every linked ComponentServiceRequirement (see the
  # has_many :component_service_requirements, dependent: :destroy
  # association) -- custom component requirements are untouched.
  def destroy
    @category_service_requirement.destroy!
    head :no_content
  end

  # POST /category_service_intervals/1/apply
  # Creates an enabled, linked ComponentServiceRequirement for each given
  # component that doesn't already have a linked row for this template --
  # adding a template never silently attaches to existing components, this
  # is the explicit, deliberate action that does.
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

    def category_service_interval_params
      params.require(:category_service_interval).permit(
        :category, :service_type_id, :distance_interval_meters, :time_interval_days,
      )
    end

    # Only touches a column whose old-contract key was actually sent --
    # an explicit null still clears it (e.g. removing a distance
    # threshold while keeping a time one), but an omitted key leaves the
    # existing value alone on a partial update.
    def threshold_attrs(attrs)
      result = {}
      result[:category] = attrs[:category] if attrs.key?(:category)
      result[:distance_meters] = attrs[:distance_interval_meters] if attrs.key?(:distance_interval_meters)
      if attrs.key?(:time_interval_days)
        result[:calendar_amount] = attrs[:time_interval_days]
        result[:calendar_unit] = attrs[:time_interval_days].present? ? "day" : nil
      end
      result
    end

    def owns_referenced_service_type?(attrs)
      !attrs.key?(:service_type_id) || current_user.service_types.exists?(attrs[:service_type_id])
    end

    def render_service_type_not_found
      render json: { base: ["Service type not found"] }, status: :not_found
    end

    # Old JSON shape: service_type_id/distance_interval_meters/
    # time_interval_days derived from the requirement's name/position-1
    # satisfier/day-unit calendar amount.
    def serialize(requirement)
      satisfier = requirement.satisfiers.order(:position).first
      requirement.as_json(only: %i[ id user_id category created_at updated_at ]).merge(
        service_type_id: satisfier&.service_type_id,
        distance_interval_meters: requirement.distance_meters,
        time_interval_days: requirement.calendar_unit == "day" ? requirement.calendar_amount : nil,
      )
    end
end
