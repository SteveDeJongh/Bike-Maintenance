class BikeTypesController < ApplicationController
  before_action :set_bike_type, only: %i[ show update destroy ]

  # GET /bike_types
  def index
    render json: current_user.bike_types
  end

  # GET /bike_types/1
  def show
    render json: @bike_type
  end

  # POST /bike_types
  def create
    @bike_type = current_user.bike_types.new(bike_type_params)

    if @bike_type.save
      render json: @bike_type, status: :created
    else
      render json: @bike_type.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /bike_types/1
  # default_categories is replaced as a whole array -- no merging.
  def update
    if @bike_type.update(bike_type_params)
      render json: @bike_type
    else
      render json: @bike_type.errors, status: :unprocessable_content
    end
  end

  # DELETE /bike_types/1
  # Bikes using this type have their bike_type_id nullified (see
  # BikeType#bikes, dependent: :nullify) rather than this being blocked.
  def destroy
    @bike_type.destroy!
    head :no_content
  end

  private
    def set_bike_type
      @bike_type = current_user.bike_types.find(params[:id])
    end

    def bike_type_params
      params.require(:bike_type).permit(:name, default_categories: [])
    end
end
