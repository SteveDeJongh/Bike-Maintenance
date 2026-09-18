class ComponentsController < ApplicationController
  before_action :set_component, only: %i[ show update destroy ]

  # GET /components
  def index
    @components = Component.all
    render json: @components
  end

  # GET /components/1
  def show
    render json: @component.as_json(methods: %i[ total_distance distance_since_wax ])
  end

  # POST /components
  def create
    @component = Component.new(component_params)

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
      @component = Component.find(params[:id])
    end

    def component_params
      params.require(:component).permit(:label, :category, :acquired_on, :retired_on)
    end
end
