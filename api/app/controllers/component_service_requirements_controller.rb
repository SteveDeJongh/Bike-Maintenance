class ComponentServiceRequirementsController < ApplicationController
  include RequirementSerialization

  before_action :set_component_service_requirement, only: %i[ show update destroy ]

  # GET /component_service_requirements?component_id=1
  def index
    scope = ComponentServiceRequirement.joins(:component).where(components: { user_id: current_user.id })
    scope = scope.where(component_id: params[:component_id]) if params[:component_id].present?
    render json: scope.map { |requirement| serialize_requirement(requirement) }
  end

  # GET /component_service_requirements/1
  def show
    render json: serialize_requirement(@component_service_requirement)
  end

  # POST /component_service_requirements
  # Linked (category_service_requirement_id present): no satisfiers of its
  # own -- rejected outright if the request includes any, same message the
  # model validation itself would give. Custom (blank): satisfiers are
  # created inline, in one transaction, same as the category requirement's
  # own create.
  def create
    component = current_user.components.find(requirement_params[:component_id])
    linked = requirement_params[:category_service_requirement_id].present?
    satisfiers = Array(params[:satisfiers])

    if linked && satisfiers.present?
      return render json: { base: ["Linked requirements use their template's satisfiers -- edit the category default instead"] },
        status: :unprocessable_content
    end

    requirement = component.component_service_requirements.new(requirement_params.except(:component_id))
    errors = nil

    ActiveRecord::Base.transaction do
      unless requirement.save
        errors = requirement.errors
        raise ActiveRecord::Rollback
      end

      next if linked

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

  # PATCH/PUT /component_service_requirements/1
  # Covers enable/disable and value/ride_filter overrides -- not
  # category_service_requirement_id (linked vs custom is fixed at create)
  # and not satisfiers (go through the nested satisfiers endpoints, and
  # only ever for a custom row -- a linked row has none of its own).
  def update
    if @component_service_requirement.update(requirement_params.except(:component_id, :category_service_requirement_id))
      render json: serialize_requirement(@component_service_requirement)
    else
      render json: @component_service_requirement.errors, status: :unprocessable_content
    end
  end

  # DELETE /component_service_requirements/1
  # A real removal, not a disable -- the component loses this category
  # default entirely until deliberately re-added via apply_defaults.
  def destroy
    @component_service_requirement.destroy!
    head :no_content
  end

  # POST /component_service_requirements/apply_defaults
  # "+ Add from category defaults" -- create a linked requirement for each
  # given template not already represented (linked) on this component.
  def apply_defaults
    component = current_user.components.find(params[:component_id])
    template_ids = Array(params[:category_service_requirement_ids]).map(&:to_i)
    templates = CategoryServiceRequirement.where(id: template_ids, user_id: current_user.id, category: component.category)

    templates.find_each do |template|
      next if component.component_service_requirements.exists?(category_service_requirement_id: template.id)

      component.component_service_requirements.create!(category_service_requirement: template)
    end

    render json: component.component_service_requirements.reload.map { |requirement| serialize_requirement(requirement) }
  end

  private
    def set_component_service_requirement
      @component_service_requirement = ComponentServiceRequirement.joins(:component)
        .where(components: { user_id: current_user.id }).find(params[:id])
    end

    def requirement_params
      params.require(:component_service_requirement).permit(
        :component_id, :category_service_requirement_id, :name,
        :distance_meters, :moving_time_seconds, :calendar_amount, :calendar_unit, :ride_filter, :enabled,
      )
    end

    def satisfier_attrs(attrs)
      attrs.permit(
        :service_type_id, :allowance_distance_meters, :allowance_moving_time_seconds,
        :allowance_calendar_amount, :allowance_calendar_unit,
      )
    end
end
