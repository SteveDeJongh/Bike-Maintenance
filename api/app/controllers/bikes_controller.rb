class BikesController < ApplicationController
  before_action :set_bike, only: %i[ show update destroy component_setup rides serviceable_components ]

  # Mounted components shown on a Bikes-list card.
  MOST_WORN_LIMIT = 3

  # GET /bikes -- every bike with its stats, plus what the Bikes page's
  # cards and tiles need: rides, this year's distance (?tz= the viewer's
  # zone), the last ride's sport type, status counts and the most worn
  # mounted components. Every stat is one grouped query across all bikes
  # and statuses are computed once (worst_result_by_component), so the
  # query count doesn't grow with the number of bikes.
  def index
    @bikes = current_user.bikes
    activities = current_user.strava_activities
    distances = activities.group(:bike_id).sum(:distance_meters)
    times = activities.group(:bike_id).sum(:moving_time)
    first_rides = activities.group(:bike_id).minimum(:moved_at)
    last_rides = activities.group(:bike_id).maximum(:moved_at)
    elevations = activities.group(:bike_id).sum(:total_elevation_gain)
    ride_counts = activities.group(:bike_id).count
    average_powers = activities
      .where(device_watts: true)
      .group(:bike_id)
      .average(:average_watts)
    this_year_distances = activities.where(moved_at: year_start..).group(:bike_id).sum(:distance_meters)
    last_ride_types = activities.where.not(bike_id: nil)
      .select("DISTINCT ON (bike_id) bike_id, activity_type").order(:bike_id, moved_at: :desc, id: :desc)
      .to_h { |activity| [ activity.bike_id, activity.activity_type ] }

    open_assignments = current_user.component_assignments.where(ended_at: nil).includes(:component).group_by(&:bike_id)
    worst = Maintenance::RequirementStatus.worst_result_by_component(current_user)
    most_worn_by_bike = open_assignments.transform_values { |assignments| most_worn(assignments, worst) }
    lifetime = Maintenance::LifetimeDistanceQuery.call(
      current_user,
      component_ids: most_worn_by_bike.values.flatten.reject { |a| worst[a.component_id] }.map(&:component_id),
    )

    render json: @bikes.map { |bike|
      assignments = open_assignments[bike.id] || []
      bike.as_json.merge(
        total_distance: distances[bike.id] || 0,
        total_moving_time: times[bike.id] || 0,
        first_ride_on: first_rides[bike.id],
        last_ride_on: last_rides[bike.id],
        average_power: average_powers[bike.id]&.round,
        total_elevation_gain: elevations[bike.id] || 0,
        installed_components_count: assignments.size,
        ride_count: ride_counts[bike.id] || 0,
        distance_this_year: this_year_distances[bike.id] || 0,
        last_ride_activity_type: last_ride_types[bike.id],
        status_counts: status_counts(assignments, worst),
        most_worn: (most_worn_by_bike[bike.id] || []).map { |assignment| worn_json(assignment, worst, lifetime) },
      )
    }
  end

  # GET /bikes/1 -- the bike with its stats, slots and assignments, plus
  # (?tz= the viewer's zone) ride_count, distance_this_year, the linked
  # Strava gear and `overview`: the bike page's Up next (Maintenance::UpNext
  # scoped to this bike) and its mounted/off-bike components for the
  # rotation cards (Bikes::CardComponents) -- the same builders Home uses.
  # Statuses are computed once for all of it.
  def show
    results = Maintenance::RequirementStatus.for_user(current_user)
    worst = Maintenance::RequirementStatus.worst_result_by_component(current_user, results: results)

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

    payload["component_assignments"].each do |assignment|
      assignment["component"]["service_status"] = worst[assignment["component"]["id"]]&.status
    end

    rides = current_user.strava_activities.where(bike_id: @bike.id)
    gear = @bike.strava_gear_id.presence && current_user.strava_gears.find_by(strava_gear_id: @bike.strava_gear_id)
    up_next = Maintenance::UpNext.new(
      results: results,
      bikes_by_component: Component.current_bikes_by_component(current_user),
      credential: current_user.strava_credential,
    )

    render json: payload.merge(
      ride_count: rides.count,
      distance_this_year: rides.where(moved_at: year_start..).sum(:distance_meters),
      strava_gear: @bike.strava_gear_id.presence && { gear_id: @bike.strava_gear_id, name: gear&.name },
      overview: {
        attention: up_next.attention(bike_id: @bike.id),
        upcoming: up_next.upcoming(bike_id: @bike.id),
        **Bikes::CardComponents.call(current_user, bikes: [ @bike ], worst_results: worst)[@bike.id],
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
  # what's accepted. Interval status is batched once (Maintenance::RequirementStatus.for_user,
  # not per component) and computed as of *now*, not `at` -- it's there to help
  # the user choose, not a record of what it was on that date.
  def serviceable_components
    at = params[:at].present? ? (Time.zone.parse(params[:at]) || Time.current) : Time.current
    result = Bikes::ServiceableComponents.call(@bike, at: at)
    statuses_by_component = Maintenance::RequirementStatus.for_user(current_user)
      .group_by { |status| status.component_service_requirement.component_id }

    render json: {
      mounted: result.mounted.map { |c| serviceable_component_json(c, statuses_by_component[c.id] || []) },
      off_bike: result.off_bike.map { |c| serviceable_component_json(c, statuses_by_component[c.id] || []) },
    }
  end

  private

  def viewer_zone
    (params[:tz].present? && ActiveSupport::TimeZone[params[:tz]]) || Time.zone
  end

  # Local Jan 1 from Ruby's zone data, passed to SQL as a UTC instant.
  def year_start
    Time.current.in_time_zone(viewer_zone).beginning_of_year.utc
  end

  # Mounted components by their worst status, the same rule as the Home
  # card's chip (bikeStatusCounts): each component counts once.
  def status_counts(assignments, worst)
    statuses = assignments.map { |assignment| worst[assignment.component_id]&.status }
    { due: statuses.count("due"), warning: statuses.count("warning") }
  end

  # The most worn first; a component with no enabled requirement sorts
  # after every one that has one, then by label.
  def most_worn(assignments, worst)
    assignments
      .sort_by { |a| [ -(worst[a.component_id]&.fraction_used || -1), a.component.label.to_s ] }
      .first(MOST_WORN_LIMIT)
  end

  # Maintenance::WearFields (the shape the ride modal uses), plus the
  # lifetime distance only when there's no requirement to show wear for.
  def worn_json(assignment, worst, lifetime)
    component = assignment.component
    result = worst[component.id]
    { component_id: component.id, label: component.label, category: component.category }
      .merge(Maintenance::WearFields.call(result))
      .merge(total_distance_meters: result ? nil : lifetime[component.id])
  end
    def set_bike
      @bike = current_user.bikes.find(params[:id])
    end

    def serviceable_component_json(component, statuses)
      component.as_json(only: %i[ id label category ]).merge(
        service_requirements: statuses.map { |status| interval_status_json(status) },
      )
    end

    def interval_status_json(status)
      requirement = status.component_service_requirement
      effective = requirement.effective
      {
        id: requirement.id,
        requirement_name: effective[:name],
        satisfiers: effective[:satisfiers],
        status: status.status,
        driving_dimension: status.driving_dimension,
        distance_remaining_meters: status.distance_remaining_meters,
        moving_time_remaining_seconds: status.moving_time_remaining_seconds,
        days_remaining: status.days_remaining,
        setting_event: setting_event_json(status),
      }
    end

    # {id:, service_type_name:, performed_at:} | nil -- same shape as the
    # other three consumers' own helpers of the same name.
    def setting_event_json(status)
      event = status.setting_event
      return nil unless event

      { id: event.id, service_type_name: event.service_type.name, performed_at: event.performed_at }
    end

    def bike_params
      params.require(:bike).permit(:name, :make, :model, :strava_gear_id, :acquired_on, :retired_on, :bike_type_id)
    end
end
