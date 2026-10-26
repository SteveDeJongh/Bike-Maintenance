class ServiceTypesController < ApplicationController
  before_action :set_service_type, only: %i[ show update destroy ]

  # GET /service_types
  def index
    render json: current_user.service_types
  end

  # GET /service_types/1
  def show
    render json: @service_type
  end

  # POST /service_types
  def create
    @service_type = current_user.service_types.new(service_type_params)

    if @service_type.save
      render json: @service_type, status: :created
    else
      render json: @service_type.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /service_types/1
  def update
    if @service_type.update(service_type_params)
      render json: @service_type
    else
      render json: @service_type.errors, status: :unprocessable_content
    end
  end

  # DELETE /service_types/1
  def destroy
    if @service_type.destroy
      head :no_content
    else
      render json: @service_type.errors, status: :unprocessable_content
    end
  end

  private
    def set_service_type
      @service_type = current_user.service_types.find(params[:id])
    end

    def service_type_params
      params.require(:service_type).permit(:name)
    end
end
