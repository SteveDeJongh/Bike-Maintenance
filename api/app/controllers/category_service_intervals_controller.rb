class CategoryServiceIntervalsController < ApplicationController
  before_action :set_category_service_interval, only: %i[ show update destroy apply ]

  # GET /category_service_intervals
  def index
    render json: current_user.category_service_intervals
  end

  # GET /category_service_intervals/1
  def show
    render json: @category_service_interval
  end

  # POST /category_service_intervals
  def create
    @category_service_interval = current_user.category_service_intervals.new(category_service_interval_params)

    if @category_service_interval.save
      render json: @category_service_interval, status: :created
    else
      render json: @category_service_interval.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /category_service_intervals/1
  def update
    if @category_service_interval.update(category_service_interval_params)
      render json: @category_service_interval
    else
      render json: @category_service_interval.errors, status: :unprocessable_content
    end
  end

  # DELETE /category_service_intervals/1
  # Cascades to delete every linked ComponentServiceInterval (see the
  # has_many :component_service_intervals, dependent: :destroy association)
  # -- custom component intervals are untouched.
  def destroy
    @category_service_interval.destroy!
    head :no_content
  end

  # POST /category_service_intervals/1/apply
  # Creates an enabled, linked ComponentServiceInterval for each given
  # component that doesn't already have one for this template's service
  # type -- adding a template never silently attaches to existing
  # components, this is the explicit, deliberate action that does.
  def apply
    component_ids = Array(params[:component_ids]).map(&:to_i)
    components = current_user.components.where(id: component_ids, category: @category_service_interval.category)

    components.find_each do |component|
      next if component.component_service_intervals.exists?(service_type_id: @category_service_interval.service_type_id)

      component.component_service_intervals.create!(
        category_service_interval: @category_service_interval,
        service_type_id: @category_service_interval.service_type_id,
      )
    end

    head :no_content
  end

  private
    def set_category_service_interval
      @category_service_interval = current_user.category_service_intervals.find(params[:id])
    end

    def category_service_interval_params
      params.require(:category_service_interval).permit(
        :category, :service_type_id, :distance_interval_meters, :time_interval_days,
      )
    end
end
