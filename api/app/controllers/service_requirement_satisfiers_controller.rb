class ServiceRequirementSatisfiersController < ApplicationController
  include RequirementSerialization

  before_action :set_owner, only: %i[ create reorder ]
  before_action :set_satisfier, only: %i[ update destroy ]

  # POST /category_service_requirements/:category_service_requirement_id/satisfiers
  # POST /component_service_requirements/:component_service_requirement_id/satisfiers
  # A linked ComponentServiceRequirement has no satisfiers of its own --
  # rejected with the same message the model validation itself would give.
  def create
    if @owner.is_a?(ComponentServiceRequirement) && @owner.linked?
      return render json: { base: ["Linked requirements use their template's satisfiers -- edit the category default instead"] },
        status: :unprocessable_content
    end

    position = satisfier_params[:position].presence || (@owner.satisfiers.maximum(:position).to_i + 1)
    satisfier = @owner.satisfiers.new(satisfier_params.except(:position).merge(position: position))

    if satisfier.save
      render json: serialize_satisfier(satisfier), status: :created
    else
      render json: satisfier.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /service_requirement_satisfiers/1
  # Covers which service type satisfies this requirement and its allowance
  # overrides -- not position (see #reorder) and not which requirement owns
  # it.
  def update
    if @satisfier.update(satisfier_params.except(:position))
      render json: serialize_satisfier(@satisfier)
    else
      render json: @satisfier.errors, status: :unprocessable_content
    end
  end

  # DELETE /service_requirement_satisfiers/1
  # A direct removal -- unlike the owner's own cascading destroy, this is
  # exactly where "can't remove the last satisfier" is meant to fire.
  def destroy
    if @satisfier.destroy
      head :no_content
    else
      render json: @satisfier.errors, status: :unprocessable_content
    end
  end

  # PATCH /category_service_requirements/:category_service_requirement_id/satisfiers/reorder
  # PATCH /component_service_requirements/:component_service_requirement_id/satisfiers/reorder
  # { satisfier_ids: [id, id, ...] } in the new order -- position 1 becomes
  # the default service type for "Log service"/"Select all due and
  # warning". Must be exactly the owner's current satisfier ids, or the
  # whole request is rejected rather than silently reordering a subset.
  def reorder
    satisfier_ids = Array(params[:satisfier_ids]).map(&:to_i)
    current_ids = @owner.satisfiers.pluck(:id)

    if satisfier_ids.sort != current_ids.sort
      return render json: { base: ["satisfier_ids must match this requirement's current satisfiers exactly"] },
        status: :unprocessable_content
    end

    ActiveRecord::Base.transaction do
      satisfier_ids.each_with_index { |id, index| @owner.satisfiers.where(id: id).update_all(position: index + 1) }
    end

    render json: @owner.satisfiers.order(:position).map { |satisfier| serialize_satisfier(satisfier) }
  end

  private
    def set_owner
      if params[:category_service_requirement_id].present?
        @owner = current_user.category_service_requirements.find(params[:category_service_requirement_id])
      else
        @owner = ComponentServiceRequirement.joins(:component)
          .where(components: { user_id: current_user.id }).find(params[:component_service_requirement_id])
      end
    end

    def set_satisfier
      @satisfier = ServiceRequirementSatisfier.find(params[:id])
      owner = @satisfier.owner
      owner_user_id = owner.is_a?(CategoryServiceRequirement) ? owner.user_id : owner.component.user_id
      raise ActiveRecord::RecordNotFound unless owner_user_id == current_user.id
    end

    def satisfier_params
      params.permit(
        :service_type_id, :position, :allowance_distance_meters, :allowance_moving_time_seconds,
        :allowance_calendar_amount, :allowance_calendar_unit,
      )
    end
end
