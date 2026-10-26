class ComponentServiceIntervalsController < ApplicationController
  before_action :set_component_service_interval, only: %i[ show update destroy ]

  # GET /component_service_intervals?component_id=1
  def index
    scope = ComponentServiceInterval.joins(:component).where(components: { user_id: current_user.id })
    scope = scope.where(component_id: params[:component_id]) if params[:component_id].present?
    render json: scope
  end

  # GET /component_service_intervals/1
  def show
    render json: @component_service_interval
  end

  # POST /component_service_intervals
  def create
    component = current_user.components.find(component_service_interval_params[:component_id])
    @component_service_interval = component.component_service_intervals.new(interval_attrs(component_service_interval_params))

    if @component_service_interval.save
      render json: @component_service_interval, status: :created
    else
      render json: @component_service_interval.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /component_service_intervals/1
  # Covers enable/disable and value overrides.
  def update
    if @component_service_interval.update(interval_attrs(component_service_interval_params.except(:component_id)))
      render json: @component_service_interval
    else
      render json: @component_service_interval.errors, status: :unprocessable_content
    end
  end

  # DELETE /component_service_intervals/1
  # A real removal, not a disable -- the component loses this category
  # default entirely until deliberately re-added via apply_defaults.
  def destroy
    @component_service_interval.destroy!
    head :no_content
  end

  # POST /component_service_intervals/apply_defaults
  # "+ Add from category defaults" -- create a linked interval for each
  # given template not already represented on this component.
  def apply_defaults
    component = current_user.components.find(params[:component_id])
    template_ids = Array(params[:category_service_interval_ids]).map(&:to_i)
    templates = CategoryServiceInterval.where(id: template_ids, user_id: current_user.id, category: component.category)

    templates.find_each do |template|
      next if component.component_service_intervals.exists?(service_type_id: template.service_type_id)

      component.component_service_intervals.create!(category_service_interval: template, service_type_id: template.service_type_id)
    end

    render json: component.component_service_intervals.reload
  end

  private
    def set_component_service_interval
      @component_service_interval = ComponentServiceInterval.joins(:component)
        .where(components: { user_id: current_user.id }).find(params[:id])
    end

    def component_service_interval_params
      params.require(:component_service_interval).permit(
        :component_id, :category_service_interval_id, :service_type_id,
        :distance_interval_meters, :time_interval_days, :enabled,
      )
    end

    # Convenience: a linked row's service_type always comes from its
    # template, so it doesn't need to be sent separately when creating one.
    def interval_attrs(attrs)
      return attrs if attrs[:category_service_interval_id].blank? || attrs[:service_type_id].present?

      template = current_user.category_service_intervals.find(attrs[:category_service_interval_id])
      attrs.merge(service_type_id: template.service_type_id)
    end
end
