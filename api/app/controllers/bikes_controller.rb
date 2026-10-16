class BikesController < ApplicationController
  before_action :set_bike, only: %i[ show update destroy ]

  # GET /bikes
  def index
    @bikes = current_user.bikes
    distances = current_user.strava_activities.group(:bike_id).sum(:distance_meters)
    times = current_user.strava_activities.group(:bike_id).sum(:moving_time)
    first_rides = current_user.strava_activities.group(:bike_id).minimum(:moved_at)
    last_rides = current_user.strava_activities.group(:bike_id).maximum(:moved_at)
    elevations = current_user.strava_activities.group(:bike_id).sum(:total_elevation_gain)
    average_powers = current_user.strava_activities
      .where(device_watts: true)
      .group(:bike_id)
      .average(:average_watts)
    installed_counts = current_user.component_assignments.where(ended_at: nil).group(:bike_id).count

    render json: @bikes.map { |bike|
      bike.as_json.merge(
        total_distance: distances[bike.id] || 0,
        total_moving_time: times[bike.id] || 0,
        first_ride_on: first_rides[bike.id],
        last_ride_on: last_rides[bike.id],
        average_power: average_powers[bike.id]&.round,
        total_elevation_gain: elevations[bike.id] || 0,
        installed_components_count: installed_counts[bike.id] || 0,
      )
    }
  end

  # GET /bikes/1
  def show
    render json: @bike.as_json(
      methods: %i[ total_distance total_moving_time first_ride_on last_ride_on
                   average_power total_elevation_gain installed_components_count ],
      include: {
        bike_component_slots: {},
        component_assignments: {
          methods: %i[ distance_meters moving_time elevation_gain average_power ],
          include: {
            component: {
              methods: %i[ total_distance total_moving_time total_elevation_gain
                            average_power distance_since_wax ],
            },
          },
        },
      },
    )
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
