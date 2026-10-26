class ComponentsController < ApplicationController
  before_action :set_component, only: %i[ show update destroy ]

  # GET /components
  def index
    @components = current_user.components
    render json: @components
  end

  # GET /components/1
  # distance_since_wax here is a transitional computation, not a model
  # method -- ComponentDetail.tsx's hardcoded chain/wax display is being
  # replaced by the general service-intervals UI (increment 6), so this
  # exists only to keep that field working in the meantime.
  def show
    wax_type = current_user.service_types.find_by(name: "wax")
    distance_since_wax = wax_type ? @component.distance_since(service_type: wax_type) : @component.total_distance

    render json: @component.as_json(methods: %i[ total_distance ]).merge(distance_since_wax: distance_since_wax)
  end

  # POST /components
  def create
    @component = current_user.components.new(component_params)

    if @component.save
      render json: @component, status: :created
    else
      render json: @component.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /components/1
  def update
    if @component.update(component_params)
      render json: @component
    else
      render json: @component.errors, status: :unprocessable_content
    end
  end

  # DELETE /components/1
  def destroy
    @component.destroy!
    head :no_content
  end

  private
    def set_component
      @component = current_user.components.find(params[:id])
    end

    def component_params
      params.require(:component).permit(:label, :category, :acquired_on, :retired_on)
    end
end
