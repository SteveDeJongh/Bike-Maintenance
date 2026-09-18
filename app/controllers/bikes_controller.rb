class BikesController < ApplicationController
  before_action :set_bike, only: %i[ show update destroy ]

  # GET /bikes
  def index
    @bikes = Bike.all
    render json: @bikes
  end

  # GET /bikes/1
  def show
    render json: @bike
  end

  # POST /bikes
  def create
    @bike = Bike.new(bike_params)

    if @bike.save
      render json: @bike, status: :created
    else
      render json: @bike.errors, status: :unprocessable_content
    end
  end

  # PATCH/PUT /bikes/1
  def update
    if @bike.update(bike_params)
      render json: @bike
    else
      render json: @bike.errors, status: :unprocessable_content
    end
  end

  # DELETE /bikes/1
  def destroy
    @bike.destroy!
    head :no_content
  end

  private
    def set_bike
      @bike = Bike.find(params[:id])
    end

    def bike_params
      params.require(:bike).permit(:name, :make, :model, :strava_gear_id, :retired_on)
    end
end
