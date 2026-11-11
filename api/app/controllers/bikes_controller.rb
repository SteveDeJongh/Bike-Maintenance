class BikesController < ApplicationController
  before_action :set_bike, only: %i[ show update destroy component_setup rides serviceable_components ]

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
    payload = @bike.as_json(
      methods: %i[ total_distance total_moving_time first_ride_on last_ride_on
                   average_power total_elevation_gain installed_components_count ],
      include: {
        bike_component_slots: {},
        component_assignments: {
          methods: %i[ distance_meters moving_time elevation_gain average_power ],
          include: {
            component: {
              methods: %i[ total_distance total_moving_time total_elevation_gain average_power ],
            },
          },
        },
      },
    )

    statuses = Maintenance::IntervalStatus.worst_status_by_component(current_user)
    payload["component_assignments"].each do |assignment|
      assignment["component"]["service_status"] = statuses[assignment["component"]["id"]]
    end

    render json: payload
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

  # POST /bikes/1/component_setup
  # Batched version of the manual "track a slot -> create a component ->
  # install it" flow -- all or nothing. Every existing model validation
  # (overlap rules, same-user checks) applies unchanged; a row that already
  # has a slot fails honestly on the real uniqueness validation rather than
  # being silently skipped or reused. Each row carries its own ride_context
  # (rather than always "both") so a category that
  # allows_multiple_assignments can be set up as two rows -- one
  # outdoor_only, one indoor_only -- in the same batch; BikeComponentSlot's
  # own ride_context_requires_allows_multiple_assignments validation is what
  # actually rejects a split context for a category that doesn't allow it,
  # not anything special-cased here.
  def component_setup
    rows = Array(params[:components])
    row_errors = {}

    ActiveRecord::Base.transaction do
      rows.each_with_index do |row, index|
        category = row[:category]
        ride_context = row[:ride_context].presence || "both"

        slot = @bike.bike_component_slots.new(category: category, ride_context: ride_context)
        unless slot.save
          row_errors[index] = slot.errors
          raise ActiveRecord::Rollback
        end

        component = current_user.components.new(
          label: row[:label], category: category, acquired_on: params[:installed_on],
          brand: row[:brand], model: row[:model], notes: row[:notes],
        )
        unless component.save
          row_errors[index] = component.errors
          raise ActiveRecord::Rollback
        end

        assignment = ComponentAssignment.new(
          component: component, bike: @bike, started_at: params[:installed_on], ride_context: ride_context,
        )
        unless assignment.save
          row_errors[index] = assignment.errors
          raise ActiveRecord::Rollback
        end
      end
    end

    if row_errors.empty?
      render json: @bike.reload.as_json(include: :bike_component_slots), status: :created
    else
      render json: { row_errors: row_errors }, status: :unprocessable_content
    end
  end

  # GET /bikes/1/rides
  def rides
    result = Bikes::RideHistory.call(
      @bike,
      type: params[:type],
      order: params[:order],
      page: params[:page],
      per_page: params[:per_page],
    )

    counted_toward = Maintenance::CountedTowardQuery.call(current_user, activity_ids: result.rides.map(&:id))

    render json: {
      rides: result.rides.map { |ride|
        Strava::RideSerialization.base_json(ride).merge(
          cumulative_distance_meters: result.cumulative_by_id[ride.id],
          counted_toward: counted_toward[ride.id] || [],
        )
      },
      meta: {
        total_count: result.total_count,
        total_distance_meters: result.total_distance_meters,
        page: result.page,
        per_page: result.per_page,
        next_page: result.next_page,
      },
    }
  end

  # GET /bikes/1/serviceable_components?at=<iso8601>
  # "What's serviceable on this bike at `at`?" for the batch service logger's
  # component picker -- mounted components, plus ones most recently taken off
  # this bike (as opposed to another bike) by `at`. Shares
  # Bikes::ServiceableComponents with ServiceSessionsController#create's own
  # eligibility check, so the two can never disagree about what's offered vs.
  # what's accepted. Interval status is batched once (Maintenance::IntervalStatus.for_user,
  # not per component) and computed as of *now*, not `at` -- it's there to help
  # the user choose, not a record of what it was on that date.
  def serviceable_components
    at = params[:at].present? ? (Time.zone.parse(params[:at]) || Time.current) : Time.current
    result = Bikes::ServiceableComponents.call(@bike, at: at)
    statuses_by_component = Maintenance::IntervalStatus.for_user(current_user)
      .group_by { |status| status.component_service_interval.component_id }

    render json: {
      mounted: result.mounted.map { |c| serviceable_component_json(c, statuses_by_component[c.id] || []) },
      off_bike: result.off_bike.map { |c| serviceable_component_json(c, statuses_by_component[c.id] || []) },
    }
  end

  private
    def set_bike
      @bike = current_user.bikes.find(params[:id])
    end

    def serviceable_component_json(component, statuses)
      component.as_json(only: %i[ id label category ]).merge(
        service_intervals: statuses.map { |status| interval_status_json(status) },
      )
    end

    def interval_status_json(status)
      interval = status.component_service_interval
      {
        id: interval.id,
        service_type_id: interval.service_type_id,
        service_type_name: interval.service_type.name,
        status: status.status,
        driving_dimension: status.driving_dimension,
        distance_remaining_meters: status.distance_remaining_meters,
        days_remaining: status.days_remaining,
      }
    end

    def bike_params
      params.require(:bike).permit(:name, :make, :model, :strava_gear_id, :acquired_on, :retired_on, :bike_type_id)
    end
end
