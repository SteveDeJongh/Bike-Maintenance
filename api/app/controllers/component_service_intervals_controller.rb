# Increment-1 compatibility shim: keeps the OLD /component_service_intervals
# wire contract (service_type_id, category_service_interval_id,
# distance_interval_meters, time_interval_days, enabled) working against
# the new ComponentServiceRequirement + ServiceRequirementSatisfier schema.
# Increment 3 replaces this with a real ComponentServiceRequirementsController
# exposing the full requirement/satisfier payload.
class ComponentServiceIntervalsController < ApplicationController
  before_action :set_component_service_requirement, only: %i[ show update destroy ]

  # GET /component_service_intervals?component_id=1
  def index
    scope = ComponentServiceRequirement.joins(:component).where(components: { user_id: current_user.id })
    scope = scope.where(component_id: params[:component_id]) if params[:component_id].present?
    render json: scope.map { |requirement| serialize(requirement) }
  end

  # GET /component_service_intervals/1
  def show
    render json: serialize(@component_service_requirement)
  end

  # POST /component_service_intervals
  # Linked (category_service_interval_id present): no satisfier of its
  # own -- it inherits the template's. Custom (blank): the old contract's
  # service_type_id becomes both the row's name (same convention the data
  # migration used) and its sole, position-1 satisfier, created in the
  # same transaction so "at least one satisfier" never has a gap.
  def create
    return render_service_type_not_found unless owns_referenced_service_type?(component_service_interval_params)
    return render_category_service_requirement_not_found unless owns_referenced_category_service_requirement?(component_service_interval_params)

    component = current_user.components.find(component_service_interval_params[:component_id])
    linked = component_service_interval_params[:category_service_interval_id].present?
    service_type = current_user.service_types.find_by(id: component_service_interval_params[:service_type_id])

    requirement = component.component_service_requirements.new(
      category_service_requirement_id: component_service_interval_params[:category_service_interval_id],
      name: linked ? nil : service_type&.name,
      **threshold_attrs(component_service_interval_params),
    )

    ActiveRecord::Base.transaction do
      if requirement.save
        requirement.satisfiers.create!(service_type_id: service_type.id, position: 1) unless linked
      end
    end

    if requirement.persisted?
      render json: serialize(requirement), status: :created
    else
      render json: requirement.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /component_service_intervals/1
  # Covers enable/disable and value overrides -- the frontend never sends
  # service_type_id/category_service_interval_id on update.
  def update
    attrs = threshold_attrs(component_service_interval_params)
    attrs[:enabled] = component_service_interval_params[:enabled] if component_service_interval_params.key?(:enabled)

    if @component_service_requirement.update(attrs)
      render json: serialize(@component_service_requirement)
    else
      render json: @component_service_requirement.errors, status: :unprocessable_content
    end
  end

  # DELETE /component_service_intervals/1
  # A real removal, not a disable -- the component loses this category
  # default entirely until deliberately re-added via apply_defaults.
  def destroy
    @component_service_requirement.destroy!
    head :no_content
  end

  # POST /component_service_intervals/apply_defaults
  # "+ Add from category defaults" -- create a linked requirement for each
  # given template not already represented (linked) on this component.
  def apply_defaults
    component = current_user.components.find(params[:component_id])
    template_ids = Array(params[:category_service_interval_ids]).map(&:to_i)
    templates = CategoryServiceRequirement.where(id: template_ids, user_id: current_user.id, category: component.category)

    templates.find_each do |template|
      next if component.component_service_requirements.exists?(category_service_requirement_id: template.id)

      component.component_service_requirements.create!(category_service_requirement: template)
    end

    render json: component.component_service_requirements.reload.map { |requirement| serialize(requirement) }
  end

  private
    def set_component_service_requirement
      @component_service_requirement = ComponentServiceRequirement.joins(:component)
        .where(components: { user_id: current_user.id }).find(params[:id])
    end

    def component_service_interval_params
      params.require(:component_service_interval).permit(
        :component_id, :category_service_interval_id, :service_type_id,
        :distance_interval_meters, :time_interval_days, :enabled,
      )
    end

    # Only touches a column whose old-contract key was actually sent -- see
    # CategoryServiceIntervalsController's identical helper.
    def threshold_attrs(attrs)
      result = {}
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

    def owns_referenced_category_service_requirement?(attrs)
      # nil means "custom, not linked to a template" (see
      # ComponentServiceRequirement's belongs_to :category_service_requirement,
      # optional: true) -- attrs.key? would be true even for an explicit
      # null, so .blank? is the right test here.
      attrs[:category_service_interval_id].blank? ||
        current_user.category_service_requirements.exists?(attrs[:category_service_interval_id])
    end

    def render_service_type_not_found
      render json: { base: ["Service type not found"] }, status: :not_found
    end

    def render_category_service_requirement_not_found
      render json: { base: ["Category service interval not found"] }, status: :not_found
    end

    # Old JSON shape: service_type_id/distance_interval_meters/
    # time_interval_days/effective_* derived from the requirement's
    # #effective resolution.
    def serialize(requirement)
      effective = requirement.effective
      satisfier = effective[:satisfiers].first

      requirement.as_json(only: %i[ id component_id category_service_requirement_id enabled created_at updated_at ]).merge(
        service_type_id: satisfier && satisfier[:service_type_id],
        distance_interval_meters: requirement.distance_meters,
        time_interval_days: requirement.calendar_unit == "day" ? requirement.calendar_amount : nil,
        effective_distance_interval_meters: effective[:distance_meters],
        effective_time_interval_days: effective[:calendar_unit] == "day" ? effective[:calendar_amount] : nil,
        category_service_interval_id: requirement.category_service_requirement_id,
      )
    end
end
