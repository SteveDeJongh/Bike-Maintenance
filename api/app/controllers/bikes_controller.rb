class BikesController < ApplicationController
  before_action :set_bike, only: %i[ show update destroy ]

  # GET /bikes
  def index
    @bikes = current_user.bikes
    distances = current_user.strava_activities.group(:bike_id).sum(:distance_meters)
    times = current_user.strava_activities.group(:bike_id).sum(:moving_time)
    first_rides = current_user.strava_activities.group(:bike_id).minimum(:moved_at)

    render json: @bikes.map { |bike|
      bike.as_json.merge(
        total_distance: distances[bike.id] || 0,
        total_moving_time: times[bike.id] || 0,
        first_ride_on: first_rides[bike.id],
      )
    }
  end

  # GET /bikes/1
  def show
    render json: @bike.as_json(methods: %i[ total_distance total_moving_time first_ride_on ])
  end

  # POST /bikes
  def create
    @bike = current_user.bikes.new(bike_params)

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
      @bike = current_user.bikes.find(params[:id])
    end

    def bike_params
      params.require(:bike).permit(:name, :make, :model, :strava_gear_id, :retired_on)
    end
end
